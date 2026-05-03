'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
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
}

export default function MapView({
  cases,
  userLocations = [],
  height = '400px',
  onMarkerClick,
  center = [34.622, 135.508],
  zoom = 13,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const userLayerRef = useRef<any[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    (async () => {
      const L = (await import('leaflet')).default;

      const map = L.map(containerRef.current!, { zoomControl: true }).setView(center, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // 物件ピン
      cases.forEach((c) => {
        const color = STATUS_COLORS[c.status];
        const marker = L.circleMarker([c.lat, c.lng], {
          radius: 12, fillColor: color, color: '#ffffff',
          weight: 2.5, opacity: 1, fillOpacity: 0.9,
        }).addTo(map);

        marker.bindPopup(
          `<div style="font-size:13px;line-height:1.6;min-width:160px">
            <strong style="font-size:14px">${c.ownerName}</strong><br/>
            <span style="color:#666;font-size:11px">${c.address}</span><br/>
            <span style="color:${color};font-weight:bold">${c.status}</span>
            &nbsp;/&nbsp;ランク <strong>${c.rank}</strong>
          </div>`
        );
        if (onMarkerClick) marker.on('click', () => onMarkerClick(c.id));
      });

      mapRef.current = map;
    })();

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 利用者ピンをリアルタイム更新
  useEffect(() => {
    if (!mapRef.current) return;
    (async () => {
      const L = (await import('leaflet')).default;
      userLayerRef.current.forEach((m) => m.remove());
      userLayerRef.current = [];

      userLocations.forEach((u) => {
        const marker = L.circleMarker([u.lat, u.lng], {
          radius: 10, fillColor: '#8e44ad', color: '#ffffff',
          weight: 3, opacity: 1, fillOpacity: 1,
        }).addTo(mapRef.current);
        marker.bindPopup(
          `<div style="font-size:13px;font-weight:bold">👤 ${u.display_name}</div>`
        );
        userLayerRef.current.push(marker);
      });
    })();
  }, [userLocations]);

  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}
