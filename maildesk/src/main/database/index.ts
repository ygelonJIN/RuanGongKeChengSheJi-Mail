import initSqlJs from 'sql.js'
import type { SqlJsStatic } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import log from 'electron-log'

let db: any = null
let dbPath: string = ''

export function getDb(): any {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

function augmentDatabase(database: any): void {
  const originalRun = database.run.bind(database)
  const originalPrepare = database.prepare.bind(database)

  database.run = function(sql: string, ...args: any[]) {
    if (args.length > 0) {
      const stmt = originalPrepare(sql)
      stmt.bind(args)
      stmt.step()
      stmt.free()
    } else {
      originalRun(sql)
    }
  }

  database.prepare = function(sql: string) {
    return {
      run: (...params: unknown[]) => {
        const stmt = originalPrepare(sql)
        if (params.length > 0) {
          stmt.bind(params as any)
        }
        stmt.step()
        stmt.free()
        const lastIdResult = database.exec('SELECT last_insert_rowid() as id')
        const lastInsertRowid = lastIdResult[0]?.values[0]?.[0] ?? 0
        const changes = database.getRowsModified()
        return { lastInsertRowid, changes }
      },
      get: (...params: unknown[]) => {
        const stmt = originalPrepare(sql)
        if (params.length > 0) {
          stmt.bind(params as any)
        }
        if (stmt.step()) {
          const row = stmt.getAsObject()
          stmt.free()
          return row
        }
        stmt.free()
        return undefined
      },
      all: (...params: unknown[]) => {
        const results: unknown[] = []
        const stmt = originalPrepare(sql)
        if (params.length > 0) {
          stmt.bind(params as any)
        }
        while (stmt.step()) {
          results.push(stmt.getAsObject())
        }
        stmt.free()
        return results
      }
    }
  }
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData')
  dbPath = path.join(userDataPath, 'maildesk.db')
  log.info(`Database path: ${dbPath}`)

  const SqlJs: SqlJsStatic = await initSqlJs()

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SqlJs.Database(fileBuffer)
    log.info('Database loaded from disk')
  } else {
    db = new SqlJs.Database()
    log.info('New database created')
  }

  augmentDatabase(db)
  runMigrations()
  insertDefaultSettings()
  saveDatabase()
}

export function saveDatabase(): void {
  if (db && dbPath) {
    try {
      const data = db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(dbPath, buffer)
    } catch (err) {
      log.error('Failed to save database:', err)
    }
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase()
    db.close()
    db = null
    log.info('Database closed')
  }
}

function runMigrations(): void {
  if (!db) return

  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'imap',
      imap_host TEXT NOT NULL DEFAULT '',
      imap_port INTEGER NOT NULL DEFAULT 993,
      imap_user TEXT NOT NULL,
      imap_password TEXT NOT NULL DEFAULT '',
      imap_use_tls INTEGER NOT NULL DEFAULT 1,
      smtp_host TEXT NOT NULL DEFAULT '',
      smtp_port INTEGER NOT NULL DEFAULT 465,
      smtp_user TEXT NOT NULL,
      smtp_password TEXT NOT NULL DEFAULT '',
      smtp_use_tls INTEGER NOT NULL DEFAULT 1,
      oauth_provider TEXT DEFAULT NULL,
      oauth_access_token TEXT DEFAULT NULL,
      oauth_refresh_token TEXT DEFAULT NULL,
      oauth_token_expires_at INTEGER DEFAULT NULL,
      sync_interval INTEGER NOT NULL DEFAULT 300,
      last_sync_at INTEGER DEFAULT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      remote_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      parent_remote_id TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'mail',
      unread_count INTEGER NOT NULL DEFAULT 0,
      subscribed INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, remote_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      folder_id INTEGER NOT NULL,
      uid INTEGER NOT NULL DEFAULT 0,
      message_id TEXT NOT NULL DEFAULT '',
      in_reply_to TEXT DEFAULT '',
      references_id TEXT DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      from_name TEXT DEFAULT '',
      from_email TEXT NOT NULL DEFAULT '',
      to_list TEXT NOT NULL DEFAULT '[]',
      cc_list TEXT NOT NULL DEFAULT '[]',
      bcc_list TEXT NOT NULL DEFAULT '[]',
      date INTEGER NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      has_attachments INTEGER NOT NULL DEFAULT 0,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_draft INTEGER NOT NULL DEFAULT 0,
      is_sent INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal',
      snippet TEXT DEFAULT '',
      body_fetched INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
      UNIQUE(account_id, uid, folder_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS email_bodies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id INTEGER NOT NULL UNIQUE,
      text_html TEXT DEFAULT '',
      text_plain TEXT DEFAULT '',
      fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      part_id TEXT NOT NULL DEFAULT '',
      cid TEXT DEFAULT '',
      local_path TEXT DEFAULT '',
      downloaded INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      conditions_json TEXT NOT NULL DEFAULT '[]',
      actions_json TEXT NOT NULL DEFAULT '[]',
      priority INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      match_count INTEGER NOT NULL DEFAULT 0,
      is_template INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#1890ff',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS email_tags (
      email_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (email_id, tag_id),
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS notification_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      shown INTEGER NOT NULL DEFAULT 1,
      shown_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS stats_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      account_id INTEGER,
      folder_id INTEGER,
      emails_received INTEGER NOT NULL DEFAULT 0,
      emails_sent INTEGER NOT NULL DEFAULT 0,
      emails_read INTEGER NOT NULL DEFAULT 0,
      total_size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
      UNIQUE(date, account_id)
    )
  `)

  db.run(`CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_folders_account ON folders(account_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_email_tags_email ON email_tags(email_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_email_tags_tag ON email_tags(tag_id)`)

  // FTS5 virtual table for full-text search
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
      subject, from_email, snippet,
      content='emails',
      content_rowid='id'
    )
  `)

  // Trigger to keep FTS in sync with emails table
  db.run(`CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON emails BEGIN INSERT INTO emails_fts(rowid, subject, from_email, snippet) VALUES (new.id, new.subject, new.from_email, new.snippet); END`)
  db.run(`CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON emails BEGIN INSERT INTO emails_fts(emails_fts, rowid, subject, from_email, snippet) VALUES('delete', old.id, old.subject, old.from_email, old.snippet); END`)
  db.run(`CREATE TRIGGER IF NOT EXISTS emails_au AFTER UPDATE ON emails BEGIN INSERT INTO emails_fts(emails_fts, rowid, subject, from_email, snippet) VALUES('delete', old.id, old.subject, old.from_email, old.snippet); INSERT INTO emails_fts(rowid, subject, from_email, snippet) VALUES (new.id, new.subject, new.from_email, new.snippet); END`)

  log.info('Database migrations complete')
}

function insertDefaultSettings(): void {
  if (!db) return
  const defaults = [
    ['theme', 'system'],
    ['language', 'zh-CN'],
    ['notification_enabled', 'true'],
    ['notification_sound', 'default'],
    ['dnd_enabled', 'false'],
    ['dnd_start', '22:00'],
    ['dnd_end', '08:00'],
    ['storage_limit', '5368709120'],
    ['retention_days', '365'],
    ['auto_sync', 'true'],
    ['sync_interval', '300'],
    ['preview_pane', 'true'],
    ['sidebar_width', '200'],
  ]

  for (const [key, value] of defaults) {
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }
}
