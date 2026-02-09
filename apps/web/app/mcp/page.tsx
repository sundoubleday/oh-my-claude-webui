"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Types
interface McpConfig {
  command: string
  args: string[]
  enabled: boolean
  env?: Record<string, string>
}

interface McpServer {
  id?: string
  name: string
  config: McpConfig
}

const API_BASE = "http://localhost:5757/api/mcp"

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServer | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Form State
  const [formData, setFormData] = useState({
    name: "",
    configJson: "",
  })

  useEffect(() => {
    fetchServers()
  }, [])

  const fetchServers = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(API_BASE)
      if (!res.ok) throw new Error("Failed to fetch MCP servers")
      const data = await res.json()
      // Convert object map to array
      const serverArray = Object.entries(data).map(([name, config]) => ({
        name,
        config: config as McpConfig
      }))
      setServers(serverArray)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load servers")
    } finally {
      setIsLoading(false)
    }
  }

  // 切换启用/禁用状态
  const toggleEnabled = async (server: McpServer) => {
    const newEnabled = !server.config.enabled
    
    try {
      const res = await fetch(`${API_BASE}/${server.name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...server.config, enabled: newEnabled })
      })
      
      if (!res.ok) throw new Error("Failed to update")
      
      setServers(prev => prev.map(s => 
        s.name === server.name 
          ? { ...s, config: { ...s.config, enabled: newEnabled } }
          : s
      ))
      
      toast.success(`${server.name} ${newEnabled ? 'enabled' : 'disabled'}`)
    } catch (error) {
      toast.error("Failed to toggle server")
    }
  }

  const openAddModal = () => {
    setEditingServer(null)
    setFormData({
      name: "",
      configJson: JSON.stringify({
        command: "npx",
        args: [],
        enabled: true
      }, null, 2)
    })
    setIsModalOpen(true)
  }

  const openEditModal = (server: McpServer) => {
    setEditingServer(server)
    setFormData({
      name: server.name,
      configJson: JSON.stringify(server.config, null, 2)
    })
    setIsModalOpen(true)
  }

  const openDeleteModal = (server: McpServer) => {
    setEditingServer(server)
    setIsDeleteModalOpen(true)
  }

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error("Server name is required")
        return
      }

      const config = JSON.parse(formData.configJson)
      
      if (!config.command) throw new Error("Config must have a command")

      setIsSubmitting(true)

      if (editingServer) {
        const res = await fetch(`${API_BASE}/${editingServer.name}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || "Failed to update server")
        }
        toast.success("Server updated successfully")
      } else {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formData.name, config })
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || "Failed to add server")
        }
        toast.success("Server added successfully")
      }
      
      setIsModalOpen(false)
      fetchServers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid configuration")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (editingServer) {
      try {
        setIsSubmitting(true)
        const res = await fetch(`${API_BASE}/${editingServer.name}`, {
          method: "DELETE"
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || "Failed to delete server")
        }
        toast.success("Server deleted")
        setIsDeleteModalOpen(false)
        setEditingServer(null)
        fetchServers()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete server")
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground/90">MCP Servers</h1>
          <p className="text-muted-foreground mt-1">Manage your Model Context Protocol server configurations.</p>
        </div>
        <Button onClick={openAddModal} className="shrink-0 gap-2">
          <span className="text-lg leading-none">+</span> Add Server
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground animate-pulse">Loading MCP configurations...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {servers.map((server, index) => (
            <Card key={`${server.name}-${index}`} 
              className={cn(
                "group overflow-hidden border-border/50 hover:border-border transition-all duration-300 hover:shadow-md bg-card/50 backdrop-blur-sm",
                !server.config.enabled && "opacity-75"
              )}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1 flex-1">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    {server.name}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn(
                      "flex h-2 w-2 rounded-full",
                      server.config.enabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-400'
                    )} />
                    {server.config.enabled ? 'Active' : 'Disabled'}
                  </div>
                </div>
                
                {/* 启用/禁用按钮 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-2 text-xs",
                    server.config.enabled 
                      ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" 
                      : "text-slate-400 hover:text-slate-600"
                  )}
                  onClick={() => toggleEnabled(server)}
                >
                  {server.config.enabled ? 'ON' : 'OFF'}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-muted/50 p-3 font-mono text-xs text-muted-foreground break-all border border-border/50">
                  <div className="flex items-center gap-2 mb-1 opacity-70">
                    <span className="text-lg">⌘</span>
                    <span className="font-semibold uppercase tracking-wider text-[10px]">Command</span>
                  </div>
                  {server.config.command} {server.config.args.join(" ")}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditModal(server)}>
                  <span className="text-sm">✎</span>
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => openDeleteModal(server)}>
                  <span className="text-sm">🗑</span>
                </Button>
              </CardFooter>
            </Card>
          ))}

          {/* Empty State */}
          {servers.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed rounded-xl bg-muted/10">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4 text-2xl">
                ⌘
              </div>
              <h3 className="text-lg font-semibold">No MCP servers configured</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Add your first MCP server to start extending Claude&apos;s capabilities with local tools and resources.
              </p>
              <Button onClick={openAddModal} variant="outline" className="mt-6">
                <span className="mr-2 text-lg">+</span> Add Server
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Edit/Add Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-xl border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editingServer ? 'Edit Server' : 'Add New Server'}</h2>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsModalOpen(false)}>
                  <span className="text-lg">×</span>
                </Button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Server Name</label>
                  <Input 
                    value={formData.name} 
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. filesystem"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Configuration (JSON)</label>
                  <textarea 
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                    value={formData.configJson}
                    onChange={(e) => setFormData({...formData, configJson: e.target.value})}
                    spellCheck={false}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Delete Server?</h2>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete <span className="font-semibold text-foreground">{editingServer?.name}</span>? This action cannot be undone.
                </p>
              </div>
              
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDelete}>Delete Server</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
