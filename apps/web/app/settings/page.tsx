"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Save, FileJson, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Mock configuration until backend is ready
const MOCK_CONFIG = {
  mcpServers: {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "E:\\Vibe Coding\\Open Code\\project"],
      "enabled": true
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "enabled": true
    }
  },
  editor: {
    "theme": "vscode-dark",
    "fontSize": 14,
    "fontFamily": "Consolas, 'Courier New', monospace"
  },
  ai: {
    "temperature": 0.7,
    "maxTokens": 4096
  }
}

export default function SettingsPage() {
  const [jsonConfig, setJsonConfig] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // Initial load
  useEffect(() => {
    // Simulate network delay
    const timer = setTimeout(() => {
      setJsonConfig(JSON.stringify(MOCK_CONFIG, null, 2))
      setIsLoading(false)
    }, 600)

    return () => clearTimeout(timer)
  }, [])

  // Validate JSON on change
  const handleConfigChange = (value: string) => {
    setJsonConfig(value)
    try {
      JSON.parse(value)
      setParseError(null)
    } catch (e) {
      setParseError((e as Error).message)
    }
  }

  const handleSave = async () => {
    if (parseError) {
      toast.error("Invalid Configuration", {
        description: "Please fix the JSON errors before saving.",
        icon: <AlertCircle className="h-4 w-4 text-destructive" />
      })
      return
    }

    setIsSaving(true)
    
    try {
      // Validate one last time
      const parsedConfig = JSON.parse(jsonConfig)
      
      // Simulate API call to POST /api/config
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      console.log("Saving config:", parsedConfig)
      
      toast.success("Settings Saved", {
        description: "Your configuration has been successfully updated.",
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />
      })
    } catch (e) {
      toast.error("Save Failed", {
        description: "An error occurred while saving settings.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="container max-w-5xl mx-auto py-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground text-lg">
          Manage your global configuration and preferences.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="border-border/50 shadow-sm transition-all hover:border-border/80">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <FileJson className="h-5 w-5 text-primary" />
                Configuration Editor
              </CardTitle>
              <CardDescription>
                Directly edit your <code>config.json</code> file. Changes apply immediately after saving.
              </CardDescription>
            </div>
            {isLoading && (
              <div className="flex items-center text-sm text-muted-foreground animate-pulse">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading config...
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="relative group">
              <textarea
                value={jsonConfig}
                onChange={(e) => handleConfigChange(e.target.value)}
                disabled={isLoading || isSaving}
                spellCheck={false}
                className={cn(
                  "flex min-h-[500px] w-full rounded-md border bg-muted/30 px-4 py-4 text-sm font-mono shadow-inner transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "resize-y",
                  parseError 
                    ? "border-destructive/50 focus-visible:ring-destructive/30 bg-destructive/5 text-destructive-foreground/90" 
                    : "border-input hover:border-accent-foreground/20 focus-visible:border-primary/50"
                )}
                placeholder="{ ... }"
              />
              
              {/* Parse Error Indicator Overlay */}
              {parseError && (
                <div className="absolute bottom-4 left-4 right-4 bg-destructive/10 text-destructive text-xs font-mono p-3 rounded border border-destructive/20 flex items-start gap-2 backdrop-blur-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="break-all">{parseError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-6">
              <div className="text-xs text-muted-foreground">
                <p>Use valid JSON format. Keys must be double-quoted.</p>
              </div>
              <Button 
                onClick={handleSave} 
                disabled={isLoading || isSaving || !!parseError}
                className={cn(
                  "min-w-[140px] transition-all",
                  isSaving ? "opacity-80" : "hover:shadow-md"
                )}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
