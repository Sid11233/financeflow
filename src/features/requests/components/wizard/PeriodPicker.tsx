import { Select } from '@/components/ui';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function PeriodPicker({
  periodStart,
  onChange,
}: {
  periodStart: string;
  onChange: (periodStart: string, periodLabel: string) => void;
}) {
  const date = new Date(`${periodStart}T00:00:00`);
  const month = date.getMonth();
  const year = date.getFullYear();
  const years = Array.from({ length: 5 }, (_, index) => year - 3 + index);

  function emit(nextMonth: number, nextYear: number) {
    const nextDate = new Date(nextYear, nextMonth, 1);
    onChange(
      nextDate.toISOString().slice(0, 10),
      nextDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    );
  }

  return (
    <div className="flex gap-2">
      <Select value={month} onChange={(event) => emit(Number(event.target.value), year)}>
        {MONTHS.map((name, index) => (
          <option key={name} value={index}>
            {name}
          </option>
        ))}
      </Select>
      <Select value={year} onChange={(event) => emit(month, Number(event.target.value))}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}
