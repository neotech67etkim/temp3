export function TransferredBadge({ transferred }: { transferred: boolean }) {
  if (!transferred) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
      이관됨
    </span>
  );
}
