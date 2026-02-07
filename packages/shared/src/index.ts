// Shared types and utilities for oh-my-claude-webui

export interface SessionMetadata {
  model: string
  permissionMode: string
  claudeCodeVersion: string
  slashCommands: string[]
  skills: string[]
  agents: string[]
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
export type ProcessingStatus = 'idle' | 'processing'
