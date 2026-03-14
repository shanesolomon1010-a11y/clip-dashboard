import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  weight: ['300', '400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: "Clip Studio",
  description: "Creator analytics across TikTok, Instagram, LinkedIn, X/Twitter, and YouTube Shorts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased`}
        style={{ fontFamily: 'var(--font-space)' }}
      >
        {children}
      </body>
    </html>
  );
}
