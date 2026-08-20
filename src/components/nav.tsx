import Link from "next/link";
import { auth, signOut } from "@/auth";
import { ROLE_LABEL, canManageOrg } from "@/lib/org-access";
import { getActiveContextInfo, getUnavailableDivisions } from "@/lib/db";
import { getNasStore } from "@/lib/app-config";
import { endEditSession } from "@/actions/context";
import { IdleAutoEndSession } from "@/components/idle-auto-end-session";
import { EditSessionPoller } from "@/components/edit-session-poller";
import type { WaiterInfo } from "@/lib/nas-store";

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

  const context = getActiveContextInfo();
  const isMyEditSession =
    context?.mode === "edit" && context.holder.email === session.user.email;
  const othersEditSession =
    context?.mode === "edit" && context.holder.email !== session.user.email
      ? context
      : null;
  const unavailable = isMyEditSession ? getUnavailableDivisions() : [];

  // 내가 편집 중인 과들에 누가 기다리고 있으면 알려준다 - 편집 시작을
  // 시도했다가 막힌 사람은 자동으로 대기자로 등록되므로(actions/context.ts),
  // 여기서 조회만 하면 된다.
  const waiters: WaiterInfo[] = isMyEditSession
    ? Object.values(
        Object.fromEntries(
          context.keys
            .flatMap((key) => getNasStore().getLockStatus(key)?.waiters ?? [])
            .map((w) => [w.email, w]),
        ),
      )
    : [];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="text-sm font-semibold text-slate-900">
            Work Order 관리
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
          {isMyEditSession && context ? (
            <>
              <IdleAutoEndSession />
              <EditSessionPoller />
              {waiters.length > 0 && (
                <span
                  className="animate-pulse rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800"
                  title={waiters
                    .map((w) => `${w.name} (${new Date(w.requestedAt).toLocaleTimeString("ko-KR")}부터 대기)`)
                    .join(", ")}
                >
                  ⏳{" "}
                  {waiters.length === 1
                    ? `${waiters[0].name}님이 기다리고 있습니다`
                    : `${waiters.length}명이 기다리고 있습니다`}
                </span>
              )}
              <form action={endEditSession} className="flex items-center gap-2">
                <span
                  className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700"
                  title={context.keys.join(", ")}
                >
                  편집 중:{" "}
                  {context.keys.length === 1
                    ? context.keys[0]
                    : `${context.keys[0]} 외 ${context.keys.length - 1}개 과`}
                </span>
                <button
                  name="mode"
                  value="save"
                  className="text-xs text-blue-600 hover:underline"
                >
                  {context.keys.length > 1 ? "전체 저장하고 종료" : "저장하고 종료"}
                </button>
                <button
                  name="mode"
                  value="discard"
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  취소
                </button>
                {unavailable.length > 0 && (
                  <span
                    className="rounded-full bg-red-50 px-2 py-1 text-xs text-red-600"
                    title={unavailable
                      .map((u) => `${u.key}: ${u.holderName}님이 편집 중`)
                      .join(", ")}
                  >
                    {unavailable.length}개 과 편집불가
                  </span>
                )}
              </form>
            </>
          ) : othersEditSession ? (
            <span
              className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700"
              title="편집을 시작한 사람만 저장/취소할 수 있습니다"
            >
              {othersEditSession.holder.name}님이{" "}
              {othersEditSession.keys.length === 1
                ? othersEditSession.keys[0]
                : `${othersEditSession.keys.length}개 과`}{" "}
              편집 중
            </span>
          ) : (
            <Link
              href="/select-division"
              className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
            >
              편집 시작
            </Link>
          )}
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
