"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Datum = { name: string; progress: number };

export function CategoryProgressChart({ data }: { data: Datum[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-slate-400">표시할 카테고리가 없습니다.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#475569" }} />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 12, fill: "#475569" }}
          unit="%"
        />
        <Tooltip formatter={(value) => [`${value}%`, "진행률"]} />
        <Bar dataKey="progress" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
