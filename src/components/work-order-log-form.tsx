"use client";

import { useRef, useState } from "react";
import { addWorkOrderLog } from "@/actions/work-orders";

export function WorkOrderLogForm({ workOrderId }: { workOrderId: string }) {
  const action = addWorkOrderLog.bind(null, workOrderId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [attachedName, setAttachedName] = useState<string | null>(null);

  function attachFile(file: File) {
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
    }
    setAttachedName(file.name || "붙여넣은 이미지");
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          attachFile(file);
          e.preventDefault();
        }
        break;
      }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      attachFile(file);
    }
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => {
        setTimeout(() => {
          formRef.current?.reset();
          setAttachedName(null);
        }, 0);
      }}
      className="flex flex-col gap-3"
    >
      <textarea
        name="note"
        rows={3}
        placeholder="진행 경과나 결과를 입력하세요"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <div
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        tabIndex={0}
        className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 focus:border-blue-400 focus:outline-none"
      >
        <span>스크린샷을 이 영역에 붙여넣기(Ctrl+V)하거나 파일을 드래그하세요.</span>
        {attachedName && (
          <span className="font-medium text-blue-600">{attachedName}</span>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        name="image"
        accept="image/*"
        className="hidden"
      />

      <input
        name="filePath"
        placeholder="참고 파일 경로 (예: \\서버\경로\파일.docx)"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <button
        type="submit"
        className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        경과 등록
      </button>
    </form>
  );
}
