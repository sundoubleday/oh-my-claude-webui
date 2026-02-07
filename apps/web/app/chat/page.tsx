"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Send, User, Bot, Loader2, Terminal, Sparkles, Zap, Shield, ShieldCheck, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

interface SessionMetadata {
  model: string
  permissionMode: string
  claudeCodeVersion: string
  slashCommands: string[]
  skills: string[]
  agents: string[]
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error"
type ProcessingStatus = "idle" | "processing"

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

// Format model name for display - show full name with version
function formatModelName(model: string): string {
  // Examples: claude-opus-4-5-thinking -> Opus 4.5 Thinking
  //           claude-sonnet-4-20250514 -> Sonnet 4
  //           claude-3-5-sonnet-20241022 -> Sonnet 3.5
  const lower = model.toLowerCase()
  
  // Extract model family
  let family = ''
  if (lower.includes('opus')) family = 'Opus'
  else if (lower.includes('sonnet')) family = 'Sonnet'
  else if (lower.includes('haiku')) family = 'Haiku'
  else return model // Return raw if unknown
  
  // Extract version numbers
  const versionMatch = model.match(/(\d+)[-.]?(\d+)?/)
  const version = versionMatch 
    ? versionMatch[2] ? `${versionMatch[1]}.${versionMatch[2]}` : versionMatch[1]
    : ''
  
  // Check for special modes
  const hasThinking = lower.includes('thinking')
  
  return `${family}${version ? ` ${version}` : ''}${hasThinking ? ' Thinking' : ''}`
}

// Get permission mode icon and label
function getPermissionModeInfo(mode: string): { icon: React.ReactNode; label: string; color: string } {
  switch (mode) {
    case 'bypassPermissions':
      return { icon: <ShieldOff className="w-3 h-3" />, label: 'Bypass', color: 'text-red-500' }
    case 'acceptEdits':
      return { icon: <ShieldCheck className="w-3 h-3" />, label: 'Auto-Accept', color: 'text-amber-500' }
    case 'plan':
      return { icon: <Zap className="w-3 h-3" />, label: 'Plan', color: 'text-blue-500' }
    default:
      return { icon: <Shield className="w-3 h-3" />, label: 'Default', color: 'text-muted-foreground' }
  }
}

// Clean content - remove [Pasted ~N lines] patterns
function cleanContent(content: string): string {
  return content.replace(/\[Pasted ~\d+ lines?\]/g, '').trim()
}

function ChatContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // State
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>("idle")
  const [sessionId, setSessionId] = useState<string>("")
  const [sessionReady, setSessionReady] = useState(false)
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null)
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null)
  const [showCommands, setShowCommands] = useState(false)
  const [filteredCommands, setFilteredCommands] = useState<string[]>([])
  
  // Refs
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Track previous session ID to detect changes
  const prevSessionIdRef = useRef<string>("")

  // Initialize Session
  useEffect(() => {
    const urlSession = searchParams.get("session")
    if (urlSession) {
      // Clear messages when switching to a different session
      if (prevSessionIdRef.current && prevSessionIdRef.current !== urlSession) {
        setMessages([])
        setTokenUsage(null)
        setMetadata(null)
        setProcessingStatus("idle")
      }
      prevSessionIdRef.current = urlSession
      setSessionId(urlSession)
      setSessionReady(true)
    } else if (typeof window !== "undefined" && !sessionReady) {
      const newId = generateUUID()
      prevSessionIdRef.current = newId
      setSessionId(newId)
      setSessionReady(true)
      router.replace(`/chat?session=${newId}`)
    }
  }, [searchParams, router, sessionReady])

  // Load historical messages when resuming a session
  useEffect(() => {
    if (!sessionId || !sessionReady) return
    
    // Try to load history for this session
    fetch(`http://localhost:5757/api/transcripts/${sessionId}`)
      .then(res => {
        if (!res.ok) return null
        return res.json()
      })
      .then(data => {
        if (data && data.messages && data.messages.length > 0) {
          // Convert transcript format to Message format
          const historicalMessages: Message[] = data.messages
            .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content)
            .map((m: any) => ({
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? cleanContent(m.content) : cleanContent(JSON.stringify(m.content)),
              timestamp: m.timestamp || new Date().toISOString()
            }))
          if (historicalMessages.length > 0) {
            setMessages(historicalMessages)
          }
        }
      })
      .catch(() => {
        // No history found, that's fine for new sessions
      })
  }, [sessionId, sessionReady])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, processingStatus])

  // Handle slash command filtering
  useEffect(() => {
    if (input.startsWith('/') && metadata?.slashCommands) {
      const query = input.slice(1).toLowerCase()
      const filtered = metadata.slashCommands
        .filter(cmd => cmd.toLowerCase().includes(query))
        .slice(0, 10)
      setFilteredCommands(filtered)
      setShowCommands(filtered.length > 0)
    } else {
      setShowCommands(false)
      setFilteredCommands([])
    }
  }, [input, metadata])

  // Track session ID in a ref for WebSocket messages (avoids recreating WebSocket on session ID change)
  const sessionIdRef = useRef<string>("")
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // WebSocket Connection - only depends on sessionReady, not sessionId
  // This prevents WebSocket recreation when CLI returns a different session ID
  useEffect(() => {
    if (!sessionReady) return

    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return
    }

    console.log('Establishing WebSocket connection')
    const websocket = new WebSocket("ws://localhost:5757/ws/chat")
    wsRef.current = websocket

    let isMounted = true

    websocket.onopen = () => {
      if (!isMounted) return
      setStatus("connected")
      toast.success("Connected to server")
    }

    websocket.onmessage = (event) => {
      if (!isMounted) return
      try {
        const data = JSON.parse(event.data)
        console.log('[WebSocket] Received:', data.type, data)
        
        // Handle init message - session metadata
        if (data.type === "init" && data.metadata) {
          console.log('Received metadata:', data.metadata)
          setMetadata(data.metadata)
        }
        
        // Handle session ID update from CLI (real session ID)
        if (data.type === "sessionUpdate" && data.sessionId) {
          console.log('Received real session ID from CLI:', data.sessionId)
          // CRITICAL: Update prevSessionIdRef BEFORE setSessionId to prevent
          // the session change detection from clearing messages
          prevSessionIdRef.current = data.sessionId
          setSessionId(data.sessionId)
          // Use history.replaceState to avoid page re-render that would lose messages
          window.history.replaceState(null, '', `/chat?session=${data.sessionId}`)
        }
        
        // Handle assistant message
        if (data.type === "message" && data.content) {
          const content = typeof data.content === "string" 
            ? data.content 
            : data.content.content || data.content.result || JSON.stringify(data.content)

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: cleanContent(content),
              timestamp: new Date().toISOString(),
            },
          ])
          // Also reset processing status when message is received
          setProcessingStatus("idle")
        }
        
        // Handle token usage
        if (data.type === "tokenUsage" && data.usage) {
          console.log('Token usage:', data.usage)
          setTokenUsage(data.usage)
        }
        
        // Handle status updates
        if (data.type === "status") {
          if (data.status === "processing") {
            setProcessingStatus("processing")
          } else if (data.status === "ready") {
            setProcessingStatus("idle")
          }
        }
        
        // Handle errors
        if (data.type === "error") {
          console.error("Server error:", data.error)
          toast.error(data.error)
          setProcessingStatus("idle")
        }
      } catch (e) {
        console.error("Failed to parse message:", e)
      }
    }

    websocket.onclose = () => {
      if (!isMounted) return
      setStatus("disconnected")
      console.log("Disconnected from chat server")
    }

    websocket.onerror = (error) => {
      if (!isMounted) return
      setStatus("error")
      console.error("WebSocket error:", error)
      toast.error("Connection error")
    }

    setWs(websocket)

    return () => {
      console.log('Cleaning up WebSocket connection')
      isMounted = false
      
      if (websocket.readyState === WebSocket.OPEN || 
          websocket.readyState === WebSocket.CONNECTING) {
        websocket.close()
      }
      
      if (wsRef.current === websocket) {
        wsRef.current = null
      }
    }
  }, [sessionReady, router])

  const sendMessage = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    
    if (!input.trim() || !ws || status !== "connected" || processingStatus === "processing") return

    const newMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, newMessage])
    setProcessingStatus("processing")
    
    // Use sessionIdRef.current to always get the latest session ID
    ws.send(JSON.stringify({
      type: "message",
      content: input,
      sessionId: sessionIdRef.current
    }))

    setInput("")
    setShowCommands(false)
    
    setTimeout(() => {
      inputRef.current?.focus()
    }, 10)
  }, [input, ws, status, processingStatus])

  const selectCommand = useCallback((cmd: string) => {
    setInput(`/${cmd} `)
    setShowCommands(false)
    inputRef.current?.focus()
  }, [])

  const permissionInfo = metadata ? getPermissionModeInfo(metadata.permissionMode) : null

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-5xl mx-auto p-4 md:p-6 gap-4 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Claude Chat</h1>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                status === "connected" ? "bg-emerald-500 animate-pulse" :
                status === "connecting" ? "bg-amber-500" :
                "bg-red-500"
              )} />
              <span className="text-xs text-muted-foreground font-mono">
                {status === "connected" ? "Online" : status} • {sessionId.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>
        
        {/* Model & Mode Info */}
        {metadata && (
          <div className="flex items-center gap-3">
            {/* Model Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Bot className="w-3 h-3" />
              {formatModelName(metadata.model)}
            </div>
            
            {/* Permission Mode Badge */}
            {permissionInfo && (
              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                permissionInfo.color,
                "bg-muted"
              )}>
                {permissionInfo.icon}
                {permissionInfo.label}
              </div>
            )}
            
            {/* Token Usage */}
            {tokenUsage && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs font-mono text-muted-foreground">
                <Zap className="w-3 h-3" />
                {(tokenUsage.inputTokens + tokenUsage.outputTokens).toLocaleString()} tokens
                <span className="text-emerald-500">${tokenUsage.totalCostUsd.toFixed(4)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <Card className="flex-1 flex flex-col overflow-hidden bg-muted/5 border-muted shadow-sm relative">
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
          {messages.length === 0 && processingStatus === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-8 text-center opacity-40 pointer-events-none">
              <Terminal className="w-16 h-16 mb-6 stroke-1" />
              <p className="text-xl font-medium tracking-tight">Start a new session</p>
              <p className="text-sm mt-2">Type a message below to begin interacting with the agent.</p>
              {metadata?.slashCommands && (
                <p className="text-xs mt-4">Type <code className="bg-muted px-1 rounded">/</code> to see available commands</p>
              )}
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={cn(
                "flex gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div className={cn(
                "flex gap-3 max-w-[85%] md:max-w-[75%] group",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}>
                {/* Avatar */}
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm transition-transform group-hover:scale-105",
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "bg-card text-card-foreground border-border"
                )}>
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Content */}
                <div className={cn(
                  "rounded-2xl px-5 py-3.5 shadow-sm text-sm leading-relaxed relative",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-card border text-card-foreground rounded-tl-sm"
                )}>
                  <div className="whitespace-pre-wrap font-sans">
                    {msg.content}
                  </div>
                  <div className={cn(
                    "text-[10px] mt-2 opacity-0 group-hover:opacity-60 transition-opacity absolute -bottom-5",
                    msg.role === "user" ? "right-0" : "left-0",
                    "text-muted-foreground whitespace-nowrap"
                  )}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {/* Loading Indicator */}
          {processingStatus === "processing" && (
            <div className="flex gap-3 w-full justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex gap-3 max-w-[85%] md:max-w-[75%]">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm bg-card text-card-foreground border-border">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="rounded-2xl px-5 py-3.5 shadow-sm text-sm bg-card border text-card-foreground rounded-tl-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={scrollRef} className="h-4" />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t z-20 relative">
          {/* Command Autocomplete */}
          {showCommands && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto z-30">
              {filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd}
                  onClick={() => selectCommand(cmd)}
                  className={cn(
                    "w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2",
                    idx === 0 && "bg-muted/50"
                  )}
                >
                  <span className="text-primary font-mono">/</span>
                  <span>{cmd}</span>
                </button>
              ))}
            </div>
          )}
          
          <form 
            onSubmit={sendMessage}
            className="relative flex items-center gap-2 max-w-4xl mx-auto"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                processingStatus === "processing" 
                  ? "Waiting for response..." 
                  : status === "connected" 
                    ? "Type your message... (/ for commands)" 
                    : "Connecting..."
              }
              className="pr-12 py-6 text-base shadow-sm bg-muted/30 focus-visible:bg-background transition-all border-muted-foreground/20 focus-visible:border-primary/50"
              disabled={status !== "connected" || processingStatus === "processing"}
              autoFocus
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!input.trim() || status !== "connected" || processingStatus === "processing"}
              className={cn(
                "absolute right-1.5 w-9 h-9 transition-all shadow-sm",
                input.trim() && processingStatus !== "processing" ? "scale-100 opacity-100" : "scale-90 opacity-0"
              )}
            >
              {processingStatus === "processing" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="sr-only">Send</span>
            </Button>
          </form>
          <div className="text-center mt-3 flex justify-center gap-4">
            <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-semibold">
              OH-MY-CLAUDE
              {metadata?.claudeCodeVersion && ` • v${metadata.claudeCodeVersion}`}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <ChatContent />
    </Suspense>
  )
}
