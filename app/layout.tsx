import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Montenegro Property Hunter",
  description: "Private multi-source acquisition intelligence for Bar apartments.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
