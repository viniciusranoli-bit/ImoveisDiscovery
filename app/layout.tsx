import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar de Aluguel",
  description: "Oportunidades de aluguel em Botafogo e perto do metrô",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
