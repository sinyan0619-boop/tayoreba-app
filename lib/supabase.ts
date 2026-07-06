import { createClient } from '@supabase/supabase-js';
import { Case, CaseCategory, CaseRank, CaseStatus, Visit, VisitResult } from '@/types';

// build時にenv未設定でも createClient が throw しないようフォールバックを設定
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'https://placeholder.supabase.co';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

// クライアント / サーバー共用（anon key）
export const supabase = createClient(url, anon, {
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
  },
});

// サーバー専用（service role key — API routeのみで使用）
export function createAdminClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// ── DB行 → TypeScript型 マッパー ──────────────────────────────
export function dbToVisit(v: Record<string, any>): Visit {
  return {
    id:           v.id,
    property_id:  v.property_id,
    contact_type: v.contact_type ?? undefined,
    summary:      v.summary      ?? undefined,
    judgment:     (v.judgment as VisitResult) ?? null,
    next_action:  v.next_action  ?? undefined,
    next_date:    v.next_date    ?? undefined,
    requests:     v.requests     ?? undefined,
    recorded_by:  v.recorded_by  ?? undefined,
    created_at:   v.created_at,
    // UIで使う aliases
    date:   v.created_at ? (v.created_at as string).split('T')[0] : '',
    result: (v.judgment as VisitResult) ?? null,
    memo:   v.summary ?? '',
  };
}

export function dbToCase(p: Record<string, any>): Case {
  return {
    id:         p.id,
    address:    p.address,
    ownerName:  p.owner_name,
    status:     p.status     as CaseStatus,
    rank:       p.rank       as CaseRank,
    category:   (p.category  as CaseCategory) ?? '任意売却',
    lat:        (p.lat && p.lat !== 0) ? p.lat : 34.622,
    lng:        (p.lng && p.lng !== 0) ? p.lng : 135.508,
    isGeocoded: p.lat !== null && p.lat !== 0,
    ownerAddress:    p.owner_address ?? undefined,
    ownerLat:        (p.owner_lat && p.owner_lat !== 0) ? p.owner_lat : undefined,
    ownerLng:        (p.owner_lng && p.owner_lng !== 0) ? p.owner_lng : undefined,
    isOwnerGeocoded: !!(p.owner_lat && p.owner_lat !== 0 && p.owner_lng),
    haitoDate:  p.haito_date ?? undefined,
    phone:      p.phone      ?? undefined,
    loanAmount: p.loan_amount ?? undefined,
    bankName:   p.bank_name  ?? undefined,
    assignee:   p.assignee   ?? undefined,
    caseNumber: p.case_number ?? undefined,
    notes:      p.notes      ?? undefined,
    updatedAt:  p.updated_at ?? undefined,
    visits:     Array.isArray(p.visits)
      ? [...p.visits]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .map(dbToVisit)
      : [],
  };
}
