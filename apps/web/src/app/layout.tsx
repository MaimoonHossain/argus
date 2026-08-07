import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#060913",
};

export const metadata: Metadata = {
  title: "Argus | Autonomous Deep Research Agent",
  description: "Enterprise-grade Multi-Agent Research System featuring LangGraph State Graphs, Hybrid RRF Vector Search (Neon pgvector + Postgres FTS), Semantic Vector Caching, Tavily Web Crawling, and Gemini Synthesis.",
  keywords: ["AI Research Agent", "Multi-Agent Systems", "LangGraph", "pgvector", "Hybrid RAG", "Gemini 2.5", "Tavily Search"],
  authors: [{ name: "Argus Research Labs" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased selection:bg-cyan-500/20 selection:text-cyan-200`}
    >
      <body className="min-h-full flex flex-col bg-mesh-dark text-slate-100 font-sans">
        {children}
      </body>
    </html>
  );
}
