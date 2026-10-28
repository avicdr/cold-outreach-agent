import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { parseCSVContent, autoDetectColumnMapping, processImportRows } from '../src/lib/csv-excel';

import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkiizjcwrrdggdqneuhv.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USER_ID = '5f9832c0-d340-4e0f-b2d8-b3f44a294697';
const SENDER_INBOX_ID = 'b5cb5ef9-740c-4e27-b837-078d493566f2'; // avi.codez.00@gmail.com

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log('🚀 Starting Founder Leads Ingestion & Campaign Setup...');

  // 1. Read CSV
  const csvPath = path.resolve(process.cwd(), 'data/founders_200.csv');
  const text = fs.readFileSync(csvPath, 'utf8');
  const { headers, rows } = parseCSVContent(text);
  const mapping = autoDetectColumnMapping(headers);

  // 2. Fetch existing emails to prevent duplicate insertion
  const { data: existingDbLeads, error: fetchErr } = await supabase
    .from('leads')
    .select('normalized_email')
    .eq('user_id', USER_ID);

  if (fetchErr) {
    console.error('Error fetching existing leads:', fetchErr.message);
  }

  const existingEmails = new Set<string>((existingDbLeads || []).map((l: any) => l.normalized_email));
  const suppressedEmails = new Set<string>();

  // 3. Ensure Lead Group exists
  let groupId: string | null = null;
  const { data: existingGroups } = await supabase
    .from('lead_groups')
    .select('id, name')
    .eq('user_id', USER_ID)
    .eq('name', 'AI & Tech Founders (200 Startups)')
    .maybeSingle();

  if (existingGroups) {
    groupId = existingGroups.id;
    console.log(`Found existing lead group: ${existingGroups.name} (${groupId})`);
  } else {
    const { data: newGroup, error: groupErr } = await supabase
      .from('lead_groups')
      .insert({
        user_id: USER_ID,
        name: 'AI & Tech Founders (200 Startups)',
        description: '200 high-growth AI infrastructure, dev tools, and coding agent startups for job & internship outreach.',
      })
      .select('id')
      .single();

    if (groupErr) {
      console.warn('Could not create lead_groups table entry (table might not exist or schema variation):', groupErr.message);
    } else {
      groupId = newGroup.id;
      console.log(`Created lead group: AI & Tech Founders (200 Startups) (${groupId})`);
    }
  }

  // 4. Process Rows
  const validation = processImportRows(rows, mapping, existingEmails, suppressedEmails, groupId);
  console.log(`Parsed ${rows.length} rows. Valid new leads to insert: ${validation.validLeads.length}`);

  if (validation.validLeads.length > 0) {
    // Insert in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < validation.validLeads.length; i += BATCH_SIZE) {
      const batch = validation.validLeads.slice(i, i + BATCH_SIZE).map((l) => ({
        user_id: USER_ID,
        normalized_email: l.normalized_email,
        email: l.email,
        first_name: l.first_name,
        last_name: l.last_name,
        company: l.company,
        job_title: l.job_title,
        website: l.website,
        notes: l.notes,
        custom_fields: l.custom_fields,
        status: 'active',
        source_import: 'data/founders_200.csv',
        group_id: groupId,
      }));

      const { error: insertErr } = await supabase.from('leads').insert(batch);
      if (insertErr) {
        console.error(`Batch insert failed at ${i}:`, insertErr.message);
      } else {
        console.log(`Inserted leads ${i + 1} - ${i + batch.length}`);
      }
    }
  } else {
    console.log('All leads already present in database.');
  }

  // 5. Ensure Campaign is configured and locked to single inbox
  const { data: existingCamp } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('user_id', USER_ID)
    .eq('name', 'Founder Outreach - Applied AI & Systems Engineer')
    .maybeSingle();

  let campaignId = existingCamp?.id;
  if (!campaignId) {
    const { data: newCamp, error: campErr } = await supabase
      .from('campaigns')
      .insert({
        user_id: USER_ID,
        name: 'Founder Outreach - Applied AI & Systems Engineer',
        status: 'draft',
        business_context: 'Full-stack AI developer with experience in LangGraph, TypeScript, Python, LLM orchestration, and high-performance agentic pipelines.',
        ideal_customer_profile: 'Founders and CTOs of AI Infrastructure, DevTools, and Agent startups',
        offer: 'Applied AI / AI Systems Engineer internship or role (Python, LangGraph, LLM orchestration)',
        tone: 'Humble, high-signal, peer-to-peer technical',
        call_to_action: 'Brief 5-minute chat or pointer to engineering team; resume and GitHub linked',
        initial_email_instructions: 'Lead with the company verified tech stack and custom outreach hook. Strict 60-90 words. Mention my resume link and GitHub.',
        sending_config: {
          days: [1, 2, 3, 4, 5],
          start_hour: 9,
          end_hour: 18,
          timezone: 'Asia/Kolkata',
          daily_limit: 15,
          hourly_limit: 3,
        },
        followup_config: {
          max_followups: 2,
          steps: [
            { step: 1, delay_days: 4, instructions: 'Polite reminder with a concrete technical insight or code benchmark' },
            { step: 2, delay_days: 9, instructions: 'Friendly breakup note closing the loop and keeping resume on file' },
          ],
        },
      })
      .select('id')
      .single();

    if (campErr) {
      console.error('Campaign creation failed:', campErr.message);
    } else {
      campaignId = newCamp.id;
      console.log(`Created campaign: Founder Outreach - Applied AI & Systems Engineer (${campaignId})`);
    }
  } else {
    console.log(`Campaign already exists (${campaignId})`);
  }

  // 6. Enroll leads into campaign if not already enrolled
  if (campaignId) {
    const { data: allLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('source_import', 'data/founders_200.csv');

    const leadIds = (allLeads || []).map((l: any) => l.id);
    console.log(`Total founder leads eligible for campaign: ${leadIds.length}`);

    const { data: enrolled } = await supabase
      .from('campaign_leads')
      .select('lead_id')
      .eq('campaign_id', campaignId);

    const enrolledSet = new Set((enrolled || []).map((e: any) => e.lead_id));
    const toEnroll = leadIds.filter((id: string) => !enrolledSet.has(id));

    console.log(`New leads to enroll: ${toEnroll.length}`);

    if (toEnroll.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < toEnroll.length; i += BATCH_SIZE) {
        const batch = toEnroll.slice(i, i + BATCH_SIZE).map((lead_id: string) => ({
          campaign_id: campaignId,
          lead_id,
          status: 'enrolled',
          current_step: 0,
        }));
        const { error: enrollErr } = await supabase.from('campaign_leads').insert(batch);
        if (enrollErr) {
          console.error(`Enrollment batch failed:`, enrollErr.message);
        } else {
          console.log(`Enrolled leads ${i + 1} - ${i + batch.length}`);
        }
      }
    }
  }

  console.log('✅ Setup completed successfully!');
}

run().catch(console.error);
