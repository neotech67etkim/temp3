"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { STATUS_LABEL } from "@/components/status-badge";
import type { WorkOrderStatus } from "@prisma/client";

const COLORS: Record<WorkOrderStatus, string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#2563eb",
  ON_HOLD: "#d97706",
  COMPLETED: "#16a34a",
  CANCELLED: "#dc2626",
};

export function StatusPieChart({
  statusCounts,
}: {
  statusCounts: Record<string, number>;
}) {
  const data = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: STATUS_LABEL[status as WorkOrderStatus] ?? status,
      value: count,
      status: status as WorkOrderStatus,
    }));

  if (data.length === 0) {
    return <p className="text-sm text-slate-400">표시할 업무가 없습니다.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={50}
          outerRadius={90}
        >
          {data.map((entry) => (
            <Cell key={entry.status} fill={COLORS[entry.status]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
