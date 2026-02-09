"use client"

import Link from "next/link"
import { 
  MessageSquarePlus, 
  History, 
  Settings,
  Terminal,
  ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  return (
    <div className="h-full p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">欢迎</h1>
        <p className="text-muted-foreground mt-2">
          选择以下选项开始与 Claude 对话
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Link href="/chat?session=new">
          <Card className="cursor-pointer hover:bg-accent transition-colors h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-md bg-primary/10">
                  <MessageSquarePlus className="h-5 w-5 text-primary" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-lg mt-4">新建对话</CardTitle>
              <CardDescription>
                开始一个新的 Claude 会话
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/history">
          <Card className="cursor-pointer hover:bg-accent transition-colors h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-md bg-muted">
                  <History className="h-5 w-5 text-muted-foreground" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-lg mt-4">历史记录</CardTitle>
              <CardDescription>
                查看和管理之前的对话
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/settings">
          <Card className="cursor-pointer hover:bg-accent transition-colors h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-md bg-muted">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-lg mt-4">设置</CardTitle>
              <CardDescription>
                配置 MCP 服务器和其他选项
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* Info Section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">快速开始</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            点击左侧侧边栏的 &quot;New Chat&quot; 或上方的 &quot;新建对话&quot; 卡片开始与 Claude 对话。
          </p>
          <div className="flex gap-2">
            <Link href="/chat?session=new">
              <Button size="sm">
                <MessageSquarePlus className="h-4 w-4 mr-2" />
                开始对话
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
