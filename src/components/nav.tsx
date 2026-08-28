import Link from "next/link";
import { auth, signOut } from "@/auth";
import { ROLE_LABEL, canManageOrg } from "@/lib/org-access";
import packageJson from "../../package.json";

export async function Nav() {
  const session = await auth();
  if (!session?.user) return null;

  const links = [
    { href: "/dashboard", label: "대시보드" },
    // 프로젝트 탭은 관리자만 필요하고, 나머지는 몰라도 되는 화면이라 감춘다.
    ...(canManageOrg(session.user.role)
      ? [{ href: "/projects", label: "프로젝트" }]
      : []),
    { href: "/work-orders", label: "Work Order" },
    { href: "/gantt", label: "간트차트" },
    ...(canManageOrg(session.user.role)
      ? [{ href: "/org", label: "조직 관리" }]
      : []),
    { href: "/account", label: "내 계정" },
    { href: "/guide", label: "이용 안내" },
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="text-sm font-semibold text-slate-900">
            Work Order 관리{" "}
            <span className="font-normal text-slate-400">
              v{packageJson.version}
            </span>
          </span>
          <nav className="flex gap-5">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-slate-600 hover:text-blue-600"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>
            {session.user.name} ·{" "}
            {ROLE_LABEL[session.user.role] ?? session.user.role}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="text-slate-400 hover:text-slate-700">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
