import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import { preconnect } from "react-dom";
import "./globals.css";

// 가변 폰트라 weight를 생략하면 @font-face가 슬라이스당 1개(100~900 범위)로 생성된다.
// 굵기를 배열로 나열하면 슬라이스 124개 x 4굵기 = 496개 규칙이 렌더 차단 CSS에 들어간다.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  display: "swap",
});

// 로고 "영화대교" 4글자만 담은 Song Myung subset(5KB). 전체 폰트를 next/font/google로 받으면
// 슬라이스 89개 @font-face가 렌더 차단 CSS 130KB를 차지하고 폰트가 늦게 도착해 스플래시가
// 기본 serif로 먼저 그려진다. 로고 문구를 바꾸면 이 파일도 새 글자로 다시 만들어야 한다:
// https://fonts.googleapis.com/css2?family=Song+Myung&text=<새 문구>
const songMyung = localFont({
  src: "./fonts/SongMyung-logo.woff2",
  variable: "--font-song-myung",
  weight: "400",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: "영화대교",
  description: "대구과학고등학교 자율동아리 영화대교 영화 예매",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // JS가 내려받아지는 동안 Supabase(fetch는 CORS 모드)와 포스터 CDN(img는 no-cors)의
  // DNS/TLS 핸드셰이크를 미리 끝내둔다. 첫 쿼리가 핸드셰이크를 기다리지 않게 된다.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    preconnect(process.env.NEXT_PUBLIC_SUPABASE_URL, { crossOrigin: "anonymous" });
  }
  preconnect("https://res.cloudinary.com");

  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${songMyung.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
