"use client"

import { useState, useEffect } from "react"
import { Folder, FileCode, ChevronRight, ChevronDown, RefreshCw, File } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  extension?: string
}

interface FileExplorerProps {
  initialPath?: string
  onFileSelect?: (file: FileItem) => void
}

export function FileExplorer({ initialPath, onFileSelect }: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || "")
  const [items, setItems] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])

  const loadFiles = async (path: string) => {
    setLoading(true)
    try {
      const res = await fetch(`http://localhost:5757/api/files?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (data.items) {
        setItems(data.items)
        setCurrentPath(data.path) // Update to resolved path
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Update currentPath when initialPath changes (project switch)
  useEffect(() => {
    if (initialPath && initialPath !== currentPath) {
      setCurrentPath(initialPath)
      setHistory([]) // Clear history on project switch
    }
  }, [initialPath])

  // Load files when currentPath changes
  useEffect(() => {
    loadFiles(currentPath)
  }, [currentPath])

  const handleNavigate = (path: string) => {
    setHistory(prev => [...prev, currentPath])
    loadFiles(path)
  }

  const handleBack = () => {
    const prev = history[history.length - 1]
    if (prev) {
      setHistory(h => h.slice(0, -1))
      loadFiles(prev)
    } else {
        // Go up one level logic if no history
        // Simple hack: split by separator and pop
        // But for now, history stack is safer
    }
  }

  return (
    <div className="flex flex-col h-full bg-muted/5 border-l border-border w-64 md:w-72 lg:w-80 shrink-0">
      <div className="p-3 border-b border-border flex items-center justify-between bg-muted/10">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Files
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => loadFiles(currentPath)}>
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
        </Button>
      </div>
      
      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/20 truncate font-mono border-b border-border/50 flex items-center gap-2">
        <button onClick={handleBack} disabled={history.length === 0} className="hover:text-foreground disabled:opacity-30">
           ←
        </button>
        <span title={currentPath}>{currentPath || "Home"}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {items.map((item) => (
          <div
            key={item.path}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-sm group hover:bg-accent/50 transition-colors",
              item.isDirectory ? "text-foreground" : "text-muted-foreground"
            )}
            onClick={() => {
              if (item.isDirectory) {
                handleNavigate(item.path)
              } else {
                onFileSelect?.(item)
              }
            }}
          >
            {item.isDirectory ? (
              <Folder className="w-4 h-4 text-blue-400 shrink-0 fill-blue-400/20" />
            ) : (
              <FileCode className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <span className="truncate">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
