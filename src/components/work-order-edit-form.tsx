"use client";

import { useState } from "react";
import { updateWorkOrderDetails } from "@/actions/work-orders";

type Option = { id: string; name: string };

export function WorkOrderEditForm({
  id,
  title,
  description,
  dueDate,
  projectId,
  projects,
}: {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  projectId: string;
  projects: Option[];
}) {
  const [open, setOpen] = useState(false);
  const action = updateWorkOrderDetails.bind(null, id);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-blue-600 hover:underline"
      >
        수정
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        setOpen(false);
      }}
      className="flex flex-col gap-2 rounded-md border border-slate-200 p-3"
    >
      <input
        name="title"
        defaultValue={title}
        required
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <textarea
        name="description"
        defaultValue={description ?? ""}
        rows={3}
        placeholder="업무내용 및 참고사항"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <select
        name="projectId"
        defaultValue={projectId}
        required
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        name="dueDate"
        type="date"
        defaultValue={dueDate ?? ""}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600"
        >
          취소
        </button>
      </div>
    </form>
  );
}
