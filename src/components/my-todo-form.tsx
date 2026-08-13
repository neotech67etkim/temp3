"use client";

import { createMyTodo } from "@/actions/work-orders";
import { PRIORITY_LABEL } from "@/components/priority-badge";

type Option = { id: string; name: string };

export function MyTodoForm({ projects }: { projects: Option[] }) {
  return (
    <form action={createMyTodo} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-xs font-medium text-slate-500">
          할 일
        </label>
        <input
          name="title"
          required
          placeholder="새 할 일을 입력하세요"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          프로젝트
        </label>
        <select
          name="projectId"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">선택</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          우선순위
        </label>
        <select
          name="priority"
          defaultValue="NORMAL"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          마감일
        </label>
        <input
          name="dueDate"
          type="date"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        추가
      </button>
    </form>
  );
}
