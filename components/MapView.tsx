'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { Case, STATUS_COLORS } from '@/types';

export type UserLocation = {
  user_id: string;
  display_name: string;
  lat: number;
  lng: number;
};

interface Props {
  cases: Case[];
  userLocations?: UserLocation[];
  height?: string;
  onMarkerClick?: (caseId: string) => void;
  center?: [number, number];
  zoom?: number;
  panTo?: [number, number] | null;
}

export default function MapView({
  cases,
  userLocations = [],
  height = '400px',
  onMarkerClick,
  center = [34.622, 135.508],
  zoom = 13,
  panTo,
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<any>(null);
  const caseLayerRef  = useRef<any[]>([]);
  const userLayerRef  = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // 地図初期化（Leaflet を動的 import）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    (async () => {
      const L = (await import('leaflet')).default;
      const map = L.map(containerRef.current!, { zoomControl: true }).setView(center, zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 物件ピンを動的更新（isGeocoded === true のみ描画）
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    (async () => {
      const L = (await import('leaflet')).default;
      caseLayerRef.current.forEach((m) => m.remove());
      caseLayerRef.current = [];

      cases.filter((c) => c.isGeocoded).forEach((c) => {
        const color  = STATUS_COLORS[c.status];
        const marker = L.circleMarker([c.lat, c.lng], {
          radius: 12, fillColor: color, color: '#ffffff',
          weight: 2.5, opacity: 1, fillOpacity: 0.9,
        }).addTo(mapRef.current);
        marker.bindPopup(
          `<a href="/case/${c.id}" style="text-decoration:none;color:inherit;display:block;min-width:160px">
            <div style="font-size:13px;line-height:1.6">
              <strong style="font-size:14px">${c.ownerName}</strong><br/>
              <span style="color:#666;font-size:11px">${c.address}</span><br/>
              <span style="color:${color};font-weight:bold">${c.status}</span>
              &nbsp;/&nbsp;ランク <strong>${c.rank}</strong><br/>
              <span style="color:#3b82f6;font-size:11px;font-weight:bold">詳細を見る →</span>
            </div>
          </a>`
        );
        caseLayerRef.current.push(marker);
      });
    })();
  }, [cases, mapReady, onMarkerClick]);

  // 現在地に移動
  useEffect(() => {
    if (!mapRef.current || !panTo) return;
    mapRef.current.flyTo(panTo, 16);
  }, [panTo]);

  // 利用者ピンをリアルタイム更新
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    (async () => {
      const L = (await import('leaflet')).default;
      userLayerRef.current.forEach((m) => m.remove());
      userLayerRef.current = [];

      userLocations.forEach((u) => {
        const personIcon = L.divIcon({
          html: `
            <div style="position:relative;width:36px;height:44px">
              <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                <circle cx="18" cy="18" r="18" fill="#8e44ad"/>
                <!-- 頭 -->
                <circle cx="18" cy="13" r="5" fill="white"/>
                <!-- 体 -->
                <path d="M8 30 Q8 22 18 22 Q28 22 28 30" fill="white"/>
              </svg>
              <!-- 吹き出しの三角 -->
              <div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);
                width:0;height:0;border-left:6px solid transparent;
                border-right:6px solid transparent;border-top:8px solid #8e44ad"></div>
            </div>`,
          className: '',
          iconSize: [36, 44],
          iconAnchor: [18, 44],
          popupAnchor: [0, -46],
        });
        const marker = L.marker([u.lat, u.lng], { icon: personIcon }).addTo(mapRef.current);
        marker.bindPopup(
          `<div style="font-size:13px;font-weight:bold;color:#8e44ad">👤 ${u.display_name}</div>`
        );
        userLayerRef.current.push(marker);
      });
    })();
  }, [userLocations, mapReady]);

  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}
