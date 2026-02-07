"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { cn } from "@/lib/utils"
import {
  MessageSquarePlus,
  MessageSquare,
  History,
  Settings,
  Server,
  Zap,
  Puzzle,
  Terminal,
} from "lucide-react"

// Generate UUID for new chat sessions
function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

const staticNavLinks = [
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/mcp', label: 'MCP Servers', icon: Server },
  { href: '/skills', label: 'Skills', icon: Zap },
  { href: '/plugins', label: 'Plugins', icon: Puzzle },
  { href: '/commands', label: 'Commands', icon: Terminal },
]

function SidebarContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  // Check if we're currently in a chat session
  const isInChat = pathname === '/chat'
  const currentSessionId = isInChat ? searchParams.get('session') : null
  
  // Generate new session URL for "New Chat" button
  const getNewChatUrl = () => {
    const newId = generateUUID()
    return `/chat?session=${newId}`
  }

  return (
    <>
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-lg tracking-tight">Oh My Claude</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="grid gap-1 px-2">
          {/* New Chat Button - Always creates new session */}
          <li>
            <Link
              href={getNewChatUrl()}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                "text-muted-foreground"
              )}
            >
              <MessageSquarePlus className="h-4 w-4" />
              New Chat
            </Link>
          </li>
          
          {/* Current Chat Session - Only show if in active session */}
          {isInChat && currentSessionId && (
            <li>
              <Link
                href={`/chat?session=${currentSessionId}`}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <MessageSquare className="h-4 w-4" />
                <div className="flex flex-col">
                  <span>Current Chat</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {currentSessionId.slice(0, 8)}...
                  </span>
                </div>
              </Link>
            </li>
          )}
          
          {/* Divider */}
          <li className="my-2 border-t border-border" />
          
          {/* Other navigation links */}
          {staticNavLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="border-t p-4">
         <div className="text-xs text-muted-foreground">
            v0.1.0
         </div>
      </div>
    </>
  )
}

export function Sidebar() {
  return (
    <div className="flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <Suspense fallback={<div className="p-4">Loading...</div>}>
        <SidebarContent />
      </Suspense>
    </div>
  )
}
