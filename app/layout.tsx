import type { Metadata } from 'next';
import { Oswald, Rajdhani } from 'next/font/google';
import './globals.css';
import ClientProviders from '@/components/ClientProviders';

const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-display',
});

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Advance Truck Repair | JRC Smart Systems',
  description: 'Sistema de gestion para taller mecanico y control de produccion',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${oswald.variable} ${rajdhani.variable}`}>
        <ClientProviders>
          {children}
          <footer className="border-t border-white/5 py-4 text-center text-xs text-slate-600">
            Powered by{' '}
            <span className="font-medium text-slate-500">JRC Smart Systems</span>
          </footer>
        </ClientProviders>
      </body>
    </html>
  );
}
