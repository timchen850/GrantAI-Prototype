const { app, BrowserWindow, ipcMain, shell, Menu, nativeTheme } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
  })

  // Graceful show
  win.once('ready-to-show', () => {
    win.show()
    if (isDev) win.webContents.openDevTools({ mode: 'detach' })
  })

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

// Build the app menu
function buildMenu() {
  const template = [
    {
      label: 'Grange AI',
      submenu: [
        { role: 'about', label: 'About Grange AI' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Grange AI' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Grange AI' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// IPC handlers
ipcMain.handle('get-platform', () => process.platform)
ipcMain.handle('get-version', () => app.getVersion())
ipcMain.handle('open-external', (_, url) => shell.openExternal(url))

// Opens a child window for Google OAuth and returns the final callback URL.
// Supabase redirects to http://localhost:3000/auth/callback?code=xxx after OAuth.
// We intercept that navigation before the browser tries to connect to localhost.
ipcMain.handle('open-oauth-window', (_, oauthUrl) => {
  return new Promise((resolve) => {
    const parent = BrowserWindow.getAllWindows()[0]
    const authWin = new BrowserWindow({
      width: 520,
      height: 680,
      parent,
      modal: true,
      show: false,
      title: 'Sign in with Google',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    authWin.once('ready-to-show', () => authWin.show())

    let resolved = false
    function finish(url) {
      if (resolved) return
      resolved = true
      resolve(url)
      setImmediate(() => { if (!authWin.isDestroyed()) authWin.destroy() })
    }

    function checkUrl(url) {
      if (url && url.startsWith('http://localhost:3000')) {
        finish(url)
        return true
      }
      return false
    }

    // Catch HTTP-level redirects (the Supabase→localhost redirect is a 302)
    authWin.webContents.on('did-redirect-navigation', (_, url) => checkUrl(url))
    // Catch JS-initiated navigations
    authWin.webContents.on('will-navigate', (e, url) => {
      if (checkUrl(url)) e.preventDefault()
    })
    // Catch completed navigations as fallback
    authWin.webContents.on('did-navigate', (_, url) => checkUrl(url))

    authWin.on('closed', () => finish(null))
    authWin.loadURL(oauthUrl)
  })
})
