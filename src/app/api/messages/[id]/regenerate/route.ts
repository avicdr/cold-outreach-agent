import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { generateInitialEmail, generateFollowupEmail, validateDraft } from '@/lib/gemini';
import { z } from 'zod';

const regenerateSchema = z.object({
  custom_instructions: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const message = await dbService.getMessage(id);
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.status === 'sent') {
      return NextResponse.json({ error: 'Cannot regenerate an already sent message' }, { status: 400 });
    }

    let customInstructions = '';
    try {
      const body = await request.json();
      const parsed = regenerateSchema.parse(body);
      customInstructions = parsed.custom_instructions || '';
    } catch {
      // Body is optional
    }

    const cl = (message as any).campaign_lead || (await dbService.getCampaignLead(message.campaign_lead_id));
    if (!cl) {
      return NextResponse.json({ error: 'Campaign lead not found' }, { status: 404 });
    }

    const campaign = await dbService.getCampaign(cl.campaign_id);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const lead = cl.lead || message.lead;
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const profile = await dbService.getProfile(user.id);

    let newDraft;
    if (message.step_number === 0) {
      newDraft = await generateInitialEmail({
        lead,
        campaign: {
          ...campaign,
          initial_email_instructions: customInstructions
            ? `${campaign.initial_email_instructions} - Additional note: ${customInstructions}`
            : campaign.initial_email_instructions,
        },
        senderName: profile.sender_name || 'Outreach Team',
      });
    } else {
      newDraft = await generateFollowupEmail({
        lead,
        campaign,
        stepNumber: message.step_number,
        stepInstructions: customInstructions || 'Follow-up note',
        previousSubject: message.subject,
        previousBody: message.body_text,
        senderName: profile.sender_name || 'Outreach Team',
      });
    }

    const updated = await dbService.createOrUpdateMessage({
      ...message,
      subject: newDraft.subject,
      body_text: newDraft.body,
      personalization_basis: newDraft.personalization_basis,
      unsupported_claims: newDraft.unsupported_claims,
      status: 'draft',
    });

    const validation = validateDraft(updated.body_text, updated.subject);

    return NextResponse.json({
      message: updated,
      validation,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
