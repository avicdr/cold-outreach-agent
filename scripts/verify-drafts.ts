import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkiizjcwrrdggdqneuhv.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CAMPAIGN_ID = 'c8376445-b90d-4c3f-bcc8-10403be99d4f';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function check() {
  const { data: cls } = await supabase
    .from('campaign_leads')
    .select('id, lead:leads(company, first_name, email)')
    .eq('campaign_id', CAMPAIGN_ID);

  const clIds = (cls || []).map((c: any) => c.id);

  const { data: msgs } = await supabase
    .from('email_messages')
    .select('id, subject, body_text, status, campaign_lead_id')
    .in('campaign_lead_id', clIds);

  console.log('Total Enrolled Leads:', clIds.length);
  console.log('Total Draft Messages in DB:', msgs?.length);

  const placeholderCount = (msgs || []).filter((m: any) => m.body_text?.includes('{{resume_url}}')).length;
  console.log('Drafts containing {{resume_url}} placeholder:', placeholderCount);

  const clMap = new Map((cls || []).map((c: any) => [c.id, c.lead]));
  for (const m of (msgs || [])) {
    const lead: any = clMap.get(m.campaign_lead_id);
    if (['LangChain', 'Modal', 'Hatchet'].includes(lead?.company)) {
      console.log('\n========================================');
      console.log('Company:', lead?.company, '| To:', lead?.first_name, '<' + lead?.email + '>');
      console.log('Subject:', m.subject);
      console.log('Status:', m.status);
      console.log('Body:\n' + m.body_text);
    }
  }
}

check().catch(console.error);
