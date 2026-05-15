'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import { supabase, dbToCase } from '@/lib/supabase';
import { createClient } from '@/lib/supabase-browser';
import { Case, CaseRank, CaseStatus, HaitoKigen, STATUS_COLORS, ALL_HAITO_KIGEN, HAITO_KIGEN_COLORS, matchesHaitoKigen } from '@/types';
import { UserLocation } from '@/components/MapView';
import { LocationTracker } from './LocationTracker';
import { detectPref } from '@/lib/address';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const STATUSES: CaseStatus[] = ['未訪問', '訪問対象外', '訪問対象', '媒介', '契約'];
const RANKS: CaseRank[]      = ['A', 'B', 'C'];

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

export default function MapPage() {
  const router = useRouter();
  const [cases, setCases]                 = useState<Case[]>([]);
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [userId, setUserId]               = useState<string | null>(null);
  const [displayName, setDisplayName]     = useState<string>('');
  const [loading, setLoading]             = useState(true);
  const [selStatuses, setSelStatuses]     = useState<Set<CaseStatus>>(new Set());
  const [selRanks, setSelRanks]           = useState<Set<CaseRank>>(new Set());
  const [selHaitoKigen, setSelHaitoKigen] = useState<Set<HaitoKigen>>(new Set());
  const [selPref, setSelPref]             = useState('');
  const [selAssignee, setSelAssignee]     = useState('');
  const [selQ, setSelQ]                   = useState('');
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [locating, setLocating]           = useState(false);
  const [geocoding, setGeocoding]         = useState(false);
  const [geocodeMsg, setGeocodeMsg]       = useState('');

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const hasUrl = sp.toString().length > 0;
    const src = hasUrl
      ? { status: sp.get('status'), haitoKigen: sp.get('haito_kigen'), pref: sp.get('pref'), assignee: sp.get('assignee'), q: sp.get('q') }
      : (() => { try { return JSON.parse(sessionStorage.getItem('tayoreba_case_filter') ?? '{}'); } catch { return {}; } })();
    if (src.status)     setSelStatuses(new Set([src.status as CaseStatus]));
    if (src.haitoKigen) setSelHaitoKigen(new Set([src.haitoKigen as HaitoKigen]));
    if (src.pref)       setSelPref(src.pref);
    if (src.assignee)   setSelAssignee(src.assignee);
    if (src.q)          setSelQ(src.q);
  }, []);

  const fetchCases = useCallback(async () => {
    const { data } = await supabase.from('properties').select('*, visits(*)');
    setCases((data ?? []).map(dbToCase));
    setLoading(false);
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  useEffect(() => {
    const auth = createClient();
    auth.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      auth.from('profiles').select('display_name').eq('id', user.id).single()
        .then(({ data }) => {
          setDisplayName(data?.display_name || user.email?.split('@')[0] || 'メンバー');
        });
    });
  }, []);

  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase.from('user_locations').select('*');
      setUserLocations((data ?? []) as UserLocation[]);
    };
    fetchLocations();
    const timer = setInterval(fetchLocations, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleGeocode = async () => {
    setGeocoding(true);
    let total = 0;
    try {
      for (let i = 0; i < 200; i++) {
        const res = await fetch('/api/geocode', { method: 'POST' });
        if (!res.ok) {
          const txt = await res.text();
          setGeocodeMsg(`エラー: ${txt.slice(0, 80)}`);
          break;
        }
        const json = await res.json();
        if (json.error) { setGeocodeMsg(`エラー: ${json.error}`); break; }
        total += json.geocoded ?? 0;
        const allLogs = (json.log ?? []).join(' / ');
        setGeocodeMsg(`${total}件完了 残り${json.remaining}件 | ${allLogs}`);
        if (json.done) break;
        if ((json.remaining ?? 0) === 0) break;
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e: any) {
      setGeocodeMsg(`通信エラー: ${e?.message ?? e}`);
    }
    setGeocoding(false);
    fetchCases();
  };

  const toggle = <T,>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  };

  const filtered = cases.filter((c) => {
    if (selStatuses.size > 0 && !selStatuses.has(c.status)) return false;
    if (selRanks.size > 0    && !selRanks.has(c.rank))      return false;
    if (selHaitoKigen.size > 0 && ![...selHaitoKigen].some(k => matchesHaitoKigen(c.haitoDate, k))) return false;
    if (selPref     && detectPref(c.address) !== selPref)   return false;
    if (selAssignee && c.assignee !== selAssignee)           return false;
    if (selQ) {
      const t = selQ.toLowerCase();
      if (!c.ownerName.toLowerCase().includes(t) && !c.address.toLowerCase().includes(t)) return false;
    }
    return true;
  });

  const nearbyCases: (Case & { distance: number })[] = currentLocation
    ? filtered
        .filter((c) => c.isGeocoded)
        .map((c) => ({ ...c, distance: haversineM(currentLocation[0], currentLocation[1], c.lat, c.lng) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10)
    : [];

  const ungeocodedCount = cases.filter((c) => !c.isGeocoded).length;

  return (
    <div className="flex flex-col h-full">
      <Header title="地図" />

      {/* Filter bar */}
      <div className="bg-white border-b border-gray-200 px-3 pt-2 pb-2 space-y-1.5 shrink-0">
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setSelStatuses((p) => toggle(p, s))}
              className="px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
              style={selStatuses.has(s)
                ? { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s], color: '#fff' }
                : { backgroundColor: '#fff', color: '#555', borderColor: '#ddd' }}
            >{s}</button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
          {ALL_HAITO_KIGEN.map((k) => (
            <button key={k} onClick={() => setSelHaitoKigen((p) => toggle(p, k))}
              className="px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 transition-all"
              style={selHaitoKigen.has(k)
                ? { backgroundColor: HAITO_KIGEN_COLORS[k], borderColor: HAITO_KIGEN_COLORS[k], color: '#fff' }
                : { backgroundColor: '#fff', color: '#555', borderColor: '#ddd' }}
            >{k}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {RANKS.map((r) => (
            <button key={r} onClick={() => setSelRanks((p) => toggle(p, r))}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all
                ${selRanks.has(r) ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300'}`}
            >ランク{r}</button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
            {(ungeocodedCount > 0 || geocoding) && (
              <button
                onClick={handleGeocode}
                disabled={geocoding}
                className="px-2 py-0.5 rounded border border-blue-300 text-blue-600 disabled:opacity-50"
              >
                {geocoding ? '処理中...' : `地図未配置 ${ungeocodedCount}件`}
              </button>
            )}
            {geocodeMsg && (
              <span className="text-xs text-gray-500 max-w-xs truncate" title={geocodeMsg}>{geocodeMsg}</span>
            )}
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block bg-purple-600" />
              メンバー {userLocations.length}人
            </span>
            <span>{loading ? '読込中...' : `${filtered.length}件`}</span>
          </div>
        </div>
      </div>

      {/* Scrollable body: map + nearby list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Fixed-height map container */}
        <div className="relative" style={{ height: '55vh', minHeight: '280px' }}>
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              地図を読み込み中...
            </div>
          ) : (
            <MapView
              cases={filtered}
              userLocations={userLocations}
              height="100%"
              panTo={currentLocation}
            />
          )}
          {/* Floating current location button */}
          <button
            onClick={handleLocate}
            disabled={locating}
            style={{ position: 'absolute', bottom: 16, right: 12, zIndex: 1000 }}
            className="bg-white rounded-full shadow-md px-3 py-2 text-sm font-medium text-gray-700 flex items-center gap-1.5 border border-gray-200 active:bg-gray-50 disabled:opacity-60"
          >
            {locating ? '取得中...' : '📍 現在地'}
          </button>
        </div>

        {/* Nearby cases section */}
        {currentLocation && (
          <div className="p-3 pb-4">
            <h2 className="text-sm font-bold text-gray-700 mb-2">
              近くの物件
              <span className="ml-1 font-normal text-gray-400">
                (地図配置済み {nearbyCases.length}件)
              </span>
            </h2>
            {nearbyCases.length === 0 ? (
              <p className="text-xs text-gray-400">
                近くに地図配置済みの物件がありません。
                {ungeocodedCount > 0 && '上の「地図未配置」ボタンで住所を変換してください。'}
              </p>
            ) : (
              <div className="space-y-2">
                {nearbyCases.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/case/${c.id}`)}
                    className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3 active:bg-gray-50 cursor-pointer"
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[c.status] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{c.ownerName}</div>
                      <div className="text-xs text-gray-500 truncate">{c.address}</div>
                    </div>
                    <div className="text-xs font-semibold text-blue-600 shrink-0">
                      {formatDist(c.distance)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend bar */}
      <div className="bg-white border-t border-gray-200 px-3 py-2 flex gap-3 flex-wrap shrink-0">
        {STATUSES.map((s) => (
          <div key={s} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }} />
            <span className="text-xs text-gray-600">{s}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full shrink-0 bg-purple-600" />
          <span className="text-xs text-gray-600">メンバー</span>
        </div>
      </div>

      {userId && <LocationTracker userId={userId} displayName={displayName || 'メンバー'} />}
    </div>
  );
}
