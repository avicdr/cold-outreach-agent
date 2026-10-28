import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { mockDb } from '@/lib/supabase/mock-db';
import { OWNER_USER_ID } from '@/lib/auth';
import { POST as resumeUrlPost } from '@/app/api/campaigns/[id]/resume-url/route';

describe('Campaign Resume URL Injection API', () => {
  const userId = OWNER_USER_ID;

  beforeEach(() => {
    mockDb.campaigns.clear();
    mockDb.campaignLeads.clear();
    mockDb.emailMessages.clear();
    mockDb.leads.clear();
  });

  it('updates campaign resume_url and replaces {{resume_url}} in all drafts', async () => {
    // 1. Create Campaign
    const campaign = await dbService.createCampaign(userId, {
      name: 'Founder Outreach - AI Engineer',
      business_context: 'Reaching out to AI founders for engineering roles',
      ideal_customer_profile: 'Tech Founders',
      offer: 'Applied AI Engineer / Intern',
      tone: 'Concise and technical',
      call_to_action: 'Quick 5 min chat',
      initial_email_instructions: 'Highlight LangGraph and autonomous agents',
      status: 'draft',
      activated_at: null,
      sending_config: {
        days: [1, 2, 3, 4, 5],
        start_hour: 9,
        end_hour: 17,
        timezone: 'UTC',
        daily_limit: 20,
        hourly_limit: 5,
      },
      followup_config: {
        max_followups: 2,
        steps: [],
      },
    });

    // 2. Create lead and enrollment
    const insertRes = await dbService.insertLeads(userId, [
      {
        email: 'harrison@langchain.dev',
        normalized_email: 'harrison@langchain.dev',
        first_name: 'Harrison',
        last_name: 'Chase',
        company: 'LangChain',
        job_title: 'CEO',
        website: 'https://langchain.com',
        notes: '',
        custom_fields: {},
        status: 'active',
        source_import: 'test.csv',
      },
    ]);
    const lead = (await dbService.getLeads(userId)).leads[0];
    const enrollRes = await dbService.enrollLeadsInCampaign(campaign.id, [lead.id]);
    const campaignLeads = await dbService.getCampaignLeads(campaign.id);
    const clId = campaignLeads[0].id;

    // 3. Create draft with {{resume_url}} placeholder
    const draftMsg = await dbService.createOrUpdateMessage({
      campaign_lead_id: clId,
      step_number: 0,
      subject: 'LangChain - Applied AI inquiry',
      body_text: 'Hi Harrison,\n\nYou can review my resume here: {{resume_url}}\n\nBest,\nAvi',
      status: 'draft',
    });

    expect(draftMsg.body_text).toContain('{{resume_url}}');

    // 4. Call POST /api/campaigns/[id]/resume-url
    const liveResumeUrl = 'https://drive.google.com/file/d/123456789/view?usp=sharing';
    const req = new Request(`http://localhost:3000/api/campaigns/${campaign.id}/resume-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_url: liveResumeUrl }),
    });

    const res = await resumeUrlPost(req as any, { params: Promise.resolve({ id: campaign.id }) });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.updated_drafts_count).toBe(1);
    expect(data.resume_url).toBe(liveResumeUrl);

    // 5. Verify updated draft body in db
    const updatedMessages = await dbService.getMessages({ campaignId: campaign.id });
    expect(updatedMessages[0].body_text).toContain(liveResumeUrl);
    expect(updatedMessages[0].body_text).not.toContain('{{resume_url}}');

    // 6. Verify subsequent update (changing resume URL)
    const newResumeUrl = 'https://readcv.com/avi-engineer';
    const req2 = new Request(`http://localhost:3000/api/campaigns/${campaign.id}/resume-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_url: newResumeUrl }),
    });

    const res2 = await resumeUrlPost(req2 as any, { params: Promise.resolve({ id: campaign.id }) });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.updated_drafts_count).toBe(1);

    const reUpdatedMessages = await dbService.getMessages({ campaignId: campaign.id });
    expect(reUpdatedMessages[0].body_text).toContain(newResumeUrl);
    expect(reUpdatedMessages[0].body_text).not.toContain(liveResumeUrl);
  });
});
