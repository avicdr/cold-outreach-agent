import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const minScore = searchParams.get('minScore') ? parseInt(searchParams.get('minScore')!, 10) : undefined;
  const priority = searchParams.get('priority') || undefined;
  const category = searchParams.get('category') || undefined;
  const discoveryJobId = searchParams.get('discoveryJobId') || undefined;

  try {
    const { leads } = await dbService.getQualifiedLeads(user.id, {
      minScore,
      priority,
      category,
      discoveryJobId,
      limit: 1000,
      offset: 0,
    });

    const headers = [
      'ID',
      'Business Name',
      'Category',
      'Phone',
      'Email',
      'Website',
      'Location',
      'Rating',
      'Review Count',
      'Lead Score',
      'Priority',
      'Confidence',
      'Qualification Summary',
      'Observed Friction',
      'Sales Angle',
      'Suggested Opening',
      'Source URL',
      'Discovery Date',
      'Verification Date',
      'Status',
    ];

    const rows = leads.map((lead) => {
      const frictionSummary = (lead.observed_friction || [])
        .map((f: any) => f.finding)
        .join(' | ');
      const location = [lead.city, lead.state, lead.country].filter(Boolean).join(', ');

      return [
        escapeCsv(lead.id),
        escapeCsv(lead.company),
        escapeCsv(lead.category || ''),
        escapeCsv(lead.normalized_phone || lead.phone || ''),
        escapeCsv(lead.email || ''),
        escapeCsv(lead.website || ''),
        escapeCsv(location),
        escapeCsv(lead.rating ?? ''),
        escapeCsv(lead.review_count ?? ''),
        escapeCsv(lead.qualification_score ?? ''),
        escapeCsv(lead.qualification_priority ?? ''),
        escapeCsv(lead.qualification_confidence ?? ''),
        escapeCsv(lead.qualification_summary ?? ''),
        escapeCsv(frictionSummary),
        escapeCsv(lead.sales_angle ?? ''),
        escapeCsv(lead.suggested_opening ?? ''),
        escapeCsv(lead.google_maps_url || lead.evidence_urls?.[0] || ''),
        escapeCsv(lead.discovery_timestamp || lead.created_at),
        escapeCsv(lead.last_enriched_at || ''),
        escapeCsv(lead.status),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="qualified_leads_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
