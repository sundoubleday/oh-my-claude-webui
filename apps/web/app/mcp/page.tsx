"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

// Types
interface McpConfig {
  command: string
  args: string[]
  enabled: boolean
  env?: Record<string, string>
}

interface McpServer {
  id: string // Adding ID for easier management
  name: string
  config: McpConfig
}

// Initial Mock Data
const INITIAL_SERVERS: McpServer[] = [
  {
    id: "1",
    name: "filesystem",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      enabled: true,
    },
  },
  {
    id: "2",
    name: "github-search",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      enabled: false,
      env: {
        GITHUB_TOKEN: "sk-...",
      },
    },
  },
]

// Icons
const Icons = {
  Plus: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
  ),
  Edit: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
  ),
  Trash: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
  ),
  Terminal: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
  ),
  Check: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  X: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  ),
}

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>(INITIAL_SERVERS)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServer | null>(null)
  
  // Form State
  const [formData, setFormData] = useState({
    name: "",
    configJson: "",
  })

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

  const handleSave = () => {
    try {
      if (!formData.name.trim()) {
        toast.error("Server name is required")
        return
      }

      const config = JSON.parse(formData.configJson)
      
      // Basic validation
      if (!config.command) throw new Error("Config must have a command")

      if (editingServer) {
        // Edit
        setServers(prev => prev.map(s => 
          s.id === editingServer.id 
            ? { ...s, name: formData.name, config } 
            : s
        ))
        toast.success("Server updated successfully")
      } else {
        // Add
        const newServer: McpServer = {
          id: Date.now().toString(),
          name: formData.name,
          config: config
        }
        setServers(prev => [...prev, newServer])
        toast.success("Server added successfully")
      }
      setIsModalOpen(false)
    } catch (e) {
      toast.error("Invalid JSON configuration")
    }
  }

  const handleDelete = () => {
    if (editingServer) {
      setServers(prev => prev.filter(s => s.id !== editingServer.id))
      toast.success("Server deleted")
      setIsDeleteModalOpen(false)
      setEditingServer(null)
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
          <Icons.Plus /> Add Server
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {servers.map((server) => (
          <Card key={server.id} className="group overflow-hidden border-border/50 hover:border-border transition-all duration-300 hover:shadow-md bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  {server.name}
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`flex h-2 w-2 rounded-full ${server.config.enabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-400'}`} />
                  {server.config.enabled ? 'Active' : 'Disabled'}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-muted/50 p-3 font-mono text-xs text-muted-foreground break-all border border-border/50">
                <div className="flex items-center gap-2 mb-1 opacity-70">
                  <Icons.Terminal />
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Command</span>
                </div>
                {server.config.command} {server.config.args.join(" ")}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditModal(server)}>
                <Icons.Edit />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => openDeleteModal(server)}>
                <Icons.Trash />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Edit/Add Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-xl border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editingServer ? 'Edit Server' : 'Add New Server'}</h2>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsModalOpen(false)}>
                  <Icons.X />
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
