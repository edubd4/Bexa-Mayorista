import type { Metadata } from 'next'
import './globals.css'
import { APP } from '@/lib/dominio'

export const metadata: Metadata = {
  title: `${APP.nombre} — Panel`,
  description: APP.descripcion,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  )
}
