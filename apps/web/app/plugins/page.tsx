"use client"

import { useState, useEffect } from "react"
import { Trash2, Package, AlertTriangle, Calendar, Clock, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface Plugin {
  name: string
  version: string
  installPath: string
  installedAt: string
  description?: string
}

const API_BASE = "http://localhost:5757/api/plugins"

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [pluginToDelete, setPluginToDelete] = useState<Plugin | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchPlugins()
  }, [])

  const fetchPlugins = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(API_BASE)
      if (!res.ok) throw new Error("Failed to fetch plugins")
      const data = await res.json()
      setPlugins(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load plugins")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteClick = (plugin: Plugin) => {
    setPluginToDelete(plugin)
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (pluginToDelete) {
      setIsSubmitting(true)
      try {
        const res = await fetch(`${API_BASE}/${pluginToDelete.name}`, {
          method: "DELETE"
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || "Failed to uninstall plugin")
        }

        setShowDeleteModal(false)
        setPluginToDelete(null)
        toast.success(`Plugin "${pluginToDelete.name}" uninstalled`)
        fetchPlugins() // Refresh list
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to uninstall plugin")
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return "Unknown date"
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Plugins</h1>
          <p className="text-muted-foreground mt-1">
            Manage installed plugins to extend system capabilities.
          </p>
        </div>
      </div>

      {/* Plugins Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading plugins...</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plugins.map((plugin, index) => (
            <Card key={`${plugin.name}-${index}`} className="group relative overflow-hidden transition-all hover:shadow-md border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary/80" />
                      {plugin.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
                        v{plugin.version}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDeleteClick(plugin)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Uninstall plugin</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="line-clamp-2 min-h-[40px] mb-4">
                  {plugin.description || "No description provided."}
                </CardDescription>
                
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>Installed {formatDate(plugin.installedAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-secondary/50 p-2 rounded-md font-mono truncate" title={plugin.installPath}>
                    <span className="truncate">{plugin.installPath}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Empty State */}
          {plugins.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed rounded-lg bg-secondary/10">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary mb-4">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No plugins installed</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Your plugin list is empty. Install plugins to see them here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md mx-4 bg-background rounded-xl shadow-2xl border animate-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">Uninstall Plugin?</h3>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to uninstall <span className="font-medium text-foreground">{pluginToDelete?.name}</span>? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Uninstall
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
