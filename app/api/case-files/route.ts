import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const file = fd.get('file') as File | null;
  const propertyId = fd.get('property_id') as string | null;
  const rawCategory = fd.get('category') as string | null;
  const CATEGORIES = ['写真', '登記簿', '物件目録', 'その他'];
  const category = rawCategory && CATEGORIES.includes(rawCategory) ? rawCategory : 'その他';

  if (!file || !propertyId) {
    return NextResponse.json({ error: 'Missing file or property_id' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const fileType = ext === 'pdf' ? 'pdf' : ['jpg', 'jpeg'].includes(ext) ? 'jpeg' : ext;
  const storagePath = `${propertyId}/${Date.now()}_${file.name}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createAdminClient();

  const { error: storageError } = await admin.storage
    .from('case-files')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { error: dbError } = await admin.from('case_files').insert({
    property_id: propertyId,
    file_name: file.name,
    file_path: storagePath,
    file_type: fileType,
    file_size: file.size,
    category,
  });

  if (dbError) {
    await admin.storage.from('case-files').remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
