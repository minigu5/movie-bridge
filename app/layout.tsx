import type { Metadata, Viewport } from "next";
import { Hahmlet, IBM_Plex_Sans_KR } from "next/font/google";
import { preconnect } from "react-dom";
import "./globals.css";

// 본문은 IBM Plex Sans KR. 가변 폰트가 아니라 굵기마다 한글 슬라이스(약 90개)별 @font-face가 생겨
// 렌더 차단 CSS가 굵기 수에 비례해 커진다. 그래서 400·700 두 굵기만 받는다(500은 400, 900은 700으로 보인다).
const plexSansKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-sans-kr",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

// 영화 제목에만 쓰는 함렛(가변). weight를 생략해 슬라이스당 규칙 1개로 둔다. 첫 화면 본문보다 덜 급해 미리 받지 않는다.
const hahmlet = Hahmlet({
  variable: "--font-hahmlet",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "영화대교",
  description: "대구과학고등학교 자율동아리 영화대교 영화 예매",
  // app/icon.png로 두면 Next 메타데이터 라우트라 요청마다 Worker가 응답한다. public/에 두면 static assets가 바로 준다.
  icons: { icon: [{ url: "/icon-16.png", sizes: "16x16" }, { url: "/icon-32.png", sizes: "32x32" }, { url: "/icon.png", sizes: "48x48" }], apple: "/apple-touch-icon.png" },
};

// 아이폰 홈 표시줄 영역까지 그려야 env(safe-area-inset-bottom)이 0이 아닌 값을 준다(폰 하단 고정 예매 바).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      className={`${plexSansKr.variable} ${hahmlet.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
