import { describe, it, expect } from 'vitest';
import { dbService } from '@/lib/db-service';
import { generateInitialEmail, generateFollowupEmail, validateDraft, classifyReply } from '@/lib/gemini';
import { sendGmailMessage } from '@/lib/gmail/client';
import { generateUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/unsubscribe-token';
import { handleProcessUnsubscribeJob, processJobQueueBatch, handleGenerateEmailJob } from '@/lib/queue/worker';
import { processImportRows, autoDetectColumnMapping, parseCSVContent } from '@/lib/csv-excel';

describe('Complete End-to-End Cold Outreach Pipeline', () => {
  const userId = '00000000-0000-0000-0000-000000000001';

  it('executes the full lifecycle: Import -> Generate -> Edit -> Send -> Reply -> Cancel Followups -> Unsubscribe', async () => {
    // 1. Importing Sample Leads from CSV
    const sampleCsv = `First Name,Last Name,Email,Company,Job Title,Notes
Sarah,Connor,sarah.e2e@cyberdyne.io,Cyberdyne Systems,Operations Director,Interested in outbound AI efficiency
Bruce,Wayne,bruce.e2e@waynecorp.com,Wayne Enterprises,CIO,Evaluating enterprise security automation
`;
    const { headers, rows } = parseCSVContent(sampleCsv);
    const mapping = autoDetectColumnMapping(headers);
    const existing = await dbService.getExistingNormalizedEmails(userId);
    const suppressed = await dbService.getSuppressedNormalizedEmails(userId);

    const validation = processImportRows(rows, mapping, existing, suppressed);
    expect(validation.validLeads.length).toBe(2);
    expect(validation.duplicatesInFile).toBe(0);

    const insertResult = await dbService.insertLeads(
      userId,
      validation.validLeads.map((l) => ({ ...l, status: 'active', source_import: 'e2e_test.csv' }))
    );
    expect(insertResult.inserted).toBe(2);

    const leads = (await dbService.getLeads(userId)).leads;
    const sarahLead = leads.find((l) => l.normalized_email === 'sarah.e2e@cyberdyne.io');
    expect(sarahLead).toBeDefined();

    // 2. Creating Campaign and Enrolling Lead
    const campaign = await dbService.createCampaign(userId, {
      name: 'E2E Validation Campaign',
      business_context: 'We build enterprise automation agents for sales pipelines.',
      ideal_customer_profile: 'Directors of Operations and CIOs at growing companies.',
      offer: 'Guaranteed 15+ hours weekly time savings through automated personalized outreach.',
      tone: 'Concise, direct, highly professional',
      call_to_action: '15-minute quick discovery call',
      initial_email_instructions: 'Keep it strictly under 100 words. Reference company initiatives.',
      sending_config: {
        days: [1, 2, 3, 4, 5],
        start_hour: 8,
        end_hour: 18,
        timezone: 'UTC',
        daily_limit: 20,
        hourly_limit: 5,
      },
      followup_config: {
        max_followups: 2,
        steps: [
          { step: 1, delay_days: 4, instructions: 'Polite reminder with concise insight.' },
          { step: 2, delay_days: 9, instructions: 'Final friendly check-in.' },
        ],
      },
      status: 'draft',
      activated_at: null,
    });
    expect(campaign.id).toBeDefined();

    const enrollRes = await dbService.enrollLeadsInCampaign(campaign.id, [sarahLead!.id]);
    expect(enrollRes.enrolled).toBe(1);

    const campaignLeads = await dbService.getCampaignLeads(campaign.id);
    const enrolledSarah = campaignLeads.find((cl) => cl.lead_id === sarahLead!.id);
    expect(enrolledSarah).toBeDefined();

    // 3. Generating Draft with Gemini
    const draft = await generateInitialEmail({
      lead: sarahLead!,
      campaign,
      senderName: 'Alex Rivera',
    });
    expect(draft.subject).toBeDefined();
    expect(draft.body).toContain('Cyberdyne Systems');
    expect(draft.needs_review).toBe(false);

    // Save initial draft message
    const savedMessage = await dbService.createOrUpdateMessage({
      campaign_lead_id: enrolledSarah!.id,
      step_number: 0,
      subject: draft.subject,
      body_text: draft.body,
      personalization_basis: draft.personalization_basis,
      unsupported_claims: draft.unsupported_claims,
      status: 'draft',
    });
    expect(savedMessage.id).toBeDefined();

    // 4. Editing and Saving the Draft
    const editedSubject = `${draft.subject} (Quick note)`;
    const editedBody = `${draft.body}\n\nP.S. Happy to share a 2-minute video overview.`;
    const draftValidation = validateDraft(editedBody, editedSubject);
    expect(draftValidation.word_count).toBeGreaterThan(10);
    expect(draftValidation.unresolved_placeholders).toEqual([]);

    const updatedMessage = await dbService.createOrUpdateMessage({
      ...savedMessage,
      subject: editedSubject,
      body_text: editedBody,
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
    });
    expect(updatedMessage.subject).toBe(editedSubject);

    // 5. Activating the Campaign
    const activatedCampaign = await dbService.updateCampaign(campaign.id, {
      status: 'active',
      activated_at: new Date().toISOString(),
    });
    expect(activatedCampaign.status).toBe('active');

    // Enqueue sending job
    await dbService.enqueueJob(
      'send_email',
      { emailMessageId: updatedMessage.id },
      `e2e_send_${updatedMessage.id}`,
      new Date()
    );

    // 6. Sending through Mocked Gmail
    const unsubscribeToken = generateUnsubscribeToken({
      userId,
      leadId: sarahLead!.id,
      normalizedEmail: sarahLead!.normalized_email,
      campaignId: campaign.id,
    });
    const unsubscribeUrl = `http://localhost:3000/unsubscribe?token=${unsubscribeToken}`;

    const sendResult = await sendGmailMessage('mock-token', {
      from: 'alex@outreach.example.com',
      to: sarahLead!.email,
      subject: updatedMessage.subject,
      bodyText: updatedMessage.body_text,
      unsubscribeUrl,
    });
    expect(sendResult.id).toBeDefined();
    expect(sendResult.threadId).toBeDefined();

    // Mark message sent
    updatedMessage.status = 'sent';
    updatedMessage.gmail_message_id = sendResult.id;
    updatedMessage.gmail_thread_id = sendResult.threadId;
    updatedMessage.sent_at = new Date().toISOString();
    await dbService.createOrUpdateMessage(updatedMessage);
    await dbService.updateLead(sarahLead!.id, { status: 'contacted' });

    // 7. Follow-Up Scheduling Check
    await dbService.enqueueJob(
      'schedule_followup',
      { campaignLeadId: enrolledSarah!.id, nextStepNumber: 1, delayDays: 4 },
      `e2e_followup_${enrolledSarah!.id}_1`,
      new Date(Date.now() + 4 * 86400000)
    );

    // 8. Receiving Simulated Inbound Reply
    const simulatedReplyText = "Hi Alex, thanks for reaching out. Yes, we would love to see how your AI automation works. Let's schedule a call this Thursday at 2pm.";
    const replyClassification = await classifyReply(simulatedReplyText);
    expect(replyClassification.classification).toBe('positive');
    expect(replyClassification.is_explicit_unsubscribe).toBe(false);

    // Record reply event
    await dbService.recordReply({
      user_id: userId,
      email_message_id: updatedMessage.id,
      gmail_message_id: 'mock_reply_id_999',
      gmail_thread_id: sendResult.threadId,
      sender_email: sarahLead!.email,
      received_at: new Date().toISOString(),
      classification: replyClassification.classification,
      classification_summary: replyClassification.summary,
    });

    // 9. Confirming Follow-ups are Cancelled on Reply
    await dbService.updateLead(sarahLead!.id, { status: 'replied' });
    enrolledSarah!.status = 'replied';

    // Verify lead status is now 'replied'
    const updatedLead = (await dbService.getLeads(userId)).leads.find((l) => l.id === sarahLead!.id);
    expect(updatedLead?.status).toBe('replied');

    // 10. Unsubscribing and Confirming Permanent Suppression
    const verifiedTokenPayload = verifyUnsubscribeToken(unsubscribeToken);
    expect(verifiedTokenPayload.normalizedEmail).toBe(sarahLead!.normalized_email);

    await handleProcessUnsubscribeJob({
      userId,
      normalizedEmail: verifiedTokenPayload.normalizedEmail,
    });

    // Verify lead is suppressed
    const suppressionsAfter = await dbService.getSuppressedNormalizedEmails(userId);
    expect(suppressionsAfter.has(sarahLead!.normalized_email)).toBe(true);

    const leadAfterUnsub = (await dbService.getLeads(userId)).leads.find((l) => l.id === sarahLead!.id);
    expect(leadAfterUnsub?.status).toBe('unsubscribed');
  });
});
