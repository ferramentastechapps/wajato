import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WaJato — Envio em Massa WhatsApp",
  description: "Sistema profissional para disparos em massa via WhatsApp para grupos de promoções.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
