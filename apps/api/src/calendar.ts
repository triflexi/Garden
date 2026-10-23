import { DateTime } from 'luxon';

export function validTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: zone }).format();
    return DateTime.now().setZone(zone).isValid;
  } catch {
    return false;
  }
}

export function localDate(date: Date, timezone: string) {
  return DateTime.fromJSDate(date, { zone: timezone }).toISODate()!;
}

export function wateringSchedule(
  createdAt: Date,
  lastWateredAt: Date | null,
  intervalDays: number,
  timezone: string,
  now = new Date(),
) {
  const today = DateTime.fromJSDate(now, { zone: timezone }).startOf('day');
  const base = DateTime.fromJSDate(lastWateredAt ?? createdAt, { zone: timezone }).startOf('day');
  const due = lastWateredAt ? base.plus({ days: intervalDays }) : base;
  const daysUntil = Math.round(due.diff(today, 'days').days);
  return {
    nextWateringOn: due.toISODate()!,
    daysUntil,
    status: daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'today' : 'upcoming',
  };
}
