import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  
  // App version
  getVersion: () => ipcRenderer.invoke('get-version'),
  
  // Window controls (if using custom titlebar)
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // File dialogs
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters?: { name: string; extensions: string[] }[]) => 
    ipcRenderer.invoke('select-file', filters),
  
  // Shell operations
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path),
  
  // Notifications
  onNotification: (callback: (message: string) => void) => {
    ipcRenderer.on('notification', (_, message) => callback(message))
  },
})

// Type declarations for TypeScript
declare global {
  interface Window {
    electronAPI: {
      platform: NodeJS.Platform
      getVersion: () => Promise<string>
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      selectDirectory: () => Promise<string | null>
      selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
      openExternal: (url: string) => Promise<void>
      showItemInFolder: (path: string) => Promise<void>
      onNotification: (callback: (message: string) => void) => void
    }
  }
}
