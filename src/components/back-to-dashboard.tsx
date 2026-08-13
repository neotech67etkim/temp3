import Link from "next/link";

export function BackToDashboard() {
  return (
    <Link
      href="/dashboard"
      className="mb-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600"
    >
      ← 대시보드로
    </Link>
  );
}
