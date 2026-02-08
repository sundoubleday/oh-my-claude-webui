"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import { 
  MessageSquarePlus, 
  Settings, 
  Server, 
  Zap, 
  Puzzle, 
  Terminal,
  ChevronRight,
  ChevronDown,
  Folder,
  Trash2,
  Search,
  Clock,
  MessageSquare
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ThemeToggle } from "./theme-toggle"

// Stable "new chat" URL - we will dynamically append project if possible
const BASE_NEW_CHAT_URL = '/chat?session=new'

const staticNavLinks = [
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/mcp', label: 'MCP Servers', icon: Server },
  { href: '/skills', label: 'Skills', icon: Zap },
  { href: '/plugins', label: 'Plugins', icon: Puzzle },
  { href: '/commands', label: 'Commands', icon: Terminal },
]

interface Session {
  sessionId: string
  projectDir: string
  projectPath: string
  messageCount: number
  lastMessageTime: string
  title?: string
}

// Format relative time like "18 minutes ago", "3 hours ago"
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} minutes ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

// Format message count to size-like string (e.g., "2.5 KB" for messages)
function formatMessageSize(count: number): string {
  if (count < 10) return `${count} msgs`
  if (count < 100) return `${(count * 0.1).toFixed(1)} KB`
  return `${Math.floor(count * 0.01)} KB`
}

function SidebarContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const isInChat = pathname === '/chat'
  const currentSessionId = isInChat ? searchParams.get('session') : null
  const currentProjectParam = isInChat ? searchParams.get('project') : null

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Determine the best "New Chat" URL based on context
  const getNewChatUrl = () => {
    if (currentProjectParam) {
      return `${BASE_NEW_CHAT_URL}&project=${encodeURIComponent(currentProjectParam)}`
    }
    if (currentSessionId && sessions.length > 0) {
      const current = sessions.find(s => s.sessionId === currentSessionId)
      if (current) {
        return `${BASE_NEW_CHAT_URL}&project=${encodeURIComponent(current.projectPath)}`
      }
    }
    return BASE_NEW_CHAT_URL
  }

  // Group by project
  const grouped = sessions.reduce((acc, session) => {
    const key = session.projectPath
    if (!acc[key]) acc[key] = []
    acc[key].push(session)
    return acc
  }, {} as Record<string, Session[]>)

  // Get unique projects sorted by most recent activity
  const projects = Object.entries(grouped)
    .map(([path, sessions]) => ({
      path,
      name: path.split(/[\\/]/).pop() || path,
      sessionCount: sessions.length,
      lastActivity: Math.max(...sessions.map(s => new Date(s.lastMessageTime).getTime()))
    }))
    .sort((a, b) => b.lastActivity - a.lastActivity)

  // Filter sessions for selected project
  const selectedProjectSessions = selectedProject ? grouped[selectedProject] || [] : []

  // Fetch sessions from API
  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true)
      try {
        const endpoint = searchQuery && searchQuery.length >= 2
          ? `http://localhost:5757/api/transcripts/search?q=${encodeURIComponent(searchQuery)}`
          : "http://localhost:5757/api/transcripts"
          
        const res = await fetch(endpoint)
        if (!res.ok) throw new Error("Failed to fetch")
        const data = await res.json()
        
        const sessionList: Session[] = data.map((item: any) => ({
          sessionId: item.sessionId,
          projectDir: item.projectDir,
          projectPath: item.projectPath,
          messageCount: item.messageCount || 0,
          lastMessageTime: item.lastMessageTime || item.firstMessageTime || new Date().toISOString(),
          title: item.title
        }))
        
        setSessions(sessionList)
      } catch (error) {
        console.error("Failed to fetch sessions:", error)
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(fetchSessions, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Handle delete session
  const handleDelete = async (e: React.MouseEvent, session: Session) => {
    e.preventDefault()
    e.stopPropagation()
    
    try {
      const encodedPath = encodeURIComponent(session.projectDir)
      const res = await fetch(
        `http://localhost:5757/api/transcripts/${encodedPath}/${session.sessionId}`,
        { method: "DELETE" }
      )
      
      if (!res.ok) throw new Error("Failed to delete")
      
      setSessions(prev => prev.filter(s => s.sessionId !== session.sessionId))
      toast.success("Session deleted")
      
      if (currentSessionId === session.sessionId) {
        router.push("/chat?session=new")
      }
    } catch (error) {
      console.error("Failed to delete session:", error)
      toast.error("Failed to delete session")
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex h-14 items-center border-b px-4 shrink-0 bg-sidebar-accent/50">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-lg tracking-tight">Oh My Claude</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
        {/* New Chat Button */}
        <Link href={getNewChatUrl()}>
          <Button className="w-full justify-start gap-2 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" variant="default">
            <MessageSquarePlus className="w-4 h-4" />
            New Chat
          </Button>
        </Link>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            className="h-8 pl-8 text-xs bg-muted/50 border-transparent focus:border-input focus:bg-background transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Projects List or Selected Project Sessions */}
        <div className="space-y-1">
          {selectedProject ? (
            // Show sessions for selected project
            <>
              <div className="flex items-center gap-2 mb-3">
                <button 
                  onClick={() => setSelectedProject(null)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronRight className="w-3 h-3 rotate-180" />
                  Back to Projects
                </button>
              </div>
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 py-1">
                {selectedProject.split(/[\\/]/).pop()}
              </h3>
              
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {selectedProjectSessions
                    .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime())
                    .map(session => (
                    <Link
                      key={session.sessionId}
                      href={`/chat?session=${session.sessionId}&project=${encodeURIComponent(session.projectPath)}`}
                      className={cn(
                        "group flex items-start gap-3 px-2 py-2.5 rounded-md transition-all hover:bg-accent",
                        currentSessionId === session.sessionId 
                          ? "bg-accent text-accent-foreground" 
                          : "text-muted-foreground"
                      )}
                    >
                      <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "text-sm font-medium truncate",
                          currentSessionId === session.sessionId ? "text-foreground" : "text-foreground/80"
                        )}>
                          {session.title || "New Conversation"}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(session.lastMessageTime)}
                          </span>
                          <span>•</span>
                          <span>{formatMessageSize(session.messageCount)}</span>
                          <span>•</span>
                          <span className="font-mono opacity-50">{session.sessionId.slice(0, 4)}</span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDelete(e, session)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 transition-opacity shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            // Show projects list
            <>
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 py-1">
                Projects
              </h3>
              
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {projects.map(project => (
                    <button
                      key={project.path}
                      onClick={() => setSelectedProject(project.path)}
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm font-medium text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors rounded-md group text-left"
                    >
                      <Folder className="w-4 h-4 text-muted-foreground" />
                      <span className="truncate flex-1">{project.name}</span>
                      <span className="text-[9px] text-muted-foreground/70 bg-accent px-1.5 rounded-full shrink-0">
                        {project.sessionCount}
                      </span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                  
                  {projects.length === 0 && !loading && (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No projects found
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Static Links - Only show when not in project view */}
        {!selectedProject && (
          <>
            <div className="border-t border-border/50 my-2" />
            <div className="space-y-0.5">
              {staticNavLinks.map((link) => {
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50",
                      isActive ? "bg-muted text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-4 bg-muted/5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground font-mono">
            v0.2.0 • Oh My Claude
          </div>
          <ThemeToggle />
        </div>
      </div>
    </>
  )
}

export function Sidebar() {
  return (
    <div className="flex h-screen w-72 flex-col border-r bg-card text-card-foreground shadow-sm shrink-0 z-20">
      <Suspense fallback={<div className="p-4">Loading...</div>}>
        <SidebarContent />
      </Suspense>
    </div>
  )
}
