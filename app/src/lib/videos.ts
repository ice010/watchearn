import { useEffect, useState } from 'react';
import { api, type Video } from './api';

export function useVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ videos: Video[] }>('/videos').then((r) => setVideos(r.videos)).catch((e) => setError(e.message));
  }, []);
  return { videos, error };
}

export const fmtDuration = (s: number) =>
  s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
