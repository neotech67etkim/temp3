import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canManageOrg } from "@/lib/org-access";
import {
  createDepartment,
  createDivision,
  createTeam,
  createUser,
} from "@/actions/org";

const ROLE_OPTIONS = [
  { value: "MEMBER", label: "팀원" },
  { value: "TEAM_LEAD", label: "팀장" },
  { value: "DIV_HEAD", label: "과장" },
  { value: "DEPT_HEAD", label: "부서장" },
  { value: "ADMIN", label: "관리자" },
];

export default async function OrgPage() {
  const session = await auth();
  if (!session?.user || !canManageOrg(session.user.role)) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-red-600">조직 관리 권한이 없습니다.</p>
      </div>
    );
  }

  const departments = await prisma.department.findMany({
    include: {
      divisions: {
        include: {
          teams: { include: { users: true } },
          users: true,
        },
      },
      users: { where: { divisionId: null } },
    },
    orderBy: { name: "asc" },
  });

  const divisions = departments.flatMap((d) => d.divisions);
  const teams = divisions.flatMap((d) => d.teams);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">조직 관리</h1>
      <p className="mt-1 text-sm text-slate-500">
        부서 → 과 → 팀 → 개인 조직 구조를 관리합니다.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">조직도</h2>
        {departments.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 부서가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {departments.map((dept) => (
              <li key={dept.id}>
                <p className="text-sm font-medium text-slate-800">
                  {dept.name}
                </p>
                <ul className="mt-2 ml-4 flex flex-col gap-2 border-l border-slate-100 pl-4">
                  {dept.divisions.map((div) => (
                    <li key={div.id}>
                      <p className="text-sm text-slate-700">{div.name}</p>
                      <ul className="mt-1 ml-4 flex flex-col gap-1 border-l border-slate-100 pl-4">
                        {div.teams.map((team) => (
                          <li key={team.id} className="text-xs text-slate-600">
                            {team.name}
                            {team.users.length > 0 && (
                              <span className="ml-2 text-slate-400">
                                (
                                {team.users.map((u) => u.name).join(", ")}
                                )
                              </span>
                            )}
                          </li>
                        ))}
                        {div.users.length > 0 && (
                          <li className="text-xs text-slate-400">
                            과 직속: {div.users.map((u) => u.name).join(", ")}
                          </li>
                        )}
                      </ul>
                    </li>
                  ))}
                  {dept.users.length > 0 && (
                    <li className="text-xs text-slate-400">
                      부서 직속: {dept.users.map((u) => u.name).join(", ")}
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          action={createDepartment}
          className="rounded-lg border border-slate-200 bg-white p-5"
        >
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            부서 추가
          </h3>
          <input
            name="name"
            required
            placeholder="부서명"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            추가
          </button>
        </form>

        <form
          action={createDivision}
          className="rounded-lg border border-slate-200 bg-white p-5"
        >
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            과 추가
          </h3>
          <select
            name="departmentId"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">소속 부서 선택</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            name="name"
            required
            placeholder="과명"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            추가
          </button>
        </form>

        <form
          action={createTeam}
          className="rounded-lg border border-slate-200 bg-white p-5"
        >
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            팀 추가
          </h3>
          <select
            name="divisionId"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">소속 과 선택</option>
            {divisions.map((div) => (
              <option key={div.id} value={div.id}>
                {div.name}
              </option>
            ))}
          </select>
          <input
            name="name"
            required
            placeholder="팀명"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            추가
          </button>
        </form>

        <form
          action={createUser}
          className="rounded-lg border border-slate-200 bg-white p-5"
        >
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            사용자 추가
          </h3>
          <input
            name="name"
            required
            placeholder="이름"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="이메일"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="초기 비밀번호"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="role"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            defaultValue="MEMBER"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            name="departmentId"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">소속 부서 (선택)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            name="divisionId"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">소속 과 (선택)</option>
            {divisions.map((div) => (
              <option key={div.id} value={div.id}>
                {div.name}
              </option>
            ))}
          </select>
          <select
            name="teamId"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">소속 팀 (선택)</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            추가
          </button>
        </form>
      </div>
    </div>
  );
}
