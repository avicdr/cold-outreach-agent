import { dbService } from '../db-service';
import { discoverBusinesses } from './providers';
import { enrichDiscoveredBusiness } from './enrichment';
import { qualifyBusinessWithGemini } from './qualification';
import { DiscoveryJob, Lead } from '@/types/database';

export interface DiscoveryExecutionStats {
  jobId: string;
  discovered: number;
  newLeadsCreated: number;
  existingLeadsUpdated: number;
  qualified: number;
  highPriority: number;
  enrolledInCampaign: number;
  errors: string[];
}

export async function executeDiscoveryJob(
  jobId: string,
  preferredProvider?: string
): Promise<DiscoveryExecutionStats> {
  const job = await dbService.getDiscoveryJob(jobId);
  if (!job) {
    throw new Error(`Discovery job not found: ${jobId}`);
  }

  // Set job status to running
  await dbService.updateDiscoveryJob(jobId, {
    status: 'running',
    last_run_at: new Date().toISOString(),
    error_message: null,
  });

  const stats: DiscoveryExecutionStats = {
    jobId,
    discovered: 0,
    newLeadsCreated: 0,
    existingLeadsUpdated: 0,
    qualified: 0,
    highPriority: 0,
    enrolledInCampaign: 0,
    errors: [],
  };

  try {
    // 1. Discover businesses
    const rawBusinesses = await discoverBusinesses(
      {
        niche: job.niche,
        location: job.location,
        country: job.country,
        radius_km: job.radius_km,
        target_count: job.target_count,
      },
      preferredProvider
    );

    stats.discovered = rawBusinesses.length;

    const enrolledLeadIds: string[] = [];

    // 2. Process each discovered business: Enrich -> Qualify -> Deduplicate -> Store
    for (const raw of rawBusinesses) {
      try {
        // A. Enrich business
        const enriched = await enrichDiscoveredBusiness(raw, true);

        // B. Qualify with Gemini / Rubric
        const qualification = await qualifyBusinessWithGemini(enriched);

        // C. Multi-signal Deduplication & Storage
        const { lead, isNew } = await dbService.saveOrUpdateDiscoveredLead(job.user_id, {
          company: enriched.name,
          first_name: '',
          last_name: '',
          job_title: 'Practice Owner / Manager',
          email: enriched.email,
          phone: enriched.phone,
          normalized_phone: enriched.normalized_phone,
          website: enriched.website,
          canonical_domain: enriched.canonical_domain,
          address: enriched.address,
          city: enriched.city,
          state: enriched.state,
          country: enriched.country,
          place_id: enriched.place_id,
          category: enriched.category,
          subcategory: enriched.subcategory,
          rating: enriched.rating,
          review_count: enriched.review_count,
          google_maps_url: enriched.google_maps_url,
          booking_url: enriched.booking_url,
          has_online_booking: enriched.has_online_booking,
          contact_channels: enriched.contact_channels,
          observed_friction: qualification.observed_friction,
          qualification_score: qualification.lead_score,
          qualification_priority: qualification.priority,
          qualification_confidence: qualification.confidence,
          qualification_summary: qualification.qualification_summary,
          sales_angle: qualification.recommended_sales_angle,
          suggested_opening: qualification.suggested_opening,
          evidence_urls: enriched.evidence_urls,
          discovery_job_id: job.id,
          discovery_source: enriched.discovery_source,
          notes: qualification.unknowns.length > 0 ? `Unknowns: ${qualification.unknowns.join('; ')}` : '',
        });

        if (isNew) {
          stats.newLeadsCreated++;
        } else {
          stats.existingLeadsUpdated++;
        }

        if (qualification.lead_score >= job.min_qualification_score) {
          stats.qualified++;
          if (qualification.priority === 'high') {
            stats.highPriority++;
          }

          // D. Auto-enroll into campaign if enabled and campaign configured
          if (job.auto_enroll_enabled && job.auto_enroll_campaign_id) {
            enrolledLeadIds.push(lead.id);
          }
        }
      } catch (itemErr: any) {
        console.error(`[DiscoveryService] Error processing business ${raw.name}:`, itemErr.message);
        stats.errors.push(`${raw.name}: ${itemErr.message}`);
      }
    }

    // Auto-enroll eligible leads into campaign
    if (enrolledLeadIds.length > 0 && job.auto_enroll_campaign_id) {
      try {
        const { enrolled } = await dbService.enrollLeadsInCampaign(
          job.auto_enroll_campaign_id,
          enrolledLeadIds
        );
        stats.enrolledInCampaign = enrolled;
      } catch (enrollErr: any) {
        console.error('[DiscoveryService] Failed to auto-enroll leads into campaign:', enrollErr.message);
        stats.errors.push(`Campaign enrollment error: ${enrollErr.message}`);
      }
    }

    // 3. Compute next schedule for recurring jobs
    let nextRunAt: string | null = null;
    const now = new Date();
    if (job.schedule_frequency === 'daily') {
      nextRunAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    } else if (job.schedule_frequency === 'weekly') {
      nextRunAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    // 4. Mark job completed
    await dbService.updateDiscoveryJob(jobId, {
      status: 'completed',
      discovered_count: (job.discovered_count || 0) + stats.discovered,
      qualified_count: (job.qualified_count || 0) + stats.qualified,
      high_priority_count: (job.high_priority_count || 0) + stats.highPriority,
      enrolled_count: (job.enrolled_count || 0) + stats.enrolledInCampaign,
      next_run_at: nextRunAt,
      error_message: stats.errors.length > 0 ? stats.errors.slice(0, 3).join('; ') : null,
    });

    // 5. Activity log
    await dbService.logActivity(
      job.user_id,
      'discovery_job_completed',
      'discovery_job',
      jobId,
      {
        discovered: stats.discovered,
        newLeads: stats.newLeadsCreated,
        qualified: stats.qualified,
        enrolled: stats.enrolledInCampaign,
      }
    );

    return stats;
  } catch (fatalErr: any) {
    console.error(`[DiscoveryService] Fatal job execution error for ${jobId}:`, fatalErr.message);
    await dbService.updateDiscoveryJob(jobId, {
      status: 'failed',
      error_message: fatalErr.message,
    });
    throw fatalErr;
  }
}
