import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://localset.netlify.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LocalSet · Calisthenics Workout Log",
    template: "%s · LocalSet",
  },
  description:
    "A consistency-first daily calisthenics workout, form guide, streak tracker, and PR log for bodyweight, dumbbells, or a full gym.",
  applicationName: "LocalSet",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LocalSet",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icon-180.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "LocalSet",
    description: "Show up. Move well. Log it.",
    siteName: "LocalSet",
    images: [
      {
        url: "/og.png",
        width: 1725,
        height: 912,
        alt: "LocalSet — Show up. Move well. Log it.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LocalSet",
    description: "Show up. Move well. Log it.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0b0b0b" />
      </head>
      <body>{children}</body>
    </html>
  );
}
