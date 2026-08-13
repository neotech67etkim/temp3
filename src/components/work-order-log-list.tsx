type LogItem = {
  id: string;
  note: string | null;
  imagePath: string | null;
  filePath: string | null;
  progress: number | null;
  createdAt: Date;
  author: { name: string };
};

export function WorkOrderLogList({ logs }: { logs: LogItem[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        등록된 진행관련 정보 및 질문이 없습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {logs.map((log) => (
        <li key={log.id} className="border-b border-slate-100 pb-4 last:border-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-600">{log.author.name}</span>
            <span>{log.createdAt.toLocaleString("ko-KR")}</span>
            {log.progress !== null && <span>· 진행률 {log.progress}%</span>}
          </div>
          {log.note && (
            <p className="mt-1 text-sm whitespace-pre-line text-slate-700">
              {log.note}
            </p>
          )}
          {log.imagePath && (
            <a
              href={log.imagePath}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={log.imagePath}
                alt="첨부 스크린샷"
                className="max-h-64 rounded-md border border-slate-200"
              />
            </a>
          )}
          {log.filePath && (
            <p className="mt-2 rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">
              {log.filePath}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
