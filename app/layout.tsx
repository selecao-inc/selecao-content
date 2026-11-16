import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
});

export const metadata: Metadata = {
  title: "SELECAO Media",
  description: "株式会社セレソンが、AI の最新情報と実際に試した知見を届けます",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={notoSansJp.variable}>
      <body className="min-h-dvh bg-ground font-sans text-[15px] leading-[1.8] text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
