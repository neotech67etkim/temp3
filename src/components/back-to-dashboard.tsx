import Link from "next/link";

export function BackToDashboard() {
  return (
    <Link
      href="/dashboard"
      className="mb-4 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600"
    >
      ← 대시보드로
    </Link>
  );
}
