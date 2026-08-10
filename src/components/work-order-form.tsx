"use client";

import { useState } from "react";
import { createWorkOrder } from "@/actions/work-orders";

type Option = { id: string; name: string };

const TYPE_LABEL: Record<string, string> = {
  DEPARTMENT: "부서",
  DIVISION: "과",
  TEAM: "팀",
  USER: "개인",
};

export function WorkOrderForm({
  projects,
  departments,
  divisions,
  teams,
  users,
  defaultProjectId,
  parentId,
}: {
  projects: Option[];
  departments: Option[];
  divisions: Option[];
  teams: Option[];
  users: Option[];
  defaultProjectId?: string;
  parentId?: string;
}) {
  const [assigneeType, setAssigneeType] = useState<
    "DEPARTMENT" | "DIVISION" | "TEAM" | "USER"
  >("TEAM");

  const optionsByType: Record<string, Option[]> = {
    DEPARTMENT: departments,
    DIVISION: divisions,
    TEAM: teams,
    USER: users,
  };

  return (
    <form action={createWorkOrder} className="flex flex-col gap-3">
      {parentId && <input type="hidden" name="parentId" value={parentId} />}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          프로젝트
        </label>
        <select
          name="projectId"
          required
          defaultValue={defaultProjectId ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
        <label className="mb-1 block text-sm font-medium text-slate-700">
          제목
        </label>
        <input
          name="title"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          설명
        </label>
        <textarea
          name="description"
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          마감일
        </label>
        <input
          name="dueDate"
          type="date"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          할당 단위
        </label>
        <div className="flex gap-4 text-sm text-slate-700">
          {(["DEPARTMENT", "DIVISION", "TEAM", "USER"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input
                type="radio"
                name="assigneeType"
                value={t}
                checked={assigneeType === t}
                onChange={() => setAssigneeType(t)}
              />
              {TYPE_LABEL[t]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          할당 대상
        </label>
        <select
          key={assigneeType}
          name="assigneeId"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">선택</option>
          {optionsByType[assigneeType].map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        업무 할당
      </button>
    </form>
  );
}
