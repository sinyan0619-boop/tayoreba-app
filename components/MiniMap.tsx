'use client';
import dynamic from 'next/dynamic';
import { Case } from '@/types';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

interface Props {
  cases: Case[];
  height?: string;
  zoom?: number;
}

export default function MiniMap({ cases, height = '170px', zoom = 12 }: Props) {
  return <MapView cases={cases} height={height} zoom={zoom} />;
}
