import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getGoogleAuthUrl } from '@/lib/gmail/oauth';

async function handleConnect(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let returnTo: string | undefined = undefined;
    const url = new URL(req.url);
    returnTo = url.searchParams.get('returnTo') || undefined;

    if (!returnTo && req.method === 'POST') {
      try {
        const body = await req.json();
        returnTo = body?.returnTo;
      } catch {
        // body may be empty
      }
    }

    const authUrl = getGoogleAuthUrl(user.id, undefined, returnTo || '/accounts');
    
    // If request has Accept: text/html and is GET, we can redirect directly
    if (req.method === 'GET' && req.headers.get('accept')?.includes('text/html')) {
      return NextResponse.redirect(authUrl);
    }

    return NextResponse.json({ url: authUrl });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleConnect(req);
}

export async function GET(req: NextRequest) {
  return handleConnect(req);
}
