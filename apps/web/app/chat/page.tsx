"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Send, User, Bot, Loader2, Terminal, Sparkles, Zap, Shield, ShieldCheck, ShieldOff, FolderOpen, X, File, Image as ImageIcon, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ProjectSelector } from "@/components/project-selector"
import { FileExplorer } from "@/components/file-explorer"

interface Attachment {
  id: string
  file: File
  previewUrl: string
  type: "image" | "file"
}

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-3-5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-haiku': 200000,
  'claude-3-5-haiku': 200000,
  'claude-2.1': 200000,
  'claude-2.0': 100000,
  'claude-instant-1.2': 100000,
  'glm-4': 128000,
  'glm-4.7': 128000,
}

function getContextLimit(model: string): number {
  const lower = model.toLowerCase()
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (lower.includes(key)) return limit
  }
  return 128000 // Default fallback
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
  // Always use the same fallback method to ensure consistency
  // This avoids hydration mismatch between server and client
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
  const [currentTask, setCurrentTask] = useState<string>("")
  const [sessionId, setSessionId] = useState<string>("")
  const [sessionReady, setSessionReady] = useState(false)
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null)
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null)
  const [showCommands, setShowCommands] = useState(false)
  const [filteredCommands, setFilteredCommands] = useState<string[]>([])
  const [currentProjectPath, setCurrentProjectPath] = useState<string>("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  
  // Refs
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Track previous session ID to detect changes
  const prevSessionIdRef = useRef<string>("")

  // Initialize Session
  useEffect(() => {
    const urlSession = searchParams.get("session")
    
    // Handle "new" as special case - generate real UUID client-side only
    if (urlSession === "new") {
      if (typeof window !== "undefined") {
        const newId = generateUUID()
        prevSessionIdRef.current = newId
        setSessionId(newId)
        setSessionReady(true)
        // Clear all state for new session
        setMessages([])
        setTokenUsage(null)
        setMetadata(null)
        setProcessingStatus("idle")
        setAttachments([])
        // Use window.history to avoid re-render
        window.history.replaceState(null, "", `/chat?session=${newId}`)
      }
      return
    }
    
    if (urlSession) {
      // Clear messages when switching to a different session
      if (prevSessionIdRef.current && prevSessionIdRef.current !== urlSession) {
        console.log('[Chat] Session changed, clearing state:', prevSessionIdRef.current, '->', urlSession)
        setMessages([])
        setTokenUsage(null)
        setMetadata(null)
        setProcessingStatus("idle")
        setAttachments([])
      }
      prevSessionIdRef.current = urlSession
      setSessionId(urlSession)
      setSessionReady(true)

      // Get project from URL if available
      const urlProject = searchParams.get("project")
      if (urlProject) {
        setCurrentProjectPath(urlProject)
      }
    } else if (typeof window !== "undefined" && !sessionReady) {
      const newId = generateUUID()
      prevSessionIdRef.current = newId
      setSessionId(newId)
      setSessionReady(true)
      // Clear all state for new session
      setMessages([])
      setTokenUsage(null)
      setMetadata(null)
      setProcessingStatus("idle")
      setAttachments([])
      window.history.replaceState(null, "", `/chat?session=${newId}`)
    }
  }, [searchParams, sessionReady])

  // Load historical messages when resuming a session
  useEffect(() => {
    if (!sessionId || !sessionReady) return
    
    // Skip loading for brand new sessions (no existing messages)
    // Only try to load if this looks like an existing session ID (starts with 'ses_')
    const isExistingSession = sessionId.startsWith('ses_')
    
    console.log('[Chat] Checking for history, sessionId:', sessionId, 'isExisting:', isExistingSession)
    
    // Try to load history for this session (uses by-session endpoint to search all projects)
    fetch(`http://localhost:5757/api/transcripts/by-session/${sessionId}`)
      .then(res => {
        if (!res.ok) {
          console.log('[Chat] No history found for session (404 or error)')
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data && data.messages && data.messages.length > 0) {
          console.log('[Chat] Loading', data.messages.length, 'historical messages')
          // Convert transcript format to Message format
          const historicalMessages: Message[] = data.messages
            .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content)
            .map((m: any) => ({
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? cleanContent(m.content) : cleanContent(JSON.stringify(m.content)),
              timestamp: m.timestamp || new Date().toISOString()
            }))
          if (historicalMessages.length > 0) {
            console.log('[Chat] ✅ Loaded', historicalMessages.length, 'messages from history')
            setMessages(historicalMessages)
            // Always update project path from session data to ensure File Explorer syncs
            if (data.projectPath) {
              console.log('[Chat] Updating project path from history:', data.projectPath)
              setCurrentProjectPath(data.projectPath)
            }
          }
        } else {
          console.log('[Chat] Session exists but no messages found')
        }
      })
      .catch((err) => {
        // No history found, that's fine for new sessions
        console.log('[Chat] Failed to load history:', err.message)
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
          console.log('[Chat] Received assistant message:', typeof data.content, data.content?.substring?.(0, 100) || data.content)
          
          // Handle both string content and object content formats
          let content: string
          if (typeof data.content === "string") {
            content = data.content
          } else if (typeof data.content === "object") {
            content = data.content.content || data.content.result || JSON.stringify(data.content)
          } else {
            content = String(data.content)
          }

          if (content && content.trim()) {
            console.log('[Chat] ✅ Adding assistant message, length:', content.length)
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: cleanContent(content),
                timestamp: new Date().toISOString(),
              },
            ])
            // REMOVED: setProcessingStatus("idle") here - wait for explicit status or exit
          } else {
            console.warn('[Chat] ⚠️ Received empty content')
          }
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
            if (data.task) setCurrentTask(data.task)
          } else if (data.status === "ready" || data.status === "stopped" || data.status === "error") {
            // Stop loading on any terminal state
            setProcessingStatus("idle")
            setCurrentTask("")
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

  const sendMessage = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    if ((!input.trim() && attachments.length === 0) || !ws || status !== "connected" || processingStatus === "processing") return

    // Add user message to UI
    const newMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, newMessage])
    setProcessingStatus("processing")
    
    // Process attachments (convert images to base64 if needed)
    const attachmentData = await Promise.all(attachments.map(async (a) => {
      if (a.type === 'image') {
        return new Promise<{name: string, type: string, data: string}>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => {
            resolve({
              name: a.file.name,
              type: a.file.type,
              data: (reader.result as string).split(',')[1] // Base64 data only
            })
          }
          reader.readAsDataURL(a.file)
        })
      }
      return { name: a.file.name, type: a.file.type, data: '' }
    }))

    // Use sessionIdRef.current to always get the latest session ID
    ws.send(JSON.stringify({
      type: "message",
      content: input,
      sessionId: sessionIdRef.current,
      projectPath: currentProjectPath,
      attachments: attachmentData,
      // Inject conversation history to maintain context even if CLI session is stateless
      history: messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
    }))

    setInput("")
    setAttachments([])
    setShowCommands(false)
    
    setTimeout(() => {
      inputRef.current?.focus()
    }, 10)
  }, [input, attachments, ws, status, processingStatus, currentProjectPath])

  // File handling
  const handleFiles = useCallback((files: FileList | File[]) => {
    const newAttachments: Attachment[] = []
    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith('image/')
      const attachment: Attachment = {
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: URL.createObjectURL(file),
        type: isImage ? 'image' : 'file'
      }
      newAttachments.push(attachment)
    })
    setAttachments(prev => [...prev, ...newAttachments])
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const filtered = prev.filter(a => a.id !== id)
      // Revoke URL to prevent memory leaks
      const removed = prev.find(a => a.id === id)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return filtered
    })
    // Maintain focus on input
    inputRef.current?.focus()
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      handleFiles(e.clipboardData.files)
    }
  }, [handleFiles])

  const handleProjectSelect = useCallback((project: { path: string }) => {
    setCurrentProjectPath(project.path)
    // When switching project, start a new session
    const newId = generateUUID()
    router.push(`/chat?session=${newId}&project=${encodeURIComponent(project.path)}`)
    // State will be cleared by the useEffect tracking searchParams
  }, [router])

  const selectCommand = useCallback((cmd: string) => {
    setInput(`/${cmd} `)
    setShowCommands(false)
    inputRef.current?.focus()
  }, [])

  const [showFileExplorer, setShowFileExplorer] = useState(true)

  const handleFileSelect = useCallback((file: any) => {
    // Auto-fill /read command
    setInput(`/read "${file.path}" `)
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex h-[calc(100vh-2rem)] max-w-full mx-auto animate-in fade-in duration-500 overflow-hidden rounded-lg border shadow-sm bg-background">
      
      {/* Main Chat Area */}
      <div 
        className="flex-1 flex flex-col min-w-0 relative"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
            <div className="bg-background p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3 scale-110 transition-transform">
              <Paperclip className="w-12 h-12 text-primary animate-bounce" />
              <p className="text-lg font-bold">Drop files here to upload</p>
              <p className="text-sm text-muted-foreground text-center">Images will be analyzed, text files will be read</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Claude Chat</h1>
              <div className="flex items-center gap-2">
                <ProjectSelector 
                  currentProjectPath={currentProjectPath} 
                  onSelect={handleProjectSelect} 
                />
                <span className="text-muted-foreground/30">|</span>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  status === "connected" ? "bg-emerald-500 animate-pulse" :
                  status === "connecting" ? "bg-amber-500" :
                  "bg-red-500"
                )} />
                <span className="text-xs text-muted-foreground font-mono">
                  {status === "connected" ? "Online" : status}
                </span>
              </div>
            </div>
          </div>
          
          {/* Model & Mode Info */}
          {metadata && (
            <div className="flex items-center gap-3">
              {/* Context Window Usage */}
              {tokenUsage && (
                <div className="flex flex-col items-end gap-1 hidden md:flex">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                    <span>Context: {((tokenUsage.inputTokens / getContextLimit(metadata.model)) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-24 h-1 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500",
                        (tokenUsage.inputTokens / getContextLimit(metadata.model)) > 0.8 ? "bg-red-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${Math.min(100, (tokenUsage.inputTokens / getContextLimit(metadata.model)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Model Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <Bot className="w-3 h-3" />
                {formatModelName(metadata.model)}
              </div>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-8 w-8 ml-1", showFileExplorer && "bg-muted")}
                onClick={() => setShowFileExplorer(!showFileExplorer)}
              >
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Messages Area - Removed Card wrapper to fit layout */}
        <div className="flex-1 flex flex-col overflow-hidden bg-muted/5 relative">
          <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
            {messages.length === 0 && processingStatus === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-8 text-center opacity-40 pointer-events-none">
                <Terminal className="w-16 h-16 mb-6 stroke-1" />
                <p className="text-xl font-medium tracking-tight">Start a new session</p>
                <p className="text-sm mt-2">Type a message below to begin interacting with the agent.</p>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex gap-3 max-w-[85%] md:max-w-[75%] animate-in slide-in-from-bottom-2 duration-300",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : ""
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm",
                  msg.role === "user" ? "bg-primary text-primary-foreground border-transparent" : "bg-card text-card-foreground border-border"
                )}>
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={cn(
                  "rounded-2xl px-5 py-3.5 shadow-sm text-sm whitespace-pre-wrap leading-relaxed",
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground rounded-tr-sm" 
                    : "bg-card border text-card-foreground rounded-tl-sm"
                )}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Loading Indicator */}
            {processingStatus === "processing" && (
              <div className="flex gap-3 w-full justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex gap-3 max-w-[85%] md:max-w-[75%]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm bg-card text-card-foreground border-border animate-pulse">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="rounded-2xl px-5 py-4 shadow-md text-sm bg-background border border-primary/20 text-foreground relative overflow-hidden group">
                    <div className="absolute inset-0 bg-primary/5 animate-pulse" />
                    <div className="flex flex-col gap-3 relative z-10">
                      <div className="flex items-center gap-2.5">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                        </div>
                        <span className="font-semibold text-primary/80 tracking-tight">
                          {currentTask || "Claude is thinking"}
                        </span>
                      </div>
                      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/30 w-1/3 animate-[loading_1.5s_infinite_linear]" 
                             style={{ backgroundImage: 'linear-gradient(90deg, transparent, currentColor, transparent)' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={scrollRef} className="h-4" />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t z-20 relative">
            {/* Attachment Previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 animate-in slide-in-from-bottom-2 duration-200">
                {attachments.map((a) => (
                  <div key={a.id} className="relative group">
                    <div className="w-16 h-16 rounded-lg border bg-card flex items-center justify-center overflow-hidden shadow-sm">
                      {a.type === 'image' ? (
                        <img src={a.previewUrl} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <File className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <button 
                      onClick={() => removeAttachment(a.id)}
                      className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5 shadow-md hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 text-[8px] text-white px-1 truncate py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {a.file.name}
                    </div>
                  </div>
                ))}
              </div>
            )}

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
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                className="hidden"
                multiple
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                disabled={status !== "connected" || processingStatus === "processing"}
              >
                <Paperclip className="w-5 h-5" />
              </Button>
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={onPaste}
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
                disabled={(!input.trim() && attachments.length === 0) || status !== "connected" || processingStatus === "processing"}
                className={cn(
                  "absolute right-1.5 w-9 h-9 transition-all shadow-sm",
                  (input.trim() || attachments.length > 0) && processingStatus !== "processing" ? "scale-100 opacity-100" : "scale-90 opacity-0"
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
        </div>
      </div>

      {/* Right File Explorer - key forces re-mount when project changes */}
      {showFileExplorer && (
        <FileExplorer 
          key={currentProjectPath || 'empty'}
          initialPath={currentProjectPath} 
          onFileSelect={handleFileSelect}
        />
      )}
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <ChatContent />
    </Suspense>
  )
}
