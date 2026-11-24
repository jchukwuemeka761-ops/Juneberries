import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-plus-jakarta',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'JUNEBERRIES INTERNATIONAL SCHOOLS — CBT & Examination Portal',
  description:
    'Complete Computer-Based Testing (CBT) and Examination Management Platform for JUNEBERRIES INTERNATIONAL SCHOOLS (Primary 1 to SSS 3).',
  openGraph: {
    title: 'JUNEBERRIES INTERNATIONAL SCHOOLS — CBT & Examination Portal',
    description:
      'Secure Computer-Based Testing, Question Bank, Live Invigilation, and Results Management for JUNEBERRIES INTERNATIONAL SCHOOLS (Primary 1 to SSS 3).',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JUNEBERRIES INTERNATIONAL SCHOOLS — CBT & Examination Portal',
    description:
      'Secure Computer-Based Testing and Examination Management Platform for JUNEBERRIES INTERNATIONAL SCHOOLS (Primary 1 to SSS 3).',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[#F8FAFC] text-slate-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
