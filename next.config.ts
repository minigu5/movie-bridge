import type { NextConfig } from "next";

// 영화대교.omm.run -> 영화대교.dshs.dev 이전. Host 헤더는 퓨니코드로 들어온다.
const LEGACY_HOST = 'xn--9d0bw1i8usvmp.omm.run';
const CANONICAL_ORIGIN = 'https://xn--9d0bw1i8usvmp.dshs.dev';

const nextConfig: NextConfig = {
  // 정적 파일(/_next/static)을 받을 다른 주소(*.pages.dev, 서울에서 응답). scripts/deploy.sh가 배포 빌드 때만 넘긴다.
  // 비어 있으면(개발·Pages 실패) 예전처럼 Worker가 직접 준다.
  assetPrefix: process.env.ASSET_PREFIX || undefined,
  async redirects() {
    return [
      // 루트는 :path* 가 빈 값으로 치환되지 않아 별도 규칙으로 분리
      {
        source: '/',
        has: [{ type: 'host', value: LEGACY_HOST }],
        destination: CANONICAL_ORIGIN,
        permanent: true,
      },
      {
        source: '/:path+',
        has: [{ type: 'host', value: LEGACY_HOST }],
        destination: `${CANONICAL_ORIGIN}/:path+`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
