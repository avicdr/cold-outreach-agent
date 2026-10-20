import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getGoogleAuthUrl } from '@/lib/gmail/oauth';

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const authUrl = getGoogleAuthUrl(user.id);
    return NextResponse.json({ url: authUrl });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
