"use client";

import { useState } from "react";
import { createUser } from "@/actions/org";
import { ROLE_OPTIONS } from "@/lib/org-access";

type Option = { id: string; name: string };

export function UserForm({
  departments,
  divisions,
  teams,
}: {
  departments: Option[];
  divisions: Option[];
  teams: Option[];
}) {
  const [role, setRole] = useState("MEMBER");

  return (
    <form action={createUser} className="flex flex-col gap-2">
      <input
        name="name"
        required
        placeholder="이름"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        name="email"
        type="email"
        required
        placeholder="이메일"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="초기 비밀번호"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <select
        name="role"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <select
        name="departmentId"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">소속 부서 (선택)</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        name="divisionId"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">소속 과 (선택)</option>
        {divisions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {role === "TEAM_LEAD" && (
        <select
          name="teamId"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">소속 팀 (필수, 팀장)</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {role !== "TEAM_LEAD" && (
        <p className="text-xs text-slate-400">
          팀은 팀장만 개별 소속됩니다. 과원은 과 소속까지만 지정하세요.
        </p>
      )}
      <button
        type="submit"
        className="mt-1 self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        추가
      </button>
    </form>
  );
}
