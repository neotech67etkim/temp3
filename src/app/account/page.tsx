import { auth } from "@/auth";
import { AccountForm } from "@/components/account-form";
import { BackToDashboard } from "@/components/back-to-dashboard";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <BackToDashboard />
      <h1 className="text-xl font-semibold text-slate-900">내 계정</h1>
      <p className="mt-1 text-sm text-slate-500">
        로그인 이메일과 비밀번호를 직접 변경할 수 있습니다.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <AccountForm currentEmail={session.user.email ?? ""} />
      </div>
    </div>
  );
}
