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
 * Advances to the start of the next valid sending window day (e.g. 09:00 AM on the next active business day).
 * Properly accounts for campaign timezone, DST transitions, and inactive days/weekends.
 */
export function getNextDayStartWindow(sendingConfig: SendingConfig, fromDate: Date): Date {
  const timeZone = sendingConfig.timezone || env.DEFAULT_TIMEZONE || 'UTC';
  const parts = getTimezoneParts(fromDate, timeZone);
  // Roll over to 00:00:00 on the next calendar day in campaign timezone
  const nextDayMidnight = createDateInTimezone(parts.year, parts.month, parts.day + 1, 0, 0, 0, timeZone);
  return getNextSendingWindowDate(sendingConfig, nextDayMidnight);
}

export interface ScheduledSlotWithAccount {
  date: Date;
  accountId: string;
}

/**
 * Calculates a staggered schedule for a batch of initial emails and distributes
 * each email round-robin among active accounts, respecting:
 * - Campaign sending window (days and start/end hours in campaign timezone)
 * - Multi-account rotation & aggregate daily capacity
 * - Minimum per-account cooldown intervals
 * - Account individual daily limits
 */
export function calculateStaggeredScheduleWithAccounts(
  campaign: Campaign,
  accounts: EmailAccount[],
  count: number,
  fromDate: Date = new Date()
): ScheduledSlotWithAccount[] {
  const sendingConfig = campaign.sending_config;
  const scheduledSlots: ScheduledSlotWithAccount[] = [];
  if (count <= 0) return scheduledSlots;

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const effectiveAccounts = activeAccounts.length > 0 ? activeAccounts : accounts;
  if (effectiveAccounts.length === 0) return scheduledSlots;

  const numAccounts = effectiveAccounts.length;
  const minAccountCooldown = Math.min(
    ...effectiveAccounts.map((a) => a.min_interval_minutes ?? 15).concat(15)
  );
  // Interval between consecutive messages across the rotation pool
  const minRotationCooldown = numAccounts > 1
    ? Math.max(1, Math.ceil(minAccountCooldown / numAccounts))
    : Math.max(minAccountCooldown, 15);

  const startHour = sendingConfig.start_hour ?? 9;
  const endHour = sendingConfig.end_hour ?? 17;
  const windowMinutes = Math.max(60, (endHour - startHour) * 60);

  const accountsDailyCapacity = effectiveAccounts.reduce((sum, a) => sum + (a.daily_limit || 18), 0);
  const dailyLimit = sendingConfig.daily_limit || (accountsDailyCapacity > 0 ? accountsDailyCapacity : 10);

  let intervalMinutes: number;
  if (numAccounts > 1) {
    // Multi-account pacing: spread evenly across the window when capacity is large,
    // but cap pacing at 10 minutes (or minRotationCooldown) so small daily limits don't create huge gaps (like 32m).
    const rawWindowPacing = Math.floor(windowMinutes / dailyLimit);
    const windowPacing = rawWindowPacing > 10 ? minRotationCooldown : rawWindowPacing;
    const targetHourlyRate = Math.ceil(dailyLimit / (windowMinutes / 60));
    // When rotating across multiple inboxes, an old single-inbox default hourly limit of 3 should not bottleneck the pool
    const poolHourlyLimit = numAccounts * Math.max(1, Math.floor(60 / minAccountCooldown));
    const effectiveHourlyLimit = sendingConfig.hourly_limit && sendingConfig.hourly_limit > 3
      ? sendingConfig.hourly_limit
      : Math.max(targetHourlyRate, poolHourlyLimit);
    const hourlyInterval = Math.ceil(60 / effectiveHourlyLimit);
    intervalMinutes = Math.max(minRotationCooldown, windowPacing, hourlyInterval);
  } else if (sendingConfig.hourly_limit && sendingConfig.hourly_limit > 0) {
    const hourlyInterval = Math.ceil(60 / sendingConfig.hourly_limit);
    intervalMinutes = Math.max(minRotationCooldown, hourlyInterval);
  } else {
    // Single account fallback: respect account min_interval (default 15m)
    const singleAccountCooldown = effectiveAccounts[0]?.min_interval_minutes || 15;
    intervalMinutes = Math.max(singleAccountCooldown, 15);
  }

  // Ensure interval is at least 1 minute
  intervalMinutes = Math.max(1, intervalMinutes);

  let currentSlot = getNextSendingWindowDate(sendingConfig, fromDate);
  let prevSlotTime: number | null = null;
  const accountLastSendTime = new Map<string, number>();
  const accountSendsToday = new Map<string, number>();
  let totalSendsToday = 0;
  let nextAccountIdx = 0;

  for (let i = 0; i < count; i++) {
    // 1. If campaign aggregate daily limit reached for today, advance to next business day
    if (totalSendsToday >= dailyLimit) {
      currentSlot = getNextDayStartWindow(sendingConfig, currentSlot);
      accountSendsToday.clear();
      accountLastSendTime.clear();
      prevSlotTime = null;
      totalSendsToday = 0;
    }

    // 2. Find the next available account that has individual daily capacity left today
    let candidateAccount: EmailAccount | null = null;
    let attempts = 0;
    while (attempts < numAccounts) {
      const acc = effectiveAccounts[nextAccountIdx % numAccounts];
      nextAccountIdx++;
      attempts++;
      const sends = accountSendsToday.get(acc.id) || 0;
      const limit = acc.daily_limit || 18;
      if (sends < limit) {
        candidateAccount = acc;
        break;
      }
    }

    // If all individual accounts reached their limits, advance to next day
    if (!candidateAccount) {
      currentSlot = getNextDayStartWindow(sendingConfig, currentSlot);
      accountSendsToday.clear();
      accountLastSendTime.clear();
      prevSlotTime = null;
      totalSendsToday = 0;
      candidateAccount = effectiveAccounts[nextAccountIdx % numAccounts];
      nextAccountIdx++;
    }

    const minIntervalMs = (candidateAccount.min_interval_minutes || 15) * 60 * 1000;
    const lastSendForAccount = accountLastSendTime.get(candidateAccount.id) || 0;

    // 3. Compute earliest valid slot for this email
    let targetTime = currentSlot.getTime();
    if (prevSlotTime !== null) {
      targetTime = Math.max(targetTime, prevSlotTime + intervalMinutes * 60 * 1000);
    }
    if (lastSendForAccount > 0) {
      targetTime = Math.max(targetTime, lastSendForAccount + minIntervalMs);
    }

    let targetDate = new Date(targetTime);

    // 4. If targetDate falls outside sending window (e.g. past endHour), advance to next day
    if (!isWithinSendingWindow(sendingConfig, targetDate)) {
      targetDate = getNextDayStartWindow(sendingConfig, targetDate);
      accountSendsToday.clear();
      accountLastSendTime.clear();
      prevSlotTime = null;
      totalSendsToday = 0;
    }

    // Record slot
    scheduledSlots.push({
      date: targetDate,
      accountId: candidateAccount.id,
    });

    // Update tracking
    accountSendsToday.set(candidateAccount.id, (accountSendsToday.get(candidateAccount.id) || 0) + 1);
    accountLastSendTime.set(candidateAccount.id, targetDate.getTime());
    prevSlotTime = targetDate.getTime();
    totalSendsToday++;
    currentSlot = new Date(targetDate.getTime() + intervalMinutes * 60 * 1000);
  }

  return scheduledSlots;
}

/**
 * Calculates a staggered schedule for a batch of initial emails.
 * Distributes sends smoothly across campaign business hours respecting:
 * - Campaign sending window (days and start/end hours)
 * - Multi-account rotation & aggregate daily capacity
 * - Minimum per-account cooldown intervals
 * - Campaign daily and hourly limits
 */
export function calculateStaggeredSchedule(
  campaign: Campaign,
  accounts: EmailAccount[],
  count: number,
  fromDate: Date = new Date()
): Date[] {
  return calculateStaggeredScheduleWithAccounts(campaign, accounts, count, fromDate).map((s) => s.date);
}

/**
 * Calculates the next available sending slot after an existing schedule or from current time.
 */
export function getNextScheduledSlot(
  campaign: Campaign,
  accounts: EmailAccount[],
  lastScheduledAt?: Date | null,
  fromDate: Date = new Date()
): Date {
  const sendingConfig = campaign.sending_config;
  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const effectiveAccounts = activeAccounts.length > 0 ? activeAccounts : accounts;
  const numAccounts = Math.max(effectiveAccounts.length, 1);

  const minAccountCooldown = Math.min(
    ...effectiveAccounts.map((a) => a.min_interval_minutes ?? 15).concat(15)
  );
  const minRotationCooldown = Math.max(1, Math.ceil(minAccountCooldown / numAccounts));

  const startHour = sendingConfig.start_hour ?? 9;
  const endHour = sendingConfig.end_hour ?? 17;
  const windowMinutes = Math.max(60, (endHour - startHour) * 60);

  const accountsDailyCapacity = effectiveAccounts.reduce((sum, a) => sum + (a.daily_limit || 18), 0);
  const dailyLimit = sendingConfig.daily_limit || (accountsDailyCapacity > 0 ? accountsDailyCapacity : 10);

  let intervalMinutes: number;
  if (numAccounts > 1) {
    const rawWindowPacing = Math.floor(windowMinutes / dailyLimit);
    const windowPacing = rawWindowPacing > 10 ? minRotationCooldown : rawWindowPacing;
    const targetHourlyRate = Math.ceil(dailyLimit / (windowMinutes / 60));
    const poolHourlyLimit = numAccounts * Math.max(1, Math.floor(60 / minAccountCooldown));
    const effectiveHourlyLimit = sendingConfig.hourly_limit && sendingConfig.hourly_limit > 3
      ? sendingConfig.hourly_limit
      : Math.max(targetHourlyRate, poolHourlyLimit);
    const hourlyInterval = Math.ceil(60 / effectiveHourlyLimit);
    intervalMinutes = Math.max(minRotationCooldown, windowPacing, hourlyInterval);
  } else if (sendingConfig.hourly_limit && sendingConfig.hourly_limit > 0) {
    const hourlyInterval = Math.ceil(60 / sendingConfig.hourly_limit);
    intervalMinutes = Math.max(minRotationCooldown, hourlyInterval);
  } else {
    const singleAccountCooldown = effectiveAccounts[0]?.min_interval_minutes || 15;
    intervalMinutes = Math.max(singleAccountCooldown, 15);
  }
  intervalMinutes = Math.max(1, intervalMinutes);

  if (!lastScheduledAt || lastScheduledAt.getTime() < fromDate.getTime()) {
    return getNextSendingWindowDate(sendingConfig, fromDate);
  }

  const nextSlot = new Date(lastScheduledAt.getTime() + intervalMinutes * 60 * 1000);
  if (!isWithinSendingWindow(sendingConfig, nextSlot)) {
    return getNextDayStartWindow(sendingConfig, nextSlot);
  }

  return nextSlot;
}

