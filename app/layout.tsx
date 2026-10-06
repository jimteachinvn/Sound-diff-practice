import type { Metadata } from "next";
import "./globals.css";
import "./stitch-theme.css";

export const metadata: Metadata = {
  title: "Họ âm tiếng Anh | Luyện bài tập phát âm",
  description: "Luyện nhận biết cách phát âm của chữ cái và nhóm chữ trong bài kiểm tra tiếng Anh."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" translate="no"><body>{children}</body></html>;
}
