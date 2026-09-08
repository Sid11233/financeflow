export function DeadlineLine({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${deadline}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const formatted = due.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  let className = 'text-neutral-500';
  let text = `Due ${formatted}`;

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    className = 'font-medium text-red-600';
    text = `${overdueDays} day${overdueDays === 1 ? '' : 's'} past due (${formatted})`;
  } else if (diffDays <= 3) {
    className = 'font-medium text-amber-600';
    text = diffDays === 0 ? 'Due today' : `Due in ${diffDays} day${diffDays === 1 ? '' : 's'} (${formatted})`;
  }

  return <p className={`mt-2 text-sm ${className}`}>{text}</p>;
}
