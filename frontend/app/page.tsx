import { TimelineGallery } from '../components/TimelineGallery';
import { UploadDropzone } from '../components/UploadDropzone';

export default function Home() {
  return <main className="mx-auto max-w-7xl p-8"><header className="mb-8 flex items-center justify-between"><h1 className="text-3xl font-semibold">Aperture</h1><UploadDropzone /></header><TimelineGallery /></main>;
}
