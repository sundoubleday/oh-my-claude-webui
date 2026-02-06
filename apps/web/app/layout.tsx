import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"

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
        {children}
        <Toaster />
      </body>
    </html>
  )
}
