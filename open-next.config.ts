// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// 모든 페이지가 "use client" 정적 페이지(ISR/revalidate 없음)라 빌드 때 만든 HTML을 Workers static assets에서
// 읽기 전용으로 꺼내 쓴다. 기본값(dummy)이면 캐시가 늘 MISS라 요청마다 page.tsx 전체를 SSR해서
// 무료 플랜 CPU 한도(요청당 10ms)를 넘겼다. 페이지에 revalidate/ISR을 넣으면 R2 캐시로 바꿔야 한다.
// enableCacheInterception: 캐시 HIT이면 Next 서버 번들을 import하지 않고 바로 응답한다.
// (next.config.ts redirects는 라우팅 단계에서 이보다 먼저 처리된다)
export default defineCloudflareConfig({
	incrementalCache: staticAssetsIncrementalCache,
	enableCacheInterception: true,
});
