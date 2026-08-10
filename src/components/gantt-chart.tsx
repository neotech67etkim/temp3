import Link from "next/link";
import type { GanttItem } from "@/lib/gantt";
import { addDays, daysBetween, startOfMonth } from "@/lib/gantt";

const PX_PER_DAY = 22;
const LABEL_WIDTH = 260;

const STATUS_BAR_CLASS: Record<GanttItem["status"], string> = {
  NOT_STARTED: "bg-slate-300",
  IN_PROGRESS: "bg-blue-500",
  ON_HOLD: "bg-amber-400",
  COMPLETED: "bg-green-500",
  CANCELLED: "bg-red-300",
};

export function GanttChart({ items }: { items: GanttItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">표시할 Work Order가 없습니다.</p>;
  }

  const today = new Date();
  const starts = items.map((i) => i.createdAt);
  const ends = items.map((i) => i.dueDate ?? i.completedAt ?? addDays(i.createdAt, 7));

  const rangeStart = addDays(
    startOfMonth(new Date(Math.min(...starts.map((d) => d.getTime()), today.getTime()))),
    0,
  );
  const rangeEndRaw = new Date(
    Math.max(...ends.map((d) => d.getTime()), today.getTime()),
  );
  const rangeEnd = addDays(startOfMonth(addDays(rangeEndRaw, 31)), 0);

  const totalDays = Math.max(daysBetween(rangeStart, rangeEnd), 30);
  const totalWidth = totalDays * PX_PER_DAY;
  const todayOffset = daysBetween(rangeStart, today) * PX_PER_DAY;

  const months: { label: string; offsetPx: number }[] = [];
  let cursor = rangeStart;
  while (cursor < rangeEnd) {
    months.push({
      label: `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      offsetPx: daysBetween(rangeStart, cursor) * PX_PER_DAY,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <div style={{ width: `${LABEL_WIDTH + totalWidth}px` }}>
        <div className="flex border-b border-slate-200 text-xs text-slate-500">
          <div className="sticky left-0 z-10 w-[260px] shrink-0 bg-white px-3 py-2 font-medium">
            Work Order
          </div>
          <div className="relative shrink-0" style={{ width: totalWidth, height: 32 }}>
            {months.map((m) => (
              <div
                key={m.label}
                className="absolute top-0 bottom-0 border-l border-slate-100 pl-1 pt-2"
                style={{ left: m.offsetPx }}
              >
                {m.label}
              </div>
            ))}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-300"
              style={{ left: todayOffset }}
            />
          </div>
        </div>

        {items.map((item) => {
          const barStart = daysBetween(rangeStart, item.createdAt) * PX_PER_DAY;
          const end = item.dueDate ?? item.completedAt ?? addDays(item.createdAt, 7);
          const barEnd = Math.max(
            daysBetween(rangeStart, end) * PX_PER_DAY,
            barStart + PX_PER_DAY,
          );

          return (
            <div
              key={item.id}
              className="flex items-center border-b border-slate-50 last:border-0"
            >
              <div className="sticky left-0 z-10 w-[260px] shrink-0 truncate bg-white px-3 py-2 text-xs">
                <Link
                  href={`/work-orders/${item.id}`}
                  className="text-slate-700 hover:text-blue-600"
                >
                  {item.title}
                </Link>
                <p className="truncate text-slate-400">{item.assignee}</p>
              </div>
              <div
                className="relative shrink-0"
                style={{ width: totalWidth, height: 40 }}
              >
                <div
                  title={`${item.title} (${item.progress}%)`}
                  className={`absolute top-2 h-5 rounded ${STATUS_BAR_CLASS[item.status]} ${
                    item.overdue ? "ring-2 ring-red-600" : ""
                  }`}
                  style={{ left: barStart, width: barEnd - barStart }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
