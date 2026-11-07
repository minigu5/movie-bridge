// 관리자 포스터 파일 올리기 도우미(브라우저 전용).
// 파일은 data URI로 바꿔 UPLOAD_POSTER_CDN으로 Cloudinary에 올린다.

// 이보다 좁은 포스터는 메일 티켓에서 확대되며 뭉개진다. 나무위키는 Cloudflare Workers
// 발신 요청에 200x285 썸네일만 돌려주므로, 그런 주소 대신 원본 파일을 올려야 한다.
export const MIN_POSTER_WIDTH = 400;

export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('이미지 인코딩에 실패했습니다.'));
    reader.readAsDataURL(blob);
  });
}

export function readImageSize(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다.')); };
    img.src = url;
  });
}

export function lowResWarning(width: number, height: number): string | null {
  return width < MIN_POSTER_WIDTH
    ? `포스터가 작아요(${width}×${height}). 메일 티켓에서 흐리게 보일 수 있어요. 더 큰 원본 파일을 올려 주세요.`
    : null;
}
