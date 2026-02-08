import { app, BrowserWindow, shell } from 'electron'
import { spawn, ChildProcess, execSync } from 'child_process'
import * as path from 'path'
import * as net from 'net'
import * as fs from 'fs'

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null
let serverPort: number = 3000
let backendPort: number = 5757

// Check if we're in development mode
const isDev = !app.isPackaged

// Get available port
function getPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        reject(new Error('Failed to get port'))
      }
    })
    server.on('error', reject)
  })
}

// Load user's shell environment (Windows version)
function loadUserEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  
  // On Windows, try to get PATH from user environment
  try {
    // Add common npm/node paths
    const userProfile = process.env.USERPROFILE || ''
    const additionalPaths = [
      path.join(userProfile, 'AppData', 'Roaming', 'npm'),
      path.join(userProfile, '.bun', 'bin'),
      path.join(userProfile, 'AppData', 'Local', 'pnpm'),
    ].filter(p => fs.existsSync(p))
    
    if (additionalPaths.length > 0) {
      env.PATH = `${additionalPaths.join(path.delimiter)}${path.delimiter}${env.PATH || ''}`
    }
  } catch (error) {
    console.error('Failed to load user environment:', error)
  }
  
  return env
}

// Start the Next.js server
async function startServer(): Promise<void> {
  if (isDev) {
    // In development, servers should already be running via `bun run dev`
    console.log('Development mode: assuming servers are already running')
    return
  }
  
  try {
    // Get available ports
    serverPort = await getPort()
    backendPort = await getPort()
    
    console.log(`Starting servers on ports: frontend=${serverPort}, backend=${backendPort}`)
    
    const userEnv = loadUserEnv()
    
    // Path to the standalone server
    const serverPath = path.join(app.getAppPath(), 'server', 'server.js')
    const backendPath = path.join(app.getAppPath(), 'backend', 'index.js')
    
    // Start Next.js server
    const nodePath = process.execPath // Use Electron's Node.js
    
    serverProcess = spawn(nodePath, [serverPath], {
      env: {
        ...userEnv,
        PORT: String(serverPort),
        BACKEND_PORT: String(backendPort),
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
      windowsHide: true, // Hide console window on Windows
    })
    
    serverProcess.stdout?.on('data', (data) => {
      console.log(`[Server] ${data}`)
    })
    
    serverProcess.stderr?.on('data', (data) => {
      console.error(`[Server Error] ${data}`)
    })
    
    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error)
    })
    
    serverProcess.on('exit', (code) => {
      console.log(`Server exited with code ${code}`)
    })
    
    // Wait for server to be ready
    await waitForServer(serverPort)
    console.log('Server is ready!')
    
  } catch (error) {
    console.error('Failed to start server:', error)
    throw error
  }
}

// Wait for server to be ready
function waitForServer(port: number, maxAttempts: number = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    
    const checkServer = () => {
      attempts++
      
      const socket = new net.Socket()
      socket.setTimeout(1000)
      
      socket.on('connect', () => {
        socket.destroy()
        resolve()
      })
      
      socket.on('error', () => {
        socket.destroy()
        if (attempts >= maxAttempts) {
          reject(new Error(`Server failed to start after ${maxAttempts} attempts`))
        } else {
          setTimeout(checkServer, 500)
        }
      })
      
      socket.on('timeout', () => {
        socket.destroy()
        if (attempts >= maxAttempts) {
          reject(new Error(`Server timeout after ${maxAttempts} attempts`))
        } else {
          setTimeout(checkServer, 500)
        }
      })
      
      socket.connect(port, '127.0.0.1')
    }
    
    checkServer()
  })
}

// Create the browser window
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Oh My Claude',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    // Windows specific
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#1a1a1a',
    show: false, // Don't show until ready
  })
  
  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
  
  // Load the app
  const url = isDev 
    ? 'http://localhost:3000' 
    : `http://localhost:${serverPort}`
  
  console.log(`Loading URL: ${url}`)
  mainWindow.loadURL(url)
  
  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  
  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }
  
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    await startServer()
    createWindow()
  } catch (error) {
    console.error('Failed to start application:', error)
    app.quit()
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, apps typically stay open until Cmd+Q
  // On Windows/Linux, quit when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Clean up server process
  if (serverProcess) {
    console.log('Stopping server...')
    serverProcess.kill()
    serverProcess = null
  }
})

// Handle certificate errors (for local development)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (url.startsWith('https://localhost')) {
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})
