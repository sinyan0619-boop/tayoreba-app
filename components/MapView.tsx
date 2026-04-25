'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { Case, STATUS_COLORS } from '@/types';

interface Props {
  cases: Case[];
  height?: string;
  onMarkerClick?: (caseId: string) => void;
  center?: [number, number];
  zoom?: number;
}

export default function MapView({
  cases,
  height = '400px',
  onMarkerClick,
  center = [34.622, 135.508],
  zoom = 13,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    (async () => {
      const L = (await import('leaflet')).default;

      const map = L.map(containerRef.current!, { zoomControl: true }).setView(
        center,
        zoom
      );

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      cases.forEach((c) => {
        const color = STATUS_COLORS[c.status];
        const marker = L.circleMarker([c.lat, c.lng], {
          radius: 12,
          fillColor: color,
          color: '#ffffff',
          weight: 2.5,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(map);

        marker.bindPopup(
          `<div style="font-size:13px;line-height:1.6;min-width:160px">
            <strong style="font-size:14px">${c.ownerName}</strong><br/>
            <span style="color:#666;font-size:11px">${c.address}</span><br/>
            <span style="color:${color};font-weight:bold">${c.status}</span>
            &nbsp;/&nbsp;ランク <strong>${c.rank}</strong>
          </div>`
        );

        if (onMarkerClick) {
          marker.on('click', () => onMarkerClick(c.id));
        }
      });

      mapRef.current = map;
    })();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}
