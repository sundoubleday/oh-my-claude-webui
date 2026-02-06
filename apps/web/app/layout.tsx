import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { AppLayout } from "@/components/app-layout"

export const metadata: Metadata = {
  title: "oh-my-claude-webui",
  description: "Claude Code Web UI",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AppLayout>
          {children}
        </AppLayout>
        <Toaster />
      </body>
    </html>
  )
}
