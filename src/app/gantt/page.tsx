import { auth } from "@/auth";
import { orgDb } from "@/lib/db";
import {
  GANTT_DEPT_WIDE_GROUP,
  GANTT_UNASSIGNED_GROUP,
  getGanttItems,
  type GanttItem,
} from "@/lib/gantt";
import { GanttChart } from "@/components/gantt-chart";
import { BackToDashboard } from "@/components/back-to-dashboard";

function groupByDivision(items: GanttItem[]) {
  const groups = new Map<string, GanttItem[]>();
  for (const item of items) {
    if (!groups.has(item.divisionName)) groups.set(item.divisionName, []);
    groups.get(item.divisionName)!.push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === GANTT_UNASSIGNED_GROUP) return 1;
    if (b === GANTT_UNASSIGNED_GROUP) return -1;
    if (a === GANTT_DEPT_WIDE_GROUP) return 1;
    if (b === GANTT_DEPT_WIDE_GROUP) return -1;
    return a.localeCompare(b);
  });
}

export default async function GanttPage({
  searchParams,
}: {
  searchParams: Promise<{ departmentId?: string; divisionId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canBrowseAll = ["ADMIN", "DEPT_HEAD", "DIV_HEAD"].includes(
    session.user.role,
  );

  if (!canBrowseAll) {
    const division = session.user.divisionId
      ? await orgDb.division.findUnique({
          where: { id: session.user.divisionId },
          select: { id: true, name: true },
        })
      : null;

    const items = division
      ? await getGanttItems({ divisionId: division.id })
      : [];

    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <BackToDashboard />
        <h1 className="text-xl font-semibold text-slate-900">간트차트</h1>
        <p className="mt-1 text-sm text-slate-500">
          {division
            ? `소속 과(${division.name})의 Work Order 일정과 지연 여부를 확인합니다.`
            : "소속된 과가 없어 표시할 내용이 없습니다."}
        </p>

        <Legend />

        <div className="mt-4">
          <GanttChart items={items} />
        </div>
      </div>
    );
  }

  const { departmentId, divisionId } = await searchParams;

  const departments = await orgDb.department.findMany({
    include: { divisions: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });

  const effectiveDepartmentId =
    departmentId || (!divisionId ? departments[0]?.id : undefined);

  const items = await getGanttItems({
    departmentId: effectiveDepartmentId,
    divisionId,
  });

  const divisionGroups = !divisionId ? groupByDivision(items) : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <BackToDashboard />
      <h1 className="text-xl font-semibold text-slate-900">간트차트</h1>
      <p className="mt-1 text-sm text-slate-500">
        부서 또는 과 단위로 Work Order의 일정과 지연 여부를 확인합니다.
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            부서
          </label>
          <select
            name="departmentId"
            defaultValue={effectiveDepartmentId ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            과 (선택 시 해당 과만 표시)
          </label>
          <select
            name="divisionId"
            defaultValue={divisionId ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">전체 (부서 기준)</option>
            {departments
              .flatMap((d) => d.divisions)
              .map((div) => (
                <option key={div.id} value={div.id}>
                  {div.name}
                </option>
              ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          조회
        </button>
      </form>

      <Legend />

      {divisionGroups ? (
        <div className="mt-4 flex flex-col gap-6">
          {divisionGroups.map(([divisionName, divisionItems]) => (
            <div key={divisionName}>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">
                {divisionName}
              </h2>
              <GanttChart items={divisionItems} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <GanttChart items={items} />
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-slate-300" /> 시작전
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-blue-500" /> 진행중
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-amber-400" /> 보류
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-green-500" /> 완료
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded ring-2 ring-red-600" /> 지연
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-px bg-red-300" /> 오늘
      </span>
    </div>
  );
}
