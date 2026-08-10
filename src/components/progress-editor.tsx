"use client";

import { useState } from "react";
import { updateWorkOrderProgress } from "@/actions/work-orders";

export function ProgressEditor({
  id,
  progress,
}: {
  id: string;
  progress: number;
}) {
  const [value, setValue] = useState(progress);
  const action = updateWorkOrderProgress.bind(null, id);

  return (
    <form action={action} className="flex items-center gap-3">
      <input
        type="range"
        name="progress"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-48"
      />
      <span className="w-10 text-sm text-slate-600">{value}%</span>
      <button
        type="submit"
        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
      >
        저장
      </button>
    </form>
  );
}
