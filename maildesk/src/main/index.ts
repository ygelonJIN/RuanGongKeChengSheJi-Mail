import { app, BrowserWindow, Menu, Tray, ipcMain, nativeTheme, shell, globalShortcut } from 'electron'
import path from 'path'
import log from 'electron-log'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray, setTrayBadge } from './tray'
import { syncAllAccounts } from './imap/sync'
import { startIdleService } from './imap/sync'
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
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建邮件',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-email')
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '收件箱',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.send('navigate', 'inbox')
        },
        { type: 'separator' },
        {
          label: '切换侧边栏',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('toggle-sidebar')
        },
        {
          label: '切换预览窗格',
          click: () => mainWindow?.webContents.send('toggle-preview')
        },
        { type: 'separator' },
        {
          label: '全屏',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen())
            }
          }
        },
        {
          label: '放大',
          accelerator: 'CmdOrCtrl+=',
          role: 'zoomIn'
        },
        {
          label: '缩小',
          accelerator: 'CmdOrCtrl+-',
          role: 'zoomOut'
        },
        {
          label: '重置缩放',
          accelerator: 'CmdOrCtrl+0',
          role: 'resetZoom'
        },
        { type: 'separator' },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: '账户',
      submenu: [
        {
          label: '添加账户...',
          click: () => mainWindow?.webContents.send('menu:add-account')
        },
        {
          label: '同步所有账户',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow?.webContents.send('menu:sync-all')
        },
        { type: 'separator' },
        {
          label: '账户设置...',
          click: () => mainWindow?.webContents.send('menu:account-settings')
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '使用手册',
          click: () => shell.openExternal('https://github.com/maildesk/docs')
        },
        {
          label: '检查更新',
          click: () => mainWindow?.webContents.send('menu:check-updates')
        },
        { type: 'separator' },
        {
          label: '关于 MailDesk',
          click: () => mainWindow?.webContents.send('menu:about')
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'MailDesk',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

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

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

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

  try {
    await initDatabase()
    log.info('Database initialized')
  } catch (err) {
    log.error('Database initialization failed:', err)
  }

  registerIpcHandlers()
  createWindow()
  createTray()
  setupTheme()
  registerGlobalShortcuts()

  // Auto-sync and start IDLE service after a short delay
  setTimeout(async () => {
    try {
      await syncAllAccounts()
      log.info('Initial sync complete')

      // Update tray badge with unread count
      const accounts = (await import('./database')).getDb()
        .prepare('SELECT id FROM accounts WHERE enabled=1').all() as any[]
      let totalUnread = 0
      for (const acc of accounts) {
        totalUnread += await getUnreadCount(acc.id)
      }
      setTrayBadge(totalUnread)
    } catch (err) {
      log.error('Auto-sync failed:', err)
    }
  }, 2000)

  // Start polling service for real-time push notifications
  setTimeout(() => {
    try {
      startIdleService()
    } catch (err) {
      log.error('Idle service failed to start:', err)
    }
  }, 10000)

  log.info('App ready')
})

function registerGlobalShortcuts() {
  // Ctrl+Alt+M: Show/hide main window
  const ret = globalShortcut.register('CommandOrControl+Alt+M', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isVisible()) {
        win.hide()
      } else {
        win.show()
        win.focus()
      }
    }
  })

  if (!ret) {
    log.warn('Global shortcut Ctrl+Alt+M registration failed')
  } else {
    log.info('Global shortcut Ctrl+Alt+M registered')
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Windows, don't quit when all windows are closed (minimize to tray)
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('before-quit', () => {
  ;(app as any).isQuitting = true
  globalShortcut.unregisterAll()
  closeDatabase()
  destroyTray()
  log.info('App quitting...')
})

export { mainWindow }
