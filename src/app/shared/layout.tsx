import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = {
  title: "Delat projekt",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function SharedLayout({ children }: { children: ReactNode }) {
  return (
    <main className="page-container page-stack">
      <header className="page-heading">
        <p className="eyebrow">Planroom · Publik läsvy</p>
      </header>
      {children}
    </main>
  );
}
