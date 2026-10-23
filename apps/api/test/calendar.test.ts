import { describe, expect, it } from 'vitest';
import { localDate, validTimezone, wateringSchedule } from '../src/calendar';

describe('Calendar watering schedule', () => {
  it('uses the creation day when the last watering is unknown', () => {
    expect(
      wateringSchedule(
        new Date('2026-10-23T12:00Z'),
        null,
        7,
        'Europe/Moscow',
        new Date('2026-10-23T20:00Z'),
      ),
    ).toEqual({ nextWateringOn: '2026-10-23', daysUntil: 0, status: 'today' });
  });
  it('moves the next watering relative to the actual watering', () => {
    expect(
      wateringSchedule(
        new Date('2026-01-01Z'),
        new Date('2026-10-23T12:00Z'),
        7,
        'Europe/Moscow',
        new Date('2026-10-23T12:00Z'),
      ),
    ).toEqual({ nextWateringOn: '2026-10-30', daysUntil: 7, status: 'upcoming' });
  });
  it('counts local calendar days across spring daylight saving changes', () => {
    expect(
      wateringSchedule(
        new Date('2026-01-01Z'),
        new Date('2026-03-07T17:00Z'),
        2,
        'America/New_York',
        new Date('2026-03-08T16:00Z'),
      ),
    ).toMatchObject({ nextWateringOn: '2026-03-09', daysUntil: 1, status: 'upcoming' });
  });
  it('counts local calendar days across autumn daylight saving changes', () => {
    expect(
      wateringSchedule(
        new Date('2026-01-01Z'),
        new Date('2026-10-31T16:00Z'),
        2,
        'America/New_York',
        new Date('2026-11-01T17:00Z'),
      ),
    ).toMatchObject({ nextWateringOn: '2026-11-02', daysUntil: 1, status: 'upcoming' });
  });
  it('uses the account timezone around midnight', () => {
    const now = new Date('2026-10-23T22:30Z');
    expect(localDate(now, 'Europe/Moscow')).toBe('2026-10-24');
    expect(localDate(now, 'America/New_York')).toBe('2026-10-23');
  });
  it('marks overdue dates and recalculates a changed interval', () => {
    const created = new Date('2026-01-01Z'),
      last = new Date('2026-10-20T12:00Z'),
      now = new Date('2026-10-23T12:00Z');
    expect(wateringSchedule(created, last, 2, 'UTC', now)).toMatchObject({
      daysUntil: -1,
      status: 'overdue',
    });
    expect(wateringSchedule(created, last, 5, 'UTC', now)).toMatchObject({
      daysUntil: 2,
      status: 'upcoming',
    });
  });
  it('validates timezones supported by both calendar calculations and browser formatting', () => {
    expect(validTimezone('Europe/Moscow')).toBe(true);
    expect(validTimezone('Not/A_Zone')).toBe(false);
    expect(validTimezone('local')).toBe(false);
    expect(validTimezone('UTC+3')).toBe(false);
  });
});
