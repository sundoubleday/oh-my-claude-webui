"use client"

import { useState } from "react"
import { Plus, Trash2, Folder, X, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface Skill {
  id: string
  name: string
  description: string
  path: string
}

const MOCK_SKILLS: Skill[] = [
  {
    id: "1",
    name: "notebooklm",
    description: "Automate Google NotebookLM",
    path: "~/.claude/skills/notebooklm"
  },
  {
    id: "2",
    name: "browser-automation",
    description: "Headless browser control via Playwright",
    path: "~/.claude/skills/browser"
  }
]

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>(MOCK_SKILLS)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [skillToDelete, setSkillToDelete] = useState<Skill | null>(null)
  const [newSkillPath, setNewSkillPath] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAddSkill = () => {
    if (!newSkillPath.trim()) {
      toast.error("Please enter a valid path")
      return
    }

    setIsSubmitting(true)

    // Simulate API delay
    setTimeout(() => {
      const name = newSkillPath.split("/").pop() || "unknown-skill"
      const newSkill: Skill = {
        id: Math.random().toString(36).substr(2, 9),
        name: name,
        description: "Imported from local file system",
        path: newSkillPath
      }

      setSkills([...skills, newSkill])
      setNewSkillPath("")
      setShowAddModal(false)
      setIsSubmitting(false)
      toast.success("Skill added successfully")
    }, 500)
  }

  const handleDeleteClick = (skill: Skill) => {
    setSkillToDelete(skill)
    setShowDeleteModal(true)
  }

  const confirmDelete = () => {
    if (skillToDelete) {
      setSkills(skills.filter(s => s.id !== skillToDelete.id))
      setShowDeleteModal(false)
      setSkillToDelete(null)
      toast.success("Skill deleted")
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Skills</h1>
          <p className="text-muted-foreground mt-1">
            Manage your local AI skills and capabilities.
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Skill
        </Button>
      </div>

      {/* Skills Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => (
          <Card key={skill.id} className="group relative overflow-hidden transition-all hover:shadow-md border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    {skill.name}
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDeleteClick(skill)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete skill</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="line-clamp-2 min-h-[40px]">
                {skill.description}
              </CardDescription>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 p-2 rounded-md font-mono truncate">
                <Folder className="h-3 w-3 shrink-0" />
                <span className="truncate" title={skill.path}>{skill.path}</span>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Empty State */}
        {skills.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed rounded-lg bg-secondary/10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary mb-4">
              <Folder className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No skills found</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
              Add a skill by pointing to a directory containing a valid skill configuration.
            </p>
          </div>
        )}
      </div>

      {/* Custom Add Modal (Simulating Dialog) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg mx-4 bg-background rounded-xl shadow-2xl border animate-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Add New Skill</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowAddModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="path" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Skill Directory Path
              </label>
              <Input
                id="path"
                placeholder="/path/to/your/skill"
                value={newSkillPath}
                onChange={(e) => setNewSkillPath(e.target.value)}
                autoFocus
              />
              <p className="text-[0.8rem] text-muted-foreground">
                Enter the absolute path to the skill directory.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddSkill} disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Skill"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Modal (Simulating AlertDialog) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md mx-4 bg-background rounded-xl shadow-2xl border animate-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">Delete Skill?</h3>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to remove <span className="font-medium text-foreground">{skillToDelete?.name}</span>? This action removes it from the list but keeps files on disk.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
