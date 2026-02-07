"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  Clock, 
  MessageSquare, 
  ArrowRight, 
  ChevronDown, 
  ChevronUp, 
  User,
  Bot,
  Loader2,
  Trash2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card"
import { toast } from "sonner"

// --- Types ---

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

interface TranscriptMetadata {
  sessionId: string
  messageCount: number
  firstMessageTime: string
  lastMessageTime: string
}

interface TranscriptWithMessages extends TranscriptMetadata {
  messages: Message[]
}

// --- Helpers ---

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

const API_BASE = "http://localhost:5757/api/transcripts"

export default function HistoryPage() {
  const router = useRouter()
  const [transcripts, setTranscripts] = useState<TranscriptMetadata[]>([])
  const [expandedTranscript, setExpandedTranscript] = useState<TranscriptWithMessages | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetchTranscripts()
  }, [])

  const fetchTranscripts = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(API_BASE)
      if (!res.ok) throw new Error("Failed to fetch transcripts")
      const data = await res.json()
      setTranscripts(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load history")
    } finally {
      setIsLoading(false)
    }
  }

  const loadTranscriptMessages = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/${sessionId}`)
      if (!res.ok) throw new Error("Failed to load transcript")
      const data = await res.json()
      
      const metadata = transcripts.find(t => t.sessionId === sessionId)
      if (!metadata) return

      setExpandedTranscript({ 
        ...metadata,
        messages: data.messages 
      })
    } catch (error) {
      toast.error("Failed to load transcript details")
    }
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedTranscript(null)
    } else {
      setExpandedId(id)
      await loadTranscriptMessages(id)
    }
  }

  const handleContinue = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation() // Prevent toggling expansion
    // Use original session ID to continue the conversation
    toast.info("Continuing previous session")
    router.push(`/chat?session=${sessionId}`)
  }

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation() // Prevent toggling expansion
    
    if (!confirm("Are you sure you want to delete this session?")) {
      return
    }
    
    try {
      const res = await fetch(`${API_BASE}/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error("Failed to delete transcript")
      
      // Remove from local state
      setTranscripts(prev => prev.filter(t => t.sessionId !== sessionId))
      if (expandedId === sessionId) {
        setExpandedId(null)
        setExpandedTranscript(null)
      }
      toast.success("Session deleted")
    } catch (error) {
      toast.error("Failed to delete session")
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      }).format(new Date(dateString))
    } catch {
      return "Unknown"
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Clock className="h-8 w-8 text-primary" />
          Transcript History
        </h1>
        <p className="text-muted-foreground text-lg">
          Review and continue your past coding sessions.
        </p>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading history...</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {transcripts.map((transcript) => {
            const isExpanded = expandedId === transcript.sessionId

            return (
              <Card 
                key={transcript.sessionId} 
                className={`transition-all duration-200 border-l-4 ${
                  isExpanded ? 'border-l-primary shadow-lg ring-1 ring-primary/10' : 'border-l-transparent hover:border-l-muted-foreground/50'
                }`}
              >
                <CardHeader className="cursor-pointer" onClick={() => toggleExpand(transcript.sessionId)}>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-xl flex items-center gap-2">
                        Session {formatDate(transcript.firstMessageTime)}
                        <span className="text-xs font-normal font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {transcript.sessionId.slice(0, 8)}
                        </span>
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last active: {formatDate(transcript.lastMessageTime)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {transcript.messageCount} messages
                        </span>
                      </CardDescription>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(transcript.sessionId)
                        }}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {/* Expanded Detail View */}
                {isExpanded && (
                  <CardContent className="border-t bg-muted/10 p-0">
                    {/* Back to list button */}
                    <div className="sticky top-0 bg-background/95 backdrop-blur border-b p-2 flex items-center justify-between z-10">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => toggleExpand(transcript.sessionId)}
                        className="gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronUp className="h-4 w-4" />
                        Back to list
                      </Button>
                      <span className="text-xs text-muted-foreground font-mono">
                        {expandedTranscript?.messages.length || 0} messages
                      </span>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto p-4 space-y-4">
                      {!expandedTranscript ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : expandedTranscript.messages.map((msg, idx) => (
                        <div 
                          key={idx} 
                          className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div 
                            className={`max-w-[85%] rounded-lg p-3 text-sm ${
                              msg.role === 'user' 
                                ? 'bg-primary text-primary-foreground ml-8' 
                                : 'bg-muted border mr-8'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1 text-xs opacity-70">
                              {msg.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                              <span className="font-semibold capitalize">{msg.role}</span>
                              <span>•</span>
                              <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}</span>
                            </div>
                            <div className="whitespace-pre-wrap font-sans leading-relaxed">
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}

                <CardFooter className="bg-muted/5 p-4 flex justify-between gap-2 border-t">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => handleDelete(e, transcript.sessionId)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => toggleExpand(transcript.sessionId)}
                    >
                      {isExpanded ? "Close Details" : "View Details"}
                    </Button>
                    <Button 
                      onClick={(e) => handleContinue(e, transcript.sessionId)}
                      className="gap-2"
                    >
                      Continue Chat
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            )
          })}

          {/* Empty State */}
          {transcripts.length === 0 && (
            <div className="py-24 text-center border-2 border-dashed rounded-xl bg-muted/10">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No history found</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Your chat sessions will appear here once you start interacting with the agent.
              </p>
              <Button onClick={() => router.push('/chat')} className="mt-6">
                Start New Chat
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
