import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";

/**
 * 진행 정보에 첨부한 스크린샷을 파일 시스템에서 직접 읽어서 내려준다.
 *
 * public/ 아래 정적 파일로 두지 않는 이유: Next.js의 `next start` 정적
 * 서빙은 서버가 시작될 때 이미 있던 public/ 파일 목록만 인식하고,
 * 서버가 떠 있는 동안 나중에 새로 쓴 파일(업로드된 스크린샷)은
 * 서버를 재시작하기 전까지 404가 난다(실제로 겪은 "사진이 안 보이고
 * 아이콘만 보이는" 증상의 원인). API 라우트는 요청마다 매번 새로 실행돼서
 * 이 문제가 없다.
 */
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { path: segments } = await params;

  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const resolved = path.resolve(uploadsRoot, ...segments);
  // 디렉터리 탈출(../..) 방지: 최종 경로가 uploads 루트 밖으로 나가면 거부.
  if (resolved !== uploadsRoot && !resolved.startsWith(uploadsRoot + path.sep)) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  try {
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) throw new Error("not a file");
    const buffer = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
