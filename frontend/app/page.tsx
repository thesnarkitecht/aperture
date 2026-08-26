'use client';

import { useState } from 'react';
import { AlbumView } from '../components/AlbumView';
import { ExifViewer } from '../components/ExifViewer';
import { Lightbox } from '../components/Lightbox';
import { Sidebar } from '../components/Sidebar';
import { TimelineGallery, Photo } from '../components/TimelineGallery';

const photos: Photo[] = [
  { id: '1', src: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1200&q=85', title: 'Dawn, Big Sur', date: 'August 24, 2026', camera: 'Leica Q3', location: 'Big Sur, California', ratio: 'portrait' },
  { id: '2', src: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1200&q=85', title: 'Quiet valley', date: 'August 24, 2026', camera: 'Leica Q3', location: 'Yosemite, California', ratio: 'landscape' },
  { id: '3', src: 'https://images.unsplash.com/photo-1511497584788-876760111969?w=1200&q=85', title: 'Among the pines', date: 'August 22, 2026', camera: 'Fujifilm X100VI', location: 'Mendocino, California', ratio: 'portrait' },
  { id: '4', src: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1200&q=85', title: 'Soft light', date: 'August 22, 2026', camera: 'Fujifilm X100VI', location: 'Mendocino, California', ratio: 'landscape' },
  { id: '5', src: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=85', title: 'A long way home', date: 'August 18, 2026', camera: 'Sony A7C II', location: 'Joshua Tree, California', ratio: 'landscape' },
  { id: '6', src: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=85', title: 'High country', date: 'August 18, 2026', camera: 'Sony A7C II', location: 'Eastern Sierra, California', ratio: 'portrait' },
];

export default function Home() {
  const [selected, setSelected] = useState<Photo | null>(null);
  const [showExif, setShowExif] = useState(false);
  const [view, setView] = useState<'timeline' | 'albums'>('timeline');
  return <div className="shell">
    <Sidebar view={view} onView={setView} />
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">Wednesday, August 26</p><h1>{view === 'timeline' ? 'All photos' : 'Albums'}</h1></div><div className="actions"><button className="icon-button" aria-label="Search">⌕</button><button className="upload-button">＋ <span>Upload</span></button><div className="avatar">S</div></div></header>
      {view === 'timeline' ? <TimelineGallery photos={photos} onSelect={setSelected} /> : <AlbumView photos={photos} onSelect={setSelected} />}
    </main>
    {selected && <Lightbox photo={selected} onClose={() => setSelected(null)} onExif={() => setShowExif(true)} />}
    {showExif && selected && <ExifViewer photo={selected} onClose={() => setShowExif(false)} />}
  </div>;
}
