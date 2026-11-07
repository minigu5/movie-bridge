const UPLOAD_TIMEOUT_MS = 8_000;

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Uploads an image data URI to Cloudinary and returns its public URL. No
 * transformation is requested — this is just reliable storage/CDN for an image
 * the admin's browser already produced or fetched. Used for re-hosting the raw
 * movie poster off an unreliable origin (admin file upload and poster URL saves).
 */
export async function uploadImageDataUri(dataUri: string): Promise<string | null> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `timestamp=${timestamp}`;
    const signature = await sha1Hex(paramsToSign + apiSecret);

    const body = new URLSearchParams({
      file: dataUri,
      api_key: apiKey,
      timestamp: String(timestamp),
      signature,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return null;

    const json = (await res.json()) as { secure_url?: string };
    return json.secure_url ?? null;
  } catch {
    return null;
  }
}

/** @deprecated 이름만 유지하는 별칭. uploadImageDataUri를 쓰세요. */
export const uploadTicketBackground = uploadImageDataUri;
