export function getCurrentPeriod(): { periodStart: string; periodLabel: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodLabel: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

export function getTimeOfDayGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'there';
  return fullName.trim().split(/\s+/)[0] || 'there';
}

export function formatRelativeDeadline(deadline: string | null): string {
  if (!deadline) return 'No deadline';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${deadline}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Due today';
  if (diffDays > 0) return `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  const overdueDays = Math.abs(diffDays);
  return `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`;
}

export function formatLastReminder(lastReminderSentAt: string | null): string {
  if (!lastReminderSentAt) return 'Never';
  return new Date(lastReminderSentAt).toLocaleDateString();
}
