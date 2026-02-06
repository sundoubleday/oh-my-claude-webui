"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

export default function Home() {
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">oh-my-claude-webui</h1>
      
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>组件测试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => toast.success("按钮点击成功！")}>
              测试按钮
            </Button>
            <Input placeholder="测试输入框" />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
