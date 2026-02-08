"use client"

import { useState, useEffect } from "react"
import { FolderOpen, ChevronDown, Check, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface Project {
  id: string
  name: string
  path: string
  lastActive: string
}

interface ProjectSelectorProps {
  currentProjectPath?: string
  onSelect: (project: Project) => void
}

export function ProjectSelector({ currentProjectPath, onSelect }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      fetch("http://localhost:5757/api/projects")
        .then(res => res.json())
        .then(data => {
          setProjects(data)
          setLoading(false)
        })
        .catch(err => {
          console.error("Failed to fetch projects:", err)
          setLoading(false)
        })
    }
  }, [isOpen])

  const currentProject = projects.find(p => p.path === currentProjectPath) || 
                         (currentProjectPath ? { name: currentProjectPath.split(/[\\/]/).pop(), path: currentProjectPath } : null)

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-2 px-3 py-1.5 h-auto font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <FolderOpen className="w-4 h-4" />
        <span className="max-w-[150px] truncate">
          {currentProject?.name || "Select Project"}
        </span>
        <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", isOpen && "rotate-180")} />
      </Button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <Card className="absolute top-full left-0 mt-2 w-72 z-50 shadow-xl border-muted animate-in fade-in zoom-in-95 duration-200">
            <CardContent className="p-2">
              <div className="text-[10px] font-bold text-muted-foreground/50 px-3 py-2 uppercase tracking-wider">
                Recent Projects
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {loading && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Loading projects...
                  </div>
                )}
                {!loading && projects.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No projects found
                  </div>
                )}
                {projects.map((project) => (
                  <button
                    key={project.id}
                    className={cn(
                      "w-full flex flex-col items-start px-3 py-2 rounded-md transition-colors text-left",
                      currentProjectPath === project.path 
                        ? "bg-primary/10 text-primary" 
                        : "hover:bg-muted"
                    )}
                    onClick={() => {
                      onSelect(project)
                      setIsOpen(false)
                    }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-medium truncate">{project.name}</span>
                      {currentProjectPath === project.path && <Check className="w-3 h-3" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate w-full mt-0.5">
                      {project.path}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[9px] text-muted-foreground/60">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(project.lastActive).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
