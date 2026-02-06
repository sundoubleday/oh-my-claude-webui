"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { 
  Clock, 
  MessageSquare, 
  ArrowRight, 
  ChevronDown, 
  ChevronUp, 
  Terminal,
  User,
  Bot
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

// --- Types ---

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

interface Transcript {
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  messages: Message[]
}

// --- Mock Data ---

const MOCK_TRANSCRIPTS: Transcript[] = [
  {
    sessionId: "ses_abc123xyz",
    title: "React Component Refactoring",
    createdAt: "2026-02-06T09:00:00Z",
    updatedAt: "2026-02-06T09:45:00Z",
    messageCount: 8,
    messages: [
      {
        role: "user",
        content: "Can you help me refactor this Button component to use cva?",
        timestamp: "2026-02-06T09:00:00Z"
      },
      {
        role: "assistant",
        content: "Certainly! Class Variance Authority (cva) is great for managing variants. Show me your current code.",
        timestamp: "2026-02-06T09:00:15Z"
      },
      {
        role: "user",
        content: "Here it is: \n```tsx\nconst Button = ({ variant, ...props }) => { ... }\n```",
        timestamp: "2026-02-06T09:02:00Z"
      },
      {
        role: "assistant",
        content: "Here's the refactored version using `cva` and `tailwind-merge`:\n\n```tsx\nimport { cva } from 'class-variance-authority'\n// ... implementation\n```",
        timestamp: "2026-02-06T09:03:00Z"
      }
    ]
  },
  {
    sessionId: "ses_dev789ops",
    title: "Docker Compose Setup",
    createdAt: "2026-02-05T14:30:00Z",
    updatedAt: "2026-02-05T15:00:00Z",
    messageCount: 12,
    messages: [
      {
        role: "user",
        content: "I need a docker-compose.yml for a Node.js app and Postgres.",
        timestamp: "2026-02-05T14:30:00Z"
      },
      {
        role: "assistant",
        content: "I can help with that. Do you need persistent storage for Postgres?",
        timestamp: "2026-02-05T14:30:45Z"
      },
      {
        role: "user",
        content: "Yes, please.",
        timestamp: "2026-02-05T14:31:00Z"
      }
    ]
  },
  {
    sessionId: "ses_ux999des",
    title: "Color Palette Generation",
    createdAt: "2026-02-04T10:15:00Z",
    updatedAt: "2026-02-04T10:25:00Z",
    messageCount: 4,
    messages: [
      {
        role: "user",
        content: "Generate a cyberpunk color palette.",
        timestamp: "2026-02-04T10:15:00Z"
      },
      {
        role: "assistant",
        content: "Here is a high-contrast cyberpunk palette:\n- Neon Pink: #FF00FF\n- Cyber Yellow: #F4E500\n- Matrix Green: #00FF41\n- Deep Void: #0D0E15",
        timestamp: "2026-02-04T10:15:05Z"
      }
    ]
  }
]

// --- Components ---

export default function HistoryPage() {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const handleContinue = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation() // Prevent toggling expansion
    router.push(`/chat?session=${sessionId}`)
  }

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    }).format(new Date(dateString))
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
      <div className="grid gap-6">
        {MOCK_TRANSCRIPTS.map((transcript) => {
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
                      {transcript.title}
                      <span className="text-xs font-normal font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {transcript.sessionId}
                      </span>
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(transcript.updatedAt)}
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

              {/* Collapsed Preview (Optional - maybe just show nothing or last message?) */}
              {!isExpanded && (
                <CardContent className="pb-4 text-sm text-muted-foreground truncate cursor-pointer" onClick={() => toggleExpand(transcript.sessionId)}>
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 shrink-0 opacity-50" />
                    <span className="italic">
                      "{transcript.messages[transcript.messages.length - 1].content.slice(0, 100)}..."
                    </span>
                  </div>
                </CardContent>
              )}

              {/* Expanded Detail View */}
              {isExpanded && (
                <CardContent className="border-t bg-muted/10 p-0">
                  <div className="max-h-[500px] overflow-y-auto p-4 space-y-4">
                    {transcript.messages.map((msg, idx) => (
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

              <CardFooter className="bg-muted/5 p-4 flex justify-end gap-2 border-t">
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
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
