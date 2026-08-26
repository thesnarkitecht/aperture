import './globals.css';

export const metadata = { title: 'Aperture — Your photo library', description: 'A calm, private home for your photographs.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
