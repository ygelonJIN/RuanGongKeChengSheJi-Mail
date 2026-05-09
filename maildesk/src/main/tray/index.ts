import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import path from 'path'
import log from 'electron-log'

let tray: Tray | null = null

export function createTray(): Tray {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')

  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('MailDesk - 邮件客户端')

  updateTrayMenu()

  tray.on('click', () => {
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

  tray.on('double-click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.show()
      win.focus()
    }
  })

  log.info('System tray created')
  return tray
}

export function updateTrayMenu(unreadCount?: number): void {
  if (!tray) return

  const tooltip = unreadCount && unreadCount > 0
    ? `MailDesk - ${unreadCount} 封未读邮件`
    : 'MailDesk - 邮件客户端'

  tray.setToolTip(tooltip)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: unreadCount && unreadCount > 0 ? `MailDesk (${unreadCount} 封未读)` : 'MailDesk',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '打开 MailDesk',
      click: () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          win.show()
          win.focus()
        }
      },
    },
    {
      label: '新建邮件',
      click: () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          win.show()
          win.focus()
          win.webContents.send('menu:new-email')
        }
      },
    },
    {
      label: '同步所有账户',
      click: () => {
        const win = BrowserWindow.getAllWindows()[0]
        win?.webContents.send('menu:sync-all')
      },
    },
    { type: 'separator' },
    {
      label: '勿扰模式',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        const win = BrowserWindow.getAllWindows()[0]
        win?.webContents.send('toggle-dnd', menuItem.checked)
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        (app as any).isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
    log.info('System tray destroyed')
  }
}

export function setTrayBadge(count: number): void {
  updateTrayMenu(count)
}
