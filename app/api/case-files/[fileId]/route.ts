import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from('case_files')
    .select('file_path')
    .eq('id', fileId)
    .single();

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await admin.storage.from('case-files').remove([data.file_path]);
  await admin.from('case_files').delete().eq('id', fileId);

  return NextResponse.json({ ok: true });
}
