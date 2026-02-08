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
  MessageSquare,
  Trash2,
  History,
  Search
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

function SidebarContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const isInChat = pathname === '/chat'
  const currentSessionId = isInChat ? searchParams.get('session') : null
  const currentProjectParam = isInChat ? searchParams.get('project') : null

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState("")

  // Determine the best "New Chat" URL based on context
  const getNewChatUrl = () => {
    // 1. If we are already in a project context, use it
    if (currentProjectParam) {
      return `${BASE_NEW_CHAT_URL}&project=${encodeURIComponent(currentProjectParam)}`
    }
    // 2. If we have a current session, find its project
    if (currentSessionId && sessions.length > 0) {
      const current = sessions.find(s => s.sessionId === currentSessionId)
      if (current) {
        return `${BASE_NEW_CHAT_URL}&project=${encodeURIComponent(current.projectPath)}`
      }
    }
    // 3. Fallback to default (Home)
    return BASE_NEW_CHAT_URL
  }

  const getRecentSessions = () => {
    // Sort all sessions by lastMessageTime descending and take top 3
    return [...sessions]
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime())
      .slice(0, 3)
  }

  // Filter sessions based on search
  // If searching via API (length >= 2), trust the API results. Otherwise verify locally.
  const filteredSessions = sessions.filter(session => {
    if (!searchQuery) return true
    if (searchQuery.length >= 2) return true // Trust API search results
    
    const query = searchQuery.toLowerCase()
    return (
      (session.title?.toLowerCase() || "").includes(query) ||
      session.projectPath.toLowerCase().includes(query) ||
      session.sessionId.includes(query)
    )
  })

  // Group by project
  const grouped = filteredSessions.reduce((acc, session) => {
    const key = session.projectPath
    if (!acc[key]) acc[key] = []
    acc[key].push(session)
    return acc
  }, {} as Record<string, Session[]>)

  // Auto-expand projects when searching
  useEffect(() => {
    if (searchQuery) {
      const allPaths = Object.keys(grouped).reduce((acc, path) => ({ ...acc, [path]: false }), {})
      setCollapsedProjects(allPaths)
    }
  }, [searchQuery, sessions.length]) // Re-run when search or data changes

  const toggleProject = (path: string) => {
    setCollapsedProjects(prev => ({
      ...prev,
      [path]: !prev[path]
    }))
  }

  // Fetch sessions from API (Search supported)
  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true)
      try {
        // Use debounce for search query
        const endpoint = searchQuery && searchQuery.length >= 2
          ? `http://localhost:5757/api/transcripts/search?q=${encodeURIComponent(searchQuery)}`
          : "http://localhost:5757/api/transcripts"
          
        const res = await fetch(endpoint)
        if (!res.ok) throw new Error("Failed to fetch")
        const data = await res.json()
        
        // Transform API response to Session format
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

    // Debounce search
    const timer = setTimeout(fetchSessions, 300)
    return () => clearTimeout(timer)
  }, [searchQuery]) // Re-fetch when searchQuery changes

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
      
      // Remove from local state
      setSessions(prev => prev.filter(s => s.sessionId !== session.sessionId))
      toast.success("Session deleted")
      
      // If we're viewing the deleted session, navigate away
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
      <div className="flex h-14 items-center border-b px-4 shrink-0 bg-sidebar-accent/50">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-lg tracking-tight">Oh My Claude</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
        {/* Main Actions */}
        <div className="space-y-2">
          <Link href={getNewChatUrl()}>
            <Button className="w-full justify-start gap-2 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" variant="default">
              <MessageSquarePlus className="w-4 h-4" />
              New Chat
            </Button>
          </Link>
          
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="h-8 pl-8 text-xs bg-muted/50 border-transparent focus:border-input focus:bg-background transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Global Recent Sessions (Quick Access) */}
        {!searchQuery && !loading && sessions.length > 0 && (
          <div className="space-y-1 pb-2 border-b border-border/50">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 py-1">
              Recent
            </h3>
            <div className="space-y-0.5 ml-1">
              {getRecentSessions().map(session => (
                <Link
                  key={`recent-${session.sessionId}`}
                  href={`/chat?session=${session.sessionId}&project=${encodeURIComponent(session.projectPath)}`}
                  className={cn(
                    "group flex flex-col gap-0.5 px-2 py-2 rounded-md transition-all hover:bg-accent",
                    currentSessionId === session.sessionId 
                      ? "bg-accent text-accent-foreground shadow-sm" 
                      : "text-muted-foreground"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={cn(
                      "truncate text-xs font-medium", 
                      currentSessionId === session.sessionId ? "text-foreground" : "text-foreground/80"
                    )}>
                      {session.title || "New Conversation"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground/60">
                    <span className="truncate max-w-[120px] text-[9px] opacity-70" title={session.projectPath}>
                      {session.projectPath.split(/[\\/]/).pop()}
                    </span>
                    <span className="font-mono opacity-50">{new Date(session.lastMessageTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        <div className="space-y-1">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 py-1">
            Projects & History
          </h3>
          
          {loading ? (
            <div className="flex justify-center py-4">
               <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <div className="space-y-1">
              {Object.entries(grouped).map(([path, projectSessions]) => (
                <div key={path} className="space-y-0.5">
                  <button 
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs font-medium text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors rounded-md group"
                    onClick={() => toggleProject(path)}
                  >
                    {collapsedProjects[path] ? (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    )}
                    <Folder className="w-3.5 h-3.5 text-blue-500/80" />
                    <span className="truncate flex-1 text-left" title={path}>{path.split(/[\\/]/).pop()}</span>
                    <span className="text-[9px] text-muted-foreground/70 bg-accent px-1.5 rounded-full">
                      {projectSessions.length}
                    </span>
                  </button>

                  {!collapsedProjects[path] && (
                    <div className="space-y-0.5 ml-2 pl-2 border-l border-border/40">
                      {projectSessions.map(session => (
                        <Link
                          key={session.sessionId}
                          href={`/chat?session=${session.sessionId}&project=${encodeURIComponent(session.projectPath)}`}
                          className={cn(
                            "group flex flex-col gap-0.5 px-2 py-2 rounded-md transition-all hover:bg-accent",
                            currentSessionId === session.sessionId 
                              ? "bg-accent text-accent-foreground shadow-sm" 
                              : "text-muted-foreground"
                          )}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className={cn(
                              "truncate text-xs font-medium", 
                              currentSessionId === session.sessionId ? "text-foreground" : "text-foreground/80"
                            )}>
                              {session.title || "New Conversation"}
                            </span>
                            <button 
                              onClick={(e) => handleDelete(e, session)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 transition-opacity"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px] text-muted-foreground/60">
                            <span className="truncate max-w-[80px]">{new Date(session.lastMessageTime).toLocaleDateString()}</span>
                            <span className="font-mono opacity-50">{session.sessionId.slice(0, 4)}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {filteredSessions.length === 0 && searchQuery && (
                 <div className="text-xs text-muted-foreground text-center py-4">
                   No matching conversations found
                 </div>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border/50 my-2" />

        {/* Static Links */}
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
      </div>

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
    <div className="flex h-screen w-64 flex-col border-r bg-card text-card-foreground shadow-sm shrink-0 z-20">
      <Suspense fallback={<div className="p-4">Loading...</div>}>
        <SidebarContent />
      </Suspense>
    </div>
  )
}
