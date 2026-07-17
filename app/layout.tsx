import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Budget Status Overview — PM Dashboard",
  description: "CAPEX Budget Status — phase pipeline, budget vs actual, project tracking",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#F4F6FA" }}>{children}</body>
    </html>
  );
}
