"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"
import { AlertCircle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

interface Props {
  children?: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <Card className="max-w-md w-full border-destructive/20 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertCircle className="h-6 w-6" />
                <CardTitle>Something went wrong</CardTitle>
              </div>
              <CardDescription>
                An unexpected error occurred in the application.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-destructive/5 p-4 rounded-md border border-destructive/10">
                <p className="text-xs font-mono text-destructive break-all">
                  {this.state.error?.message || "Unknown error"}
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={this.handleReset}
                variant="outline"
                className="w-full gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reload Application
              </Button>
            </CardFooter>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
