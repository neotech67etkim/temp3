import { prisma } from "@/lib/db";
import { getGanttItems } from "@/lib/gantt";
import { GanttChart } from "@/components/gantt-chart";

export default async function GanttPage({
  searchParams,
}: {
  searchParams: Promise<{ departmentId?: string; divisionId?: string }>;
}) {
  const { departmentId, divisionId } = await searchParams;

  const departments = await prisma.department.findMany({
    include: { divisions: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });

  const effectiveDepartmentId =
    departmentId || (!divisionId ? departments[0]?.id : undefined);

  const items = await getGanttItems({
    departmentId: effectiveDepartmentId,
    divisionId,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
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

      <div className="mt-4">
        <GanttChart items={items} />
      </div>
    </div>
  );
}
