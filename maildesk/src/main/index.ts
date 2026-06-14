import { app, BrowserWindow, Menu, shell, nativeTheme, globalShortcut } from 'electron'
import path from 'path'
import log from 'electron-log'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray, setTrayBadge } from './tray'
import { syncAllAccounts } from './imap/sync'
import { getUnreadCount } from './imap/client'

log.transports.file.level = 'info'
log.transports.file.maxSize = 10 * 1024 * 1024
log.errorHandler.startCatching()

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error)
  app.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason)
})

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let mainWindow: BrowserWindow | null = null

function createMenu() {
  Menu.setApplicationMenu(null)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'MailDesk',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    log.info('Main window ready to show')
  })

  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (VITE_DEV_SERVER_URL) mainWindow.loadURL(VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))

  createMenu()
  return mainWindow
}

function setupTheme() {
  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  })
}

app.whenReady().then(async () => {
  log.info('App starting...')
  try { await initDatabase(); log.info('Database initialized') } catch (err) { log.error('Database initialization failed:', err) }
  registerIpcHandlers(); createWindow(); createTray(); setupTheme(); registerGlobalShortcuts()
  log.info('App ready')
})

function registerGlobalShortcuts() {
  const ret = globalShortcut.register('CommandOrControl+Alt+M', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isVisible()) win.hide()
      else { win.show(); win.focus() }
    }
  })
  if (!ret) log.warn('Global shortcut Ctrl+Alt+M registration failed')
  else log.info('Global shortcut Ctrl+Alt+M registered')
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // keep running in tray
  }
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

app.on('before-quit', () => {
  ;(app as any).isQuitting = true
  globalShortcut.unregisterAll()
  closeDatabase()
  destroyTray()
  log.info('App quitting...')
})

export { mainWindow }
