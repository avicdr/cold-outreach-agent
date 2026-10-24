import { describe, it, expect } from 'vitest';
import {
  getTimezoneParts,
  createDateInTimezone,
  isWithinSendingWindow,
  getNextSendingWindowDate,
  calculateStaggeredSchedule,
} from '@/lib/scheduler';
import { SendingConfig, Campaign, EmailAccount } from '@/types/database';

describe('Timezone-Aware Scheduler & Staggered Queue Engine', () => {
  const londonConfig: SendingConfig = {
    timezone: 'Europe/London',
    start_hour: 9,
    end_hour: 16,
    days: [1, 2, 3, 4, 5], // Monday through Friday
    daily_limit: 10,
    hourly_limit: 4,
  };

  it('correctly parses timezone parts with 24-hour cycle (00-23)', () => {
    // Midnight UTC on Wednesday Oct 21, 2026
    const midnightUtc = new Date('2026-10-21T00:00:00Z');
    const partsUtc = getTimezoneParts(midnightUtc, 'UTC');
    expect(partsUtc.hour).toBe(0);
    expect(partsUtc.minute).toBe(0);
    expect(partsUtc.weekday).toBe(3); // Wednesday

    // In Europe/London during BST (UTC+1), midnight UTC is 01:00 BST
    const partsLondon = getTimezoneParts(midnightUtc, 'Europe/London');
    expect(partsLondon.hour).toBe(1);
    expect(partsLondon.minute).toBe(0);
  });

  it('accurately converts target timezone wall-clock time to UTC Date', () => {
    // 09:00:00 in Europe/London on Oct 23, 2026 (BST is UTC+1) -> 08:00:00 UTC
    const date = createDateInTimezone(2026, 10, 23, 9, 0, 0, 'Europe/London');
    expect(date.toISOString()).toBe('2026-10-23T08:00:00.000Z');

    // 09:00:00 in Asia/Kolkata on Oct 23, 2026 (UTC+5:30) -> 03:30:00 UTC
    const kolkataDate = createDateInTimezone(2026, 10, 23, 9, 0, 0, 'Asia/Kolkata');
    expect(kolkataDate.toISOString()).toBe('2026-10-23T03:30:00.000Z');
  });

  it('evaluates sending window boundaries strictly in campaign timezone', () => {
    // 08:59:59 London time (07:59:59 UTC) -> False (before start_hour 9)
    const justBefore = new Date('2026-10-21T07:59:59Z');
    expect(isWithinSendingWindow(londonConfig, justBefore)).toBe(false);

    // 09:00:00 London time (08:00:00 UTC) -> True (window open)
    const windowStart = new Date('2026-10-21T08:00:00Z');
    expect(isWithinSendingWindow(londonConfig, windowStart)).toBe(true);

    // 15:59:59 London time (14:59:59 UTC) -> True (inside window)
    const nearEnd = new Date('2026-10-21T14:59:59Z');
    expect(isWithinSendingWindow(londonConfig, nearEnd)).toBe(true);

    // 16:00:00 London time (15:00:00 UTC) -> False (end_hour reached)
    const windowEnd = new Date('2026-10-21T15:00:00Z');
    expect(isWithinSendingWindow(londonConfig, windowEnd)).toBe(false);

    // Saturday 12:00 London time -> False (weekend)
    const saturdayNoon = new Date('2026-10-24T11:00:00Z');
    expect(isWithinSendingWindow(londonConfig, saturdayNoon)).toBe(false);
  });

  it('calculates the next valid sending window date across days and weekends', () => {
    // Thursday evening: 2026-10-22 18:20 London time (17:20 UTC)
    // Next window: Friday Oct 23 at 09:00 BST = 08:00 UTC
    const thursdayNight = new Date('2026-10-22T17:20:00Z');
    const nextFromThursday = getNextSendingWindowDate(londonConfig, thursdayNight);
    expect(nextFromThursday.toISOString()).toBe('2026-10-23T08:00:00.000Z');

    // Friday evening: 2026-10-23 18:00 London time (17:00 UTC)
    // Next window: Monday Oct 26 at 09:00 London time
    // Note: BST ends Sunday Oct 25, 2026, so London is GMT (UTC+0) on Monday Oct 26!
    const fridayNight = new Date('2026-10-23T17:00:00Z');
    const nextFromFriday = getNextSendingWindowDate(londonConfig, fridayNight);
    expect(nextFromFriday.toISOString()).toBe('2026-10-26T09:00:00.000Z');

    // Thursday early morning: 07:00 London time (06:00 UTC)
    // Next window: Today (Thursday) at 09:00 BST = 08:00 UTC
    const thursdayEarly = new Date('2026-10-22T06:00:00Z');
    const nextFromEarly = getNextSendingWindowDate(londonConfig, thursdayEarly);
    expect(nextFromEarly.toISOString()).toBe('2026-10-22T08:00:00.000Z');
  });

  it('generates a staggered multi-lead schedule enforcing hourly and daily limits', () => {
    const campaign: Campaign = {
      id: 'camp-123',
      user_id: 'user-1',
      name: 'Paced Campaign',
      business_context: 'Context',
      ideal_customer_profile: 'ICP',
      offer: 'Offer',
      tone: 'Professional',
      call_to_action: 'Chat',
      initial_email_instructions: 'Instructions',
      sending_config: londonConfig, // hourly_limit: 4 (15m), daily_limit: 10
      followup_config: { max_followups: 0, steps: [] },
      status: 'active',
      activated_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const accounts: EmailAccount[] = [
      {
        id: 'acc-1',
        user_id: 'user-1',
        provider: 'gmail',
        email_address: 'sdr@enterprise.com',
        encrypted_access_token: 'token',
        encrypted_refresh_token: 'refresh',
        token_expires_at: null,
        granted_scopes: [],
        last_sync_at: null,
        connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        daily_limit: 15,
        min_interval_minutes: 15,
        status: 'active',
      },
    ];

    // Schedule 12 leads starting Thursday Oct 22 at 18:20 London time (closed window)
    const schedule = calculateStaggeredSchedule(campaign, accounts, 12, new Date('2026-10-22T17:20:00Z'));

    expect(schedule.length).toBe(12);

    // Lead 1: Friday 09:00 BST (08:00 UTC)
    expect(schedule[0].toISOString()).toBe('2026-10-23T08:00:00.000Z');
    // Lead 2: Friday 09:15 BST (15 minutes later)
    expect(schedule[1].toISOString()).toBe('2026-10-23T08:15:00.000Z');
    // Lead 3: Friday 09:30 BST
    expect(schedule[2].toISOString()).toBe('2026-10-23T08:30:00.000Z');
    // Lead 4: Friday 09:45 BST
    expect(schedule[3].toISOString()).toBe('2026-10-23T08:45:00.000Z');

    // Lead 10: Friday 11:15 BST (10th email = campaign daily limit of 10 reached)
    expect(schedule[9].toISOString()).toBe('2026-10-23T10:15:00.000Z');

    // Lead 11: Rolls over past weekend to Monday Oct 26 at 09:00 London time!
    expect(schedule[10].toISOString()).toBe('2026-10-26T09:00:00.000Z');
    // Lead 12: Monday Oct 26 at 09:15 London time
    expect(schedule[11].toISOString()).toBe('2026-10-26T09:15:00.000Z');
  });

  it('correctly staggers 269 emails across 4 rotating accounts with 69/day capacity', () => {
    const nyConfig: SendingConfig = {
      timezone: 'America/New_York',
      start_hour: 9,
      end_hour: 17,
      days: [1, 2, 3, 4, 5],
      daily_limit: 69,
      hourly_limit: 12,
    };

    const campaign: Campaign = {
      id: 'camp-us-smb',
      user_id: 'user-1',
      name: 'US SMB AI Receptionist Outreach',
      business_context: 'Context',
      ideal_customer_profile: 'ICP',
      offer: 'Offer',
      tone: 'Concise',
      call_to_action: 'Call',
      initial_email_instructions: 'Instructions',
      sending_config: nyConfig,
      followup_config: { max_followups: 0, steps: [] },
      status: 'active',
      activated_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const fourAccounts: EmailAccount[] = [
      {
        id: 'acc-1',
        user_id: 'user-1',
        provider: 'gmail',
        email_address: 'avi.codez.00@gmail.com',
        encrypted_access_token: 'token',
        encrypted_refresh_token: 'refresh',
        token_expires_at: null,
        granted_scopes: [],
        last_sync_at: null,
        connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        daily_limit: 15,
        min_interval_minutes: 5,
        status: 'active',
      },
      {
        id: 'acc-2',
        user_id: 'user-1',
        provider: 'gmail',
        email_address: 'dommxu123@gmail.com',
        encrypted_access_token: 'token',
        encrypted_refresh_token: 'refresh',
        token_expires_at: null,
        granted_scopes: [],
        last_sync_at: null,
        connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        daily_limit: 18,
        min_interval_minutes: 5,
        status: 'active',
      },
      {
        id: 'acc-3',
        user_id: 'user-1',
        provider: 'gmail',
        email_address: 'deepanshinigam3469stella@gmail.com',
        encrypted_access_token: 'token',
        encrypted_refresh_token: 'refresh',
        token_expires_at: null,
        granted_scopes: [],
        last_sync_at: null,
        connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        daily_limit: 18,
        min_interval_minutes: 5,
        status: 'active',
      },
      {
        id: 'acc-4',
        user_id: 'user-1',
        provider: 'gmail',
        email_address: 'patelruddy78@gmail.com',
        encrypted_access_token: 'token',
        encrypted_refresh_token: 'refresh',
        token_expires_at: null,
        granted_scopes: [],
        last_sync_at: null,
        connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        daily_limit: 18,
        min_interval_minutes: 5,
        status: 'active',
      },
    ];

    // Schedule 269 emails starting Saturday Oct 24, 2026 (outside window, rolls to Monday Oct 26 at 09:00 EDT)
    const schedule = calculateStaggeredSchedule(campaign, fourAccounts, 269, new Date('2026-10-24T10:00:00Z'));

    expect(schedule.length).toBe(269);

    // Verify all timestamps are unique (no duplicates!)
    const uniqueTimestamps = new Set(schedule.map((d) => d.toISOString()));
    expect(uniqueTimestamps.size).toBe(269);

    // Verify day 1 starts Monday Oct 26 at 09:00 EDT (13:00 UTC)
    expect(schedule[0].toISOString()).toBe('2026-10-26T13:00:00.000Z');
    // Verify 6-minute spacing
    expect(schedule[1].toISOString()).toBe('2026-10-26T13:06:00.000Z');
    expect(schedule[2].toISOString()).toBe('2026-10-26T13:12:00.000Z');

    // Day 1 has 69 emails (index 0 to 68)
    // Email 69 (index 68): 09:00 + (68 * 6 min = 408 min) = 15:48 EDT (19:48 UTC)
    expect(schedule[68].toISOString()).toBe('2026-10-26T19:48:00.000Z');

    // Day 2 (Tuesday Oct 27) starts at 09:00 EDT (13:00 UTC)
    expect(schedule[69].toISOString()).toBe('2026-10-27T13:00:00.000Z');
    expect(schedule[137].toISOString()).toBe('2026-10-27T19:48:00.000Z');

    // Day 3 (Wednesday Oct 28) starts at 09:00 EDT (13:00 UTC)
    expect(schedule[138].toISOString()).toBe('2026-10-28T13:00:00.000Z');
    expect(schedule[206].toISOString()).toBe('2026-10-28T19:48:00.000Z');

    // Day 4 (Thursday Oct 29) starts at 09:00 EDT (13:00 UTC)
    expect(schedule[207].toISOString()).toBe('2026-10-29T13:00:00.000Z');
    // Email 269 (index 268 = 62nd email on Thursday): 09:00 + (61 * 6 min = 366 min) = 15:06 EDT (19:06 UTC)
    expect(schedule[268].toISOString()).toBe('2026-10-29T19:06:00.000Z');

    // Verify all 269 emails fall within sending window (9am-5pm EDT = 13:00 - 21:00 UTC)
    for (const d of schedule) {
      expect(isWithinSendingWindow(nyConfig, d)).toBe(true);
    }
  });
});

