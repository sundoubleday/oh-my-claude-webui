"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Send, User, Bot, Loader2, Wifi, WifiOff, Terminal, Sparkles } from "lucide-react"
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

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error"

function generateUUID(): string {
  // Try modern API first
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export default function ChatPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // State
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [sessionId, setSessionId] = useState<string>("")
  const [sessionReady, setSessionReady] = useState(false)
  
  // Refs
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Initialize Session
  useEffect(() => {
    const urlSession = searchParams.get("session")
    if (urlSession) {
      setSessionId(urlSession)
      setSessionReady(true)
    } else if (typeof window !== "undefined" && !sessionReady) {
      const newId = generateUUID()
      setSessionId(newId)
      setSessionReady(true)
      router.replace(`/chat?session=${newId}`)
    }
  }, [searchParams, router, sessionReady])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  // WebSocket Connection
  useEffect(() => {
    if (!sessionId || !sessionReady) return

    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return
    }

    console.log('Establishing WebSocket connection for session:', sessionId)
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
        
        if (data.type === "message") {
          // CLI returns { type: "result", result: "...", ... }
          const content = typeof data.content === "string" 
            ? data.content 
            : data.content.result || data.content.message?.content || JSON.stringify(data.content)

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: content,
              timestamp: new Date().toISOString(),
            },
          ])
        } else if (data.type === "error") {
          console.error("Server error:", data.error)
          toast.error(data.error)
        } else if (data.type === "status") {
             // Handle status updates if needed
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
      
      // Only close if the connection is actually open
      if (websocket.readyState === WebSocket.OPEN || 
          websocket.readyState === WebSocket.CONNECTING) {
        websocket.close()
      }
      
      // Clean up ref
      if (wsRef.current === websocket) {
        wsRef.current = null
      }
    }
  }, [sessionId, sessionReady])

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault()
    
    if (!input.trim() || !ws || status !== "connected") return

    const newMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, newMessage])
    
    ws.send(JSON.stringify({
      type: "message",
      content: input,
      sessionId: sessionId
    }))

    setInput("")
    
    // Keep focus on input
    setTimeout(() => {
        inputRef.current?.focus()
    }, 10)
  }

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
      </div>

      {/* Messages Area */}
      <Card className="flex-1 flex flex-col overflow-hidden bg-muted/5 border-muted shadow-sm relative">
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
            {messages.length === 0 && (
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
            <div ref={scrollRef} className="h-4" />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t z-20">
            <form 
                onSubmit={sendMessage}
                className="relative flex items-center gap-2 max-w-4xl mx-auto"
            >
                <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={status === "connected" ? "Type your message..." : "Connecting..."}
                    className="pr-12 py-6 text-base shadow-sm bg-muted/30 focus-visible:bg-background transition-all border-muted-foreground/20 focus-visible:border-primary/50"
                    disabled={status !== "connected"}
                    autoFocus
                />
                <Button 
                    type="submit" 
                    size="icon"
                    disabled={!input.trim() || status !== "connected"}
                    className={cn(
                        "absolute right-1.5 w-9 h-9 transition-all shadow-sm",
                        input.trim() ? "scale-100 opacity-100" : "scale-90 opacity-0"
                    )}
                >
                    <Send className="w-4 h-4" />
                    <span className="sr-only">Send</span>
                </Button>
            </form>
            <div className="text-center mt-3 flex justify-center gap-4">
                 <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-semibold">
                    OH-MY-CLAUDE
                </p>
            </div>
        </div>
      </Card>
    </div>
  )
}
