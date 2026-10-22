import { SendingConfig, Campaign, EmailAccount } from '@/types/database';
import { env } from './env';

const DAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Extracts date and time components in a target timezone using Intl.DateTimeFormat with hourCycle: h23.
 */
export function getTimezoneParts(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || env.DEFAULT_TIMEZONE || 'UTC',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });

    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;

    return {
      year: parseInt(get('year') || '1970', 10),
      month: parseInt(get('month') || '1', 10), // 1-indexed (1-12)
      day: parseInt(get('day') || '1', 10),
      weekday: DAY_MAP[get('weekday') || 'Sun'] ?? 0,
      hour: parseInt(get('hour') || '0', 10),
      minute: parseInt(get('minute') || '0', 10),
      second: parseInt(get('second') || '0', 10),
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      weekday: date.getUTCDay(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }
}

/**
 * Creates an exact UTC Date object representing a specific target timezone date and time.
 * Automatically accounts for Daylight Saving Time (DST) transitions.
 */
export function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  try {
    const tzParts = getTimezoneParts(guessUtc, timeZone);
    const asUtc = Date.UTC(tzParts.year, tzParts.month - 1, tzParts.day, tzParts.hour, tzParts.minute, tzParts.second);
    const diffMs = asUtc - guessUtc.getTime();
    return new Date(guessUtc.getTime() - diffMs);
  } catch {
    return guessUtc;
  }
}

/**
 * Checks if current or provided time is within campaign sending window (days and hours in configured timezone).
 */
export function isWithinSendingWindow(sendingConfig: SendingConfig, date: Date = new Date()): boolean {
  try {
    const timeZone = sendingConfig.timezone || env.DEFAULT_TIMEZONE || 'UTC';
    const parts = getTimezoneParts(date, timeZone);

    const allowedDays = sendingConfig.days && sendingConfig.days.length > 0 ? sendingConfig.days : [1, 2, 3, 4, 5];
    if (!allowedDays.includes(parts.weekday)) {
      return false;
    }

    const startHour = sendingConfig.start_hour ?? 9;
    const endHour = sendingConfig.end_hour ?? 17;

    return parts.hour >= startHour && parts.hour < endHour;
  } catch {
    return true;
  }
}

/**
 * Computes the exact Date when the next valid sending window opens in the campaign's timezone.
 * Skips weekends/inactive days and advances to start_hour.
 */
export function getNextSendingWindowDate(sendingConfig: SendingConfig, fromDate: Date = new Date()): Date {
  const timeZone = sendingConfig.timezone || env.DEFAULT_TIMEZONE || 'UTC';
  const allowedDays = sendingConfig.days && sendingConfig.days.length > 0 ? sendingConfig.days : [1, 2, 3, 4, 5];
  const startHour = sendingConfig.start_hour ?? 9;
  const endHour = sendingConfig.end_hour ?? 17;

  for (let offsetDays = 0; offsetDays <= 14; offsetDays++) {
    const candidate = new Date(fromDate.getTime() + offsetDays * 86400000);
    const parts = getTimezoneParts(candidate, timeZone);

    if (offsetDays === 0) {
      if (allowedDays.includes(parts.weekday)) {
        if (parts.hour < startHour) {
          return createDateInTimezone(parts.year, parts.month, parts.day, startHour, 0, 0, timeZone);
        }
        if (parts.hour < endHour) {
          return fromDate; // Currently inside sending window
        }
      }
      continue;
    }

    if (allowedDays.includes(parts.weekday)) {
      return createDateInTimezone(parts.year, parts.month, parts.day, startHour, 0, 0, timeZone);
    }
  }

  // Fallback: 24 hours later
  return new Date(fromDate.getTime() + 86400000);
}

/**
 * Calculates a staggered schedule for a batch of initial emails.
 * Distributes sends smoothly across campaign business hours respecting:
 * - Campaign sending window
 * - Campaign daily limit & hourly limit
 * - Email account min_interval_minutes cooldown
 */
export function calculateStaggeredSchedule(
  campaign: Campaign,
  accounts: EmailAccount[],
  count: number,
  fromDate: Date = new Date()
): Date[] {
  const sendingConfig = campaign.sending_config;
  const scheduledDates: Date[] = [];

  const minInterval = Math.max(...accounts.map((a) => a.min_interval_minutes || 15).concat(15));
  const hourlyInterval = sendingConfig.hourly_limit > 0 ? Math.ceil(60 / sendingConfig.hourly_limit) : 15;
  const intervalMinutes = Math.max(minInterval, hourlyInterval);
  const dailyLimit = sendingConfig.daily_limit || 10;

  let currentSlot = getNextSendingWindowDate(sendingConfig, fromDate);
  let sendsToday = 0;

  for (let i = 0; i < count; i++) {
    if (!isWithinSendingWindow(sendingConfig, currentSlot) || sendsToday >= dailyLimit) {
      const nextDay = new Date(currentSlot.getTime() + 24 * 60 * 60 * 1000);
      currentSlot = getNextSendingWindowDate(sendingConfig, nextDay);
      sendsToday = 0;
    }

    scheduledDates.push(new Date(currentSlot.getTime()));
    sendsToday++;

    currentSlot = new Date(currentSlot.getTime() + intervalMinutes * 60 * 1000);
  }

  return scheduledDates;
}
