// 서울 입구 (movie-bridge-relay.pages.dev, 2026-11-10)
//
// 한국 통신사는 Cloudflare 무료 요금제 IP(*.dshs.dev)를 LA(LAX)로 보내 HTML·API 첫 응답이 1~3초 걸렸다.
// Cloudflare가 직접 관리하는 *.pages.dev IP는 같은 회선에서도 서울(ICN)로 들어온다. 영화대교.dshs.dev를
// 회색 구름(DNS-only) CNAME으로 이 Pages 프로젝트에 붙이면 주소는 그대로 두고 서울로 들어온다
// (주황 구름이면 우리 존 IP로 풀려 다시 LAX — 대신 Worker Route가 받으므로 예비 길로 쓴다).
// dshs.dev(개발자 플랫폼 저장소 relay/)와 같은 방식.
//
// 받은 요청을 그대로 Worker(movie-bridge)에 service binding으로 넘긴다 — 같은 서울 엣지 안에서 바로 부르므로
// 주소·쿠키·헤더·cf-connecting-ip가 그대로고, Worker도 서울에서 돌아 Supabase(서울) 왕복이 짧아진다.
// 함수 실행은 Workers 무료 하루 10만 건(계정 공유)에 들어간다.

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (url.pathname === "/__relay-health") {
    return new Response(`ok colo=${request.cf?.colo || "-"}\n`, {
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
  return env.APP.fetch(request);
}
