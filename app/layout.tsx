import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { preconnect } from "react-dom";
import "./globals.css";

// 가변 폰트라 weight를 생략하면 @font-face가 슬라이스당 1개(100~900 범위)로 생성된다.
// 굵기를 배열로 나열하면 슬라이스 124개 x 4굵기 = 496개 규칙이 렌더 차단 CSS에 들어간다.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "영화대교",
  description: "대구과학고등학교 자율동아리 영화대교 영화 예매",
  // app/icon.png로 두면 Next 메타데이터 라우트라 요청마다 Worker가 응답한다. public/에 두면 static assets가 바로 준다.
  icons: { icon: [{ url: "/icon-16.png", sizes: "16x16" }, { url: "/icon-32.png", sizes: "32x32" }, { url: "/icon.png", sizes: "48x48" }], apple: "/apple-touch-icon.png" },
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
      className={`${notoSansKr.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
