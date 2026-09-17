import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_ATTEMPTS = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ipv4ToInt(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inRange(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

// RFC 1918/5735/6598 private, loopback, link-local (incl. cloud metadata 169.254.169.254),
// CGNAT, multicast, and reserved ranges — all disallowed as fetch targets.
function isPublicIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  const blocked: [string, number][] = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ];
  return !blocked.some(([base, bits]) => inRange(n, base, bits));
}

function isPublicIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return false;
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return false; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return false; // unique local (fc00::/7)
  if (lower.startsWith('ff')) return false; // multicast
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]);
  return true;
}

function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPublicIpv4(ip);
  if (family === 6) return isPublicIpv6(ip);
  return false;
}

async function assertSafeTarget(target: URL): Promise<void> {
  if (target.protocol !== 'https:') {
    throw new Error('Only https URLs are allowed');
  }
  if (target.port && target.port !== '443') {
    throw new Error('Only default https port is allowed');
  }

  const hostname = target.hostname;
  // Reject literal IP targets and require a resolvable hostname so every
  // target goes through the DNS-based private/metadata IP check below.
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error('Target host is not allowed');
    return;
  }

  const records = await lookup(hostname, { all: true });
  // workerd's node:dns lookup() polyfill can include CNAME chain entries
  // alongside resolved A/AAAA records; isIP() rejects those, so filter to
  // actual IP addresses before validating.
  const ipRecords = records.filter((r) => isIP(r.address) !== 0);
  if (ipRecords.length === 0) throw new Error('Could not resolve host');
  for (const { address } of ipRecords) {
    if (!isPublicIp(address)) throw new Error('Target host is not allowed');
  }
}

export type SafeImageFetchResult =
  | { ok: true; body: Uint8Array<ArrayBuffer>; contentType: string }
  | { ok: false; status: number; message: string };

/**
 * Fetches an image from an external URL with SSRF protections (https-only,
 * public-IP-only after DNS resolution, redirect cap, size cap, image
 * content-type requirement). Shared by the poster-image proxy route and
 * the CID-attachment embedding done at mail send time.
 *
 * workerd's outbound DNS/connect occasionally fails transiently ("Failed to
 * resolve IPv4 addresses") the same way Gmail SMTP does (see mailer.ts) — so
 * a network-level failure is retried a couple of times before giving up.
 */
export async function fetchSafeImage(src: string): Promise<SafeImageFetchResult> {
  let lastResult: SafeImageFetchResult = { ok: false, status: 502, message: 'Fetch failed' };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastResult = await fetchSafeImageOnce(src);
    if (lastResult.ok || lastResult.status !== 502 || attempt === MAX_ATTEMPTS) return lastResult;
    await sleep(300 * attempt);
  }
  return lastResult;
}

async function fetchSafeImageOnce(src: string): Promise<SafeImageFetchResult> {
  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return { ok: false, status: 400, message: 'Invalid URL' };
  }

  try {
    let redirects = 0;
    let upstream: Response;
    for (;;) {
      await assertSafeTarget(target);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        upstream = await fetch(target.toString(), {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MovieBridgeBot/1.0)' },
          redirect: 'manual',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get('location');
        if (!location) return { ok: false, status: 502, message: 'Redirect missing location' };
        if (++redirects > MAX_REDIRECTS) {
          return { ok: false, status: 502, message: 'Too many redirects' };
        }
        target = new URL(location, target);
        continue;
      }
      break;
    }

    if (!upstream.ok) return { ok: false, status: 502, message: 'Upstream error' };

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return { ok: false, status: 415, message: 'Not an image' };
    }

    const declaredLength = Number(upstream.headers.get('content-length') || '0');
    if (declaredLength > MAX_IMAGE_BYTES) {
      return { ok: false, status: 413, message: 'Image too large' };
    }

    if (!upstream.body) return { ok: false, status: 502, message: 'Upstream error' };
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, message: 'Image too large' };
      }
      chunks.push(value);
    }

    const buf = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { ok: true, body: buf, contentType };
  } catch (err) {
    console.error('[fetchSafeImageOnce]', src, err);
    return { ok: false, status: 502, message: 'Fetch failed' };
  }
}
