import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABEL, canManageOrg } from "@/lib/org-access";
import {
  createDepartment,
  createDivision,
  createTeam,
  deleteDepartment,
  deleteDivision,
  deleteTeam,
  deleteUser,
} from "@/actions/org";
import { UserForm } from "@/components/user-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

function DeleteForm({
  action,
  id,
  confirmMessage,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  confirmMessage: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <ConfirmSubmitButton
        confirmMessage={confirmMessage}
        className="text-xs text-red-500 hover:text-red-700"
      >
        삭제
      </ConfirmSubmitButton>
    </form>
  );
}

export default async function OrgPage() {
  const session = await auth();
  if (!session?.user || !canManageOrg(session.user.role)) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-red-600">조직 관리 권한이 없습니다.</p>
      </div>
    );
  }

  const currentUserId = session.user.id;

  const departments = await prisma.department.findMany({
    include: {
      divisions: {
        include: {
          teams: { include: { users: true } },
          users: true,
        },
        orderBy: { name: "asc" },
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
        부서 → 과 → 팀 구조를 관리합니다. 과원(사무직)은 과에 소속되고, 팀(현장
        작업팀)은 팀장만 개별 소속됩니다.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">조직도</h2>
        {departments.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 부서가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-5">
            {departments.map((dept) => (
              <li key={dept.id}>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-slate-800">
                    {dept.name}
                  </p>
                  <DeleteForm
                    action={deleteDepartment}
                    id={dept.id}
                    confirmMessage={`"${dept.name}" 부서를 삭제하시겠습니까? 소속 과/팀도 함께 삭제됩니다.`}
                  />
                </div>

                <ul className="mt-2 ml-4 flex flex-col gap-3 border-l border-slate-100 pl-4">
                  {dept.divisions.map((div) => (
                    <li key={div.id}>
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-slate-700">{div.name}</p>
                        <DeleteForm
                          action={deleteDivision}
                          id={div.id}
                          confirmMessage={`"${div.name}" 과를 삭제하시겠습니까? 소속 팀도 함께 삭제됩니다.`}
                        />
                      </div>

                      <ul className="mt-1 ml-4 flex flex-col gap-1 border-l border-slate-100 pl-4">
                        {div.users
                          .filter((u) => !u.teamId)
                          .map((u) => (
                            <li
                              key={u.id}
                              className="flex items-center gap-2 text-xs text-slate-600"
                            >
                              <span>
                                {u.name} · {ROLE_LABEL[u.role]} (과원)
                              </span>
                              {u.id !== currentUserId && (
                                <DeleteForm
                                  action={deleteUser}
                                  id={u.id}
                                  confirmMessage={`"${u.name}" 계정을 삭제하시겠습니까?`}
                                />
                              )}
                            </li>
                          ))}
                        {div.users.filter((u) => !u.teamId).length === 0 && (
                          <li className="text-xs text-slate-300">
                            과원 없음
                          </li>
                        )}

                        {div.teams.map((team) => (
                          <li key={team.id}>
                            <div className="flex items-center gap-2 text-xs text-slate-600">
                              <span className="font-medium">
                                [팀] {team.name}
                              </span>
                              <DeleteForm
                                action={deleteTeam}
                                id={team.id}
                                confirmMessage={`"${team.name}" 팀을 삭제하시겠습니까?`}
                              />
                            </div>
                            <ul className="mt-1 ml-4 flex flex-col gap-1">
                              {team.users.map((u) => (
                                <li
                                  key={u.id}
                                  className="flex items-center gap-2 text-xs text-slate-500"
                                >
                                  <span>
                                    {u.name} · {ROLE_LABEL[u.role]}
                                  </span>
                                  {u.id !== currentUserId && (
                                    <DeleteForm
                                      action={deleteUser}
                                      id={u.id}
                                      confirmMessage={`"${u.name}" 계정을 삭제하시겠습니까?`}
                                    />
                                  )}
                                </li>
                              ))}
                              {team.users.length === 0 && (
                                <li className="text-xs text-slate-300">
                                  팀장 미지정
                                </li>
                              )}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>

                {dept.users.length > 0 && (
                  <ul className="mt-2 ml-4 flex flex-col gap-1 border-l border-slate-100 pl-4">
                    {dept.users.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center gap-2 text-xs text-slate-400"
                      >
                        <span>
                          {u.name} · {ROLE_LABEL[u.role]} (부서 직속)
                        </span>
                        {u.id !== currentUserId && (
                          <DeleteForm
                            action={deleteUser}
                            id={u.id}
                            confirmMessage={`"${u.name}" 계정을 삭제하시겠습니까?`}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
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
            팀(현장 작업팀) 추가
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

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            사용자 추가
          </h3>
          <UserForm departments={departments} divisions={divisions} teams={teams} />
        </div>
      </div>
    </div>
  );
}
