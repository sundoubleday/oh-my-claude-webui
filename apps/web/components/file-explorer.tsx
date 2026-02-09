"use client"

import { useState, useEffect, useCallback } from "react"
import { Folder, FileCode, ChevronRight, ChevronDown, RefreshCw, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  extension?: string
  children?: FileItem[]
}

interface FileExplorerProps {
  initialPath?: string
  onFileSelect?: (file: FileItem) => void
  onFileDrag?: (file: FileItem) => void
}

export function FileExplorer({ initialPath, onFileSelect, onFileDrag }: FileExplorerProps) {
  const [treeData, setTreeData] = useState<FileItem[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [currentPath, setCurrentPath] = useState(initialPath || "")
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  // Decode path for display
  const decodePath = useCallback((encodedPath: string): string => {
    // Convert project directory name format back to real path
    // E--Vibe-Coding-claude-code -> E:\Vibe-Coding-claude-code
    return encodedPath
      .replace(/^([A-Za-z])--/, '$1:\\')
      .replace(/--/g, '\\')
  }, [])

  // 加载文件夹内容
  const loadFolder = useCallback(async (path: string): Promise<FileItem[]> => {
    if (!path) return []
    
    try {
      const res = await fetch(`http://localhost:5757/api/files?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      return data.items || []
    } catch (e) {
      console.error('[FileExplorer] Failed to load folder:', e)
      return []
    }
  }, [])

  // 初始加载根目录
  useEffect(() => {
    if (initialPath && initialPath !== currentPath) {
      const decoded = decodePath(initialPath)
      setCurrentPath(decoded)
      setExpandedFolders(new Set([decoded]))
    }
  }, [initialPath, currentPath, decodePath])

  // 加载根目录数据
  useEffect(() => {
    if (currentPath) {
      setLoading(true)
      loadFolder(currentPath).then(items => {
        setTreeData(items)
        setLoading(false)
      })
    }
  }, [currentPath, loadFolder])

  // 展开/折叠文件夹
  const toggleFolder = async (item: FileItem) => {
    const isExpanded = expandedFolders.has(item.path)
    
    if (isExpanded) {
      // 折叠
      setExpandedFolders(prev => {
        const next = new Set(prev)
        next.delete(item.path)
        return next
      })
    } else {
      // 展开 - 加载子文件夹内容
      if (item.isDirectory && !item.children) {
        const children = await loadFolder(item.path)
        item.children = children
      }
      
      setExpandedFolders(prev => {
        const next = new Set(prev)
        next.add(item.path)
        return next
      })
    }
  }

  // 复制路径到剪贴板
  const copyPath = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      toast.success("路径已复制")
      setTimeout(() => setCopiedPath(null), 2000)
    } catch (err) {
      toast.error("复制失败")
    }
  }

  // 处理拖拽开始
  const handleDragStart = (e: React.DragEvent, item: FileItem) => {
    e.dataTransfer.setData('text/plain', item.path)
    e.dataTransfer.effectAllowed = 'copy'
    onFileDrag?.(item)
  }

  // 处理文件点击 - 自动填充 /read 命令
  const handleFileClick = (item: FileItem) => {
    if (item.isDirectory) {
      toggleFolder(item)
    } else {
      // 发送 /read 命令到聊天框
      const readCommand = `/read "${item.path}"`
      onFileSelect?.(item)
      
      // 复制到剪贴板方便粘贴
      navigator.clipboard.writeText(readCommand)
      toast.success(`已复制: ${readCommand}`)
    }
  }

  // 刷新当前目录
  const handleRefresh = async () => {
    if (!currentPath) return
    setLoading(true)
    const items = await loadFolder(currentPath)
    setTreeData(items)
    setLoading(false)
  }

  // 递归渲染树形结构
  const renderTree = (items: FileItem[], level: number = 0) => {
    return items.map((item) => {
      const isExpanded = expandedFolders.has(item.path)
      const paddingLeft = level * 12 + 8
      const isCopied = copiedPath === item.path

      return (
        <div key={item.path}>
          <div
            className={cn(
              "flex items-center gap-1 py-1 pr-2 cursor-pointer text-sm group hover:bg-accent/50 transition-colors rounded-sm",
              item.isDirectory ? "text-foreground font-medium" : "text-muted-foreground"
            )}
            style={{ paddingLeft: `${paddingLeft}px` }}
            draggable={!item.isDirectory}
            onDragStart={(e) => handleDragStart(e, item)}
            onClick={() => handleFileClick(item)}
          >
            {/* 展开/折叠图标 */}
            {item.isDirectory ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFolder(item)
                }}
                className="h-4 w-4 flex items-center justify-center hover:bg-accent rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
            ) : (
              <span className="w-4" />
            )}

            {/* 文件/文件夹图标 */}
            {item.isDirectory ? (
              isExpanded ? (
                <Folder className="h-4 w-4 text-blue-400 shrink-0" />
              ) : (
                <Folder className="h-4 w-4 text-blue-400 shrink-0 fill-blue-400/20" />
              )
            ) : (
              <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
            )}

            {/* 文件名 */}
            <span className="truncate flex-1">
              {item.name}
            </span>

            {/* 复制路径按钮 */}
            <button
              onClick={(e) => copyPath(item.path, e)}
              className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center hover:bg-accent rounded transition-opacity"
              title="复制路径"
            >
              {isCopied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </div>

          {/* 递归渲染子文件夹 */}
          {item.isDirectory && isExpanded && item.children && (
            <div className="animate-in slide-in-from-top-1 duration-150">
              {renderTree(item.children, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="flex flex-col h-full bg-muted/5 border-l border-border w-64 md:w-72 lg:w-80 shrink-0">
      {/* 头部 */}
      <div className="p-3 border-b border-border flex items-center justify-between bg-muted/10">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Files
        </span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
        </Button>
      </div>
      
      {/* 当前路径 */}
      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/20 truncate font-mono border-b border-border/50">
        {currentPath || "Select a project"}
      </div>

      {/* 树形文件列表 */}
      <div className="flex-1 overflow-y-auto p-1">
        {!currentPath && (
          <div className="text-xs text-muted-foreground text-center py-8">
            Select a project to view files
          </div>
        )}
        {currentPath && treeData.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground text-center py-8">
            No files found
          </div>
        )}
        {currentPath && renderTree(treeData)}
      </div>

      {/* 提示 */}
      <div className="p-2 text-[10px] text-muted-foreground border-t border-border/50 bg-muted/10">
        点击文件复制 /read 命令 • 拖拽到聊天框
      </div>
    </div>
  )
}
