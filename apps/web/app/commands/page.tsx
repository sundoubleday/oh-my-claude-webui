"use client"

import React, { useState, useEffect } from "react"
import { Plus, Terminal, Trash2, Edit2, Save, X, Search, Command as CommandIcon, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

// Types
interface Command {
  name: string
  description: string
  content: string
  path: string
}

const API_BASE = "http://localhost:5757/api/commands"

export default function CommandsPage() {
  const [commands, setCommands] = useState<Command[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState<Command | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    content: ""
  })

  useEffect(() => {
    fetchCommands()
  }, [])

  const fetchCommands = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(API_BASE)
      if (!res.ok) throw new Error("Failed to fetch commands")
      const data = await res.json()
      setCommands(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load commands")
    } finally {
      setIsLoading(false)
    }
  }

  // Filter commands
  const filteredCommands = commands.filter(cmd => 
    cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cmd.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Handlers
  const handleEdit = (command: Command) => {
    setEditingCommand(command)
    setFormData({
      name: command.name,
      content: command.content
    })
    setIsModalOpen(true)
  }

  const handleAddNew = () => {
    setEditingCommand(null)
    setFormData({
      name: "",
      content: "# New Command\n\nDescribe your command logic here..."
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (name: string) => {
    setIsSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/${name}`, {
        method: "DELETE"
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to delete command")
      }

      setDeleteConfirmation(null)
      toast.success("Command deleted successfully")
      fetchCommands()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete command")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Command name is required")
      return
    }

    setIsSubmitting(true)

    try {
      if (editingCommand) {
        // Update existing
        const res = await fetch(`${API_BASE}/${editingCommand.name}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: formData.content })
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || "Failed to update command")
        }

        toast.success(`Command '${formData.name}' updated`)
      } else {
        // Create new
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formData.name, content: formData.content })
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || "Failed to create command")
        }

        toast.success(`Command '${formData.name}' created`)
      }
      setIsModalOpen(false)
      fetchCommands()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save command")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Terminal className="w-8 h-8 text-primary" />
            Command Center
          </h1>
          <p className="text-muted-foreground">
            Manage your custom execution protocols and automation scripts.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search commands..." 
              className="pl-9 bg-background/50"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button onClick={handleAddNew} className="shrink-0 gap-2">
            <Plus className="w-4 h-4" />
            New Command
          </Button>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading commands...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCommands.map((command, index) => (
            <Card key={`${command.name}-${index}`} className="group relative flex flex-col transition-all duration-300 hover:shadow-lg hover:border-primary/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="font-mono text-lg text-primary truncate flex items-center gap-2">
                    <CommandIcon className="w-4 h-4 opacity-70" />
                    /{command.name}
                  </CardTitle>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleEdit(command)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteConfirmation(command.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="bg-muted/50 p-3 rounded-md text-xs font-mono h-32 overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-muted/90 pointer-events-none" />
                  <pre className="whitespace-pre-wrap text-muted-foreground break-all">
                    {command.content}
                  </pre>
                </div>
                <p className="mt-2 text-xs text-muted-foreground truncate" title={command.path}>
                  {command.path}
                </p>
              </CardContent>
            </Card>
          ))}

          {filteredCommands.length === 0 && (
            <div className="col-span-full py-20 text-center text-muted-foreground border-2 border-dashed rounded-lg">
              <Terminal className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No commands found.</p>
              {!searchQuery && (
                <Button onClick={handleAddNew} variant="outline" className="mt-4">
                  Create First Command
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {filteredCommands.length === 0 && (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
          <Terminal className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No commands found matching your search.</p>
        </div>
      )}

      {/* Edit/Add Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl animate-in zoom-in-95 duration-200">
            <Card className="shadow-2xl border-primary/20">
              <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
                <CardTitle className="text-xl flex items-center gap-2">
                  {editingCommand ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  {editingCommand ? 'Edit Command' : 'New Command'}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Command Name
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">/</span>
                    <Input
                      value={formData.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. analyze"
                      className="pl-7 font-mono"
                      readOnly={!!editingCommand} // Readonly name when editing to mimic filesystem safety
                    />
                  </div>
                  {editingCommand && (
                    <p className="text-xs text-muted-foreground">Command names cannot be changed after creation.</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">
                    Implementation (Markdown)
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, content: e.target.value })}
                    className="flex min-h-[300px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-none"
                    placeholder="# Command implementation..."
                    spellCheck={false}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t px-6 py-4 bg-muted/20">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} className="gap-2">
                  <Save className="w-4 h-4" />
                  Save Command
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md animate-in zoom-in-95 duration-200">
            <Card className="border-destructive/50 shadow-2xl">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Confirm Deletion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>Are you sure you want to delete this command? This action cannot be undone.</p>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 bg-destructive/5 rounded-b-lg">
                <Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => deleteConfirmation && handleDelete(deleteConfirmation)}>
                  Delete Command
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
