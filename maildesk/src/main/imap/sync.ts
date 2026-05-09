import log from 'electron-log'
import { getDb, saveDatabase } from '../database'
import { connectImap, fetchFolderList, syncEmails } from './client'
import { BrowserWindow, Notification } from 'electron'

const syncingAccounts = new Set<number>()
let idleIntervals: Map<number, NodeJS.Timeout> = new Map()

export async function syncAccount(accountId: number, onProgress?: (p: any) => void): Promise<void> {
  if (syncingAccounts.has(accountId)) {
    log.info(`Account ${accountId} sync already in progress, skipping`)
    return
  }
  syncingAccounts.add(accountId)

  const db = getDb()
  const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId) as any

  if (!account) {
    syncingAccounts.delete(accountId)
    log.error(`Account ${accountId} not found`)
    return
  }

  const win = BrowserWindow.getAllWindows()[0]

  try {
    win?.webContents.send('account:sync-start', accountId)
    log.info(`Starting sync for account: ${account.email}`)

    const imap = await connectImap(account)

    await fetchFolderList(imap, accountId)

    const folders = db.prepare('SELECT * FROM folders WHERE account_id=? AND subscribed=1').all(accountId) as any[]

    let totalSynced = 0
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i]
      if (onProgress) {
        onProgress({ accountId, folder: folder.name, progress: Math.round((i / folders.length) * 100) })
      }
      try {
        const count = await syncEmails(imap, accountId, folder.id)
        totalSynced += count
      } catch (e) {
        log.error(`Failed to sync folder ${folder.name}:`, e)
      }
    }

    db.prepare('UPDATE accounts SET last_sync_at=unixepoch() WHERE id=?').run(accountId)
    saveDatabase()

    imap.end()

    win?.webContents.send('account:sync-complete', { accountId, totalSynced })
    log.info(`Sync complete for ${account.email}: ${totalSynced} emails`)
  } catch (err: any) {
    log.error(`Sync failed for ${account.email}:`, err)
    win?.webContents.send('account:sync-error', { accountId, error: err.message })
  } finally {
    syncingAccounts.delete(accountId)
  }
}

export async function syncAllAccounts(onProgress?: (p: any) => void): Promise<void> {
  const db = getDb()
  const accounts = db.prepare('SELECT * FROM accounts WHERE enabled=1').all() as any[]

  for (const account of accounts) {
    await syncAccount(account.id, onProgress)
  }
}

export function startIdleService(): void {
  const db = getDb()
  const accounts = db.prepare('SELECT * FROM accounts WHERE enabled=1').all() as any[]

  // Use periodic polling instead of IMAP IDLE (imap v0.8.x doesn't support IDLE natively)
  // Poll every 60 seconds as a lightweight real-time check
  for (const account of accounts) {
    const interval = setInterval(async () => {
      try {
        const settings = db.prepare("SELECT value FROM settings WHERE key='auto_sync'").get() as any
        if (settings?.value !== 'true') return

        const lastSync = account.last_sync_at ? (Date.now() / 1000 - account.last_sync_at) : Infinity
        if (lastSync < 30) return // Don't sync too frequently

        await syncAccount(account.id)
      } catch (err) {
        log.error(`Polling sync failed for ${account.email}:`, err)
      }
    }, 60000)

    idleIntervals.set(account.id, interval)
    log.info(`Polling service started for ${account.email} (every 60s)`)
  }
}

export function stopIdleService(): void {
  for (const interval of idleIntervals.values()) {
    clearInterval(interval)
  }
  idleIntervals.clear()
  log.info('Idle service stopped')
}

export function stopAccountIdle(accountId: number): void {
  const interval = idleIntervals.get(accountId)
  if (interval) {
    clearInterval(interval)
    idleIntervals.delete(accountId)
    log.info(`Idle polling stopped for account ${accountId}`)
  }
}

function showNewMailNotification(accountId: number): void {
  const db = getDb()
  const email = db.prepare(`
    SELECT e.*, a.email as account_email
    FROM emails e JOIN accounts a ON e.account_id = a.id
    WHERE e.account_id=? AND e.is_read=0 AND e.date > unixepoch()-300
    ORDER BY e.date DESC LIMIT 1
  `).get(accountId) as any

  if (!email) return

  const settings = db.prepare("SELECT value FROM settings WHERE key='notification_enabled'").get() as any
  if (settings?.value === 'false') return

  const dndSettings = db.prepare("SELECT value FROM settings WHERE key='dnd_enabled'").get() as any
  if (dndSettings?.value === 'true') return

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: `新邮件: ${email.from_name || email.from_email}`,
      body: `${email.subject}\n${email.snippet || ''}`.substring(0, 100),
      silent: false,
    })

    notification.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.show()
        win.focus()
        win.webContents.send('navigate', { type: 'email', id: email.id })
      }
    })

    notification.show()
  }
}
