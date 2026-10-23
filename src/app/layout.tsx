import CitizenProvider from "@/components/auth/CitizenProvider";
import type { Metadata, Viewport } from "next";
import AppServices from "@/components/ui/AppServices";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Makkal Kural", template: "%s | Makkal Kural" }, description: "Report civic issues and verify community repairs.", manifest: "/manifest.json", appleWebApp: { capable: true, title: "Makkal Kural", statusBarStyle: "default" }, icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" } };
export const viewport: Viewport = { themeColor: "#0F766E", width: "device-width", initialScale: 1 };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="en"><body><a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[2000] focus:bg-white focus:p-3">Skip to main content</a><CitizenProvider>{children}<AppServices /></CitizenProvider></body></html>;}
