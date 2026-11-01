// custom-worker.ts
// wrangler.jsonc의 main. OpenNext가 만든 .open-next/worker.js 앞에서 취약점 스캐너 요청(/.env, /wp-login.php,
// /.git/config 등)을 바로 404로 돌려보낸다. 그대로 넘기면 매번 Next 서버 번들을 불러와 404 페이지를
// 렌더해서, 사람 방문보다 봇이 무료 플랜 CPU 한도를 더 많이 쓴다.
// 이 앱의 실제 경로(/, /admin, /print, /cancel, /group-confirm, /privacy, /api/*, /_next/*)는 걸리지 않는다.
// 빌드 전에는 파일이 없고 빌드 후에는 있어서 @ts-expect-error를 쓸 수 없다.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: .open-next/worker.js는 opennextjs-cloudflare build가 만든다
import { default as handler } from "./.open-next/worker.js";

const SCANNER_EXTENSIONS = /\.(php\d?|env|ya?ml|cfg|conf|config|ini|sql|bak|old|swp|log|xml|asp|aspx|jsp|cgi|zip|tar|gz|rar|7z)$/i;

function isScannerPath(pathname: string): boolean {
	// "/." 로 시작하는 경로 조각(/.env, /.git/config, /api/.env, ...). /.well-known은 표준 경로라 통과.
	if (/\/\.(?!well-known\/)/.test(pathname)) return true;
	if (SCANNER_EXTENSIONS.test(pathname)) return true;
	return /^\/(wp-|wordpress|cgi-bin|phpmyadmin|xmlrpc)/i.test(pathname);
}

const worker = {
	async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
		if (isScannerPath(new URL(request.url).pathname)) {
			return new Response("Not Found", { status: 404, headers: { "cache-control": "public, max-age=86400" } });
		}
		return handler.fetch(request, env, ctx);
	},
};

export default worker;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: 위와 같음
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
