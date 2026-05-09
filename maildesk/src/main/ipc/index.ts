import { ipcMain, app, BrowserWindow, shell, nativeTheme, dialog } from 'electron'
import log from 'electron-log'
import { getDb, saveDatabase } from '../database'
import { syncAccount, syncAllAccounts, stopAccountIdle } from '../imap/sync'
import { testAccountConnection, connectImap, fetchEmailBody, getUnreadCount } from '../imap/client'
import { sendEmail, saveDraft } from '../smtp/sender'
import { executeRules } from '../rules/engine'
import { setTrayBadge } from '../tray'
import { simpleParser } from 'mailparser'
import fs from 'fs'
import path from 'path'

function registerIpcHandlers() {
  // ========== Account Handlers ==========
  ipcMain.handle('account:getAll', async () => {
    const db = getDb()
    return db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all()
  })

  ipcMain.handle('account:add', async (_event, config) => {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO accounts (email, display_name, provider, imap_host, imap_port, imap_user, imap_password, imap_use_tls,
        smtp_host, smtp_port, smtp_user, smtp_password, smtp_use_tls, oauth_provider, oauth_access_token, oauth_refresh_token, oauth_token_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      config.email, config.display_name || '', config.provider || 'imap',
      config.imap_host, config.imap_port || 993, config.imap_user, config.imap_password, config.imap_use_tls ? 1 : 0,
      config.smtp_host, config.smtp_port || 465, config.smtp_user, config.smtp_password, config.smtp_use_tls ? 1 : 0,
      config.oauth_provider || null, config.oauth_access_token || null, config.oauth_refresh_token || null, config.oauth_token_expires_at || null
    )
    saveDatabase()
    log.info(`Account added: ${config.email}`)
    return { id: result.lastInsertRowid, ...config }
  })

  ipcMain.handle('account:update', async (_event, id, config) => {
    const db = getDb()
    const stmt = db.prepare(`
      UPDATE accounts SET email=?, display_name=?, imap_host=?, imap_port=?, imap_user=?, imap_password=?,
        imap_use_tls=?, smtp_host=?, smtp_port=?, smtp_user=?, smtp_password=?, smtp_use_tls=?,
        oauth_provider=?, oauth_access_token=?, oauth_refresh_token=?, oauth_token_expires_at=?,
        updated_at=unixepoch() WHERE id=?
    `)
    stmt.run(
      config.email, config.display_name || '',
      config.imap_host, config.imap_port || 993, config.imap_user, config.imap_password, config.imap_use_tls ? 1 : 0,
      config.smtp_host, config.smtp_port || 465, config.smtp_user, config.smtp_password, config.smtp_use_tls ? 1 : 0,
      config.oauth_provider || null, config.oauth_access_token || null, config.oauth_refresh_token || null, config.oauth_token_expires_at || null,
      id
    )
    saveDatabase()
    return { id, ...config }
  })

  ipcMain.handle('account:delete', async (_event, id) => {
    const db = getDb()

    try {
      db.run('BEGIN TRANSACTION')

      // Stop IDLE polling for this account
      stopAccountIdle(id)

      // Get email IDs before deletion (for FTS cleanup via trigger, but we also do it manually)
      const emailIds = db.prepare('SELECT id FROM emails WHERE account_id=?').all(id) as any[]

      // Delete email bodies first
      if (emailIds.length > 0) {
        const ids = emailIds.map(e => e.id)
        db.prepare(`DELETE FROM email_bodies WHERE email_id IN (${ids.map(() => '?').join(',')})`).run(...ids)
        db.prepare(`DELETE FROM attachments WHERE email_id IN (${ids.map(() => '?').join(',')})`).run(...ids)
        db.prepare(`DELETE FROM email_tags WHERE email_id IN (${ids.map(() => '?').join(',')})`).run(...ids)
      }

      // Delete notification history for this account
      db.prepare('DELETE FROM notification_history WHERE account_id=?').run(id)

      // Delete stats for this account
      db.prepare('DELETE FROM stats_daily WHERE account_id=?').run(id)

      // Delete emails (FTS entries cleaned up via trigger)
      db.prepare('DELETE FROM emails WHERE account_id=?').run(id)

      // Delete folders
      db.prepare('DELETE FROM folders WHERE account_id=?').run(id)

      // Delete account
      db.prepare('DELETE FROM accounts WHERE id=?').run(id)

      db.run('COMMIT')
      saveDatabase()

      // Update tray badge
      const accounts = db.prepare('SELECT id FROM accounts WHERE enabled=1').all() as any[]
      let totalUnread = 0
      for (const acc of accounts) {
        totalUnread += await getUnreadCount(acc.id)
      }
      setTrayBadge(totalUnread)

      log.info(`Account ${id} and all related data deleted successfully`)
      return { success: true }
    } catch (err: any) {
      db.run('ROLLBACK')
      log.error(`Failed to delete account ${id}:`, err)
      throw err
    }
  })

  ipcMain.handle('account:testConnection', async (_event, config) => {
    return testAccountConnection(config)
  })

  ipcMain.handle('account:sync', async (_event, id) => {
    const win = BrowserWindow.getAllWindows()[0]
    return syncAccount(id, (progress) => {
      win?.webContents.send('email:sync-progress', { accountId: id, progress })
    })
  })

  ipcMain.handle('account:syncAll', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    return syncAllAccounts((progress) => {
      win?.webContents.send('email:sync-progress', progress)
    })
  })

  // ========== Folder Handlers ==========
  ipcMain.handle('folder:getAll', async (_event, accountId) => {
    const db = getDb()
    if (accountId) {
      return db.prepare('SELECT * FROM folders WHERE account_id=? ORDER BY path').all(accountId)
    }
    return db.prepare('SELECT * FROM folders ORDER BY path').all()
  })

  ipcMain.handle('folder:subscribe', async (_event, folderId, subscribed) => {
    const db = getDb()
    db.prepare('UPDATE folders SET subscribed=? WHERE id=?').run(subscribed ? 1 : 0, folderId)
    saveDatabase()
    return true
  })

  ipcMain.handle('folder:create', async (_event, accountId, name, parentId) => {
    const db = getDb()
    const stmt = db.prepare('INSERT INTO folders (account_id, name, path, remote_id) VALUES (?, ?, ?, ?)')
    const result = stmt.run(accountId, name, `[${name}]`, `local_${Date.now()}`)
    saveDatabase()
    return { id: result.lastInsertRowid, account_id: accountId, name, path: `[${name}]` }
  })

  ipcMain.handle('folder:delete', async (_event, folderId) => {
    const db = getDb()
    db.prepare('DELETE FROM folders WHERE id=?').run(folderId)
    saveDatabase()
    return true
  })

  // ========== Email Handlers ==========
  ipcMain.handle('email:getList', async (_event, params) => {
    const db = getDb()
    const { accountId, folderId, search, page = 1, pageSize = 50, sortField = 'date', sortOrder = 'desc' } = params

    let query = `
      SELECT e.*, f.name as folder_name, f.path as folder_path,
        GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) as tags
      FROM emails e
      LEFT JOIN folders f ON e.folder_id = f.id
      LEFT JOIN email_tags et ON e.id = et.email_id
      LEFT JOIN tags t ON et.tag_id = t.id
      WHERE 1=1
    `
    const bindings: any[] = []

    if (accountId) {
      query += ' AND e.account_id=?'
      bindings.push(accountId)
    }
    if (folderId) {
      query += ' AND e.folder_id=?'
      bindings.push(folderId)
    }
    if (search) {
      query += ' AND e.id IN (SELECT rowid FROM emails_fts WHERE emails_fts MATCH ?)'
      bindings.push(search)
    }

    query += ' GROUP BY e.id'

    const validSortFields = ['date', 'from_email', 'subject', 'priority', 'is_starred', 'is_read', 'size']
    const sf = validSortFields.includes(sortField) ? sortField : 'date'
    const so = sortOrder === 'asc' ? 'ASC' : 'DESC'
    query += ` ORDER BY e.${sf} ${so}`

    const countQuery = `SELECT COUNT(*) as total FROM (${query.replace(/GROUP_CONCAT.*$/, '').replace(/LEFT JOIN folders.*$/, '').replace(/LEFT JOIN email_tags.*$/, '').replace(/LEFT JOIN tags.*$/, '')}) as count_query`
    const total = (db.prepare(countQuery).get(...bindings) as any)?.total || 0

    query += ' LIMIT ? OFFSET ?'
    bindings.push(pageSize, (page - 1) * pageSize)

    const rows = db.prepare(query).all(...bindings)
    const emails = rows.map((row: any) => ({
      ...row,
      tags: row.tags ? row.tags.split(',').map((t: string) => {
        const [id, name, color] = t.split(':')
        return { id: parseInt(id), name, color }
      }) : []
    }))

    return { emails, total, page, pageSize }
  })

  ipcMain.handle('email:getById', async (_event, id) => {
    const db = getDb()
    const email = db.prepare(`
      SELECT e.*, f.name as folder_name, f.path as folder_path
      FROM emails e LEFT JOIN folders f ON e.folder_id = f.id WHERE e.id=?
    `).get(id) as any

    if (email) {
      const tags = db.prepare(`
        SELECT t.* FROM tags t
        JOIN email_tags et ON et.tag_id = t.id WHERE et.email_id=?
      `).all(id)
      email.tags = tags
    }

    return email
  })

  ipcMain.handle('email:getBody', async (_event, id) => {
    const db = getDb()
    let body = db.prepare('SELECT * FROM email_bodies WHERE email_id=?').get(id) as any

    if (!body) {
      // Fetch from IMAP if not cached
      const email = db.prepare('SELECT e.*, f.path as folder_path FROM emails e LEFT JOIN folders f ON e.folder_id = f.id WHERE e.id=?').get(id) as any
      if (email) {
        try {
          const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(email.account_id) as any
          if (account) {
            const imap = await connectImap(account)
            const { textHtml, textPlain } = await fetchEmailBody(imap, email.account_id, email.uid, email.folder_path || 'INBOX')
            imap.end()

            // Store in database
            db.prepare('INSERT INTO email_bodies (email_id, text_html, text_plain) VALUES (?, ?, ?)')
              .run(id, textHtml, textPlain)

            // Update snippet
            if (!email.snippet) {
              const snippet = (textPlain || textHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150)
              db.prepare('UPDATE emails SET snippet=? WHERE id=?').run(snippet, id)
            }

            saveDatabase()
            body = { email_id: id, text_html: textHtml, text_plain: textPlain }
          }
        } catch (err) {
          log.error('Failed to fetch email body:', err)
        }
      }
    }

    return body
  })

  ipcMain.handle('email:send', async (_event, data) => {
    return sendEmail(data)
  })

  ipcMain.handle('email:saveDraft', async (_event, data) => {
    return saveDraft(data)
  })

  ipcMain.handle('email:setRead', async (_event, ids, read) => {
    const db = getDb()
    const stmt = db.prepare('UPDATE emails SET is_read=? WHERE id=?')
    try {
      db.run('BEGIN TRANSACTION')
      for (const id of ids) {
        stmt.run(read ? 1 : 0, id)
      }
      db.run('COMMIT')
      saveDatabase()
    } catch (e) {
      try { db.run('ROLLBACK') } catch {}
      throw e
    }
    return true
  })

  ipcMain.handle('email:setStar', async (_event, ids, starred) => {
    const db = getDb()
    const stmt = db.prepare('UPDATE emails SET is_starred=? WHERE id=?')
    try {
      db.run('BEGIN TRANSACTION')
      for (const id of ids) {
        stmt.run(starred ? 1 : 0, id)
      }
      db.run('COMMIT')
      saveDatabase()
    } catch (e) {
      try { db.run('ROLLBACK') } catch {}
      throw e
    }
    return true
  })

  ipcMain.handle('email:move', async (_event, ids, targetFolderId) => {
    const db = getDb()
    const stmt = db.prepare('UPDATE emails SET folder_id=? WHERE id=?')
    try {
      db.run('BEGIN TRANSACTION')
      for (const id of ids) {
        stmt.run(targetFolderId, id)
      }
      db.run('COMMIT')
      saveDatabase()
    } catch (e) {
      try { db.run('ROLLBACK') } catch {}
      throw e
    }
    return true
  })

  ipcMain.handle('email:delete', async (_event, ids) => {
    const db = getDb()
    const stmt = db.prepare('UPDATE emails SET folder_id=(SELECT id FROM folders WHERE account_id=emails.account_id AND path LIKE "%Trash%") WHERE id=?')
    try {
      db.run('BEGIN TRANSACTION')
      for (const id of ids) {
        stmt.run(id)
      }
      db.run('COMMIT')
      saveDatabase()
    } catch (e) {
      try { db.run('ROLLBACK') } catch {}
      throw e
    }
    return true
  })

  ipcMain.handle('email:permanentDelete', async (_event, ids) => {
    const db = getDb()
    const stmt = db.prepare('DELETE FROM emails WHERE id=?')
    try {
      db.run('BEGIN TRANSACTION')
      for (const id of ids) {
        stmt.run(id)
      }
      db.run('COMMIT')
      saveDatabase()
    } catch (e) {
      try { db.run('ROLLBACK') } catch {}
      throw e
    }
    return true
  })

  ipcMain.handle('email:search', async (_event, query, accountId) => {
    const db = getDb()

    // Parse advanced search syntax: from:subject:has:attachment:is:unread
    let searchTerms: string[] = []
    let ftsQuery = query

    // Extract from: searches
    const fromMatch = query.match(/from:(\S+)/gi)
    if (fromMatch) {
      for (const m of fromMatch) {
        const term = m.split(':').slice(1).join(':')
        searchTerms.push(`from_email:${term}*`)
      }
      ftsQuery = ftsQuery.replace(/from:\S+/gi, '').trim()
    }

    // Extract subject: searches
    const subjectMatch = query.match(/subject:(\S+)/gi)
    if (subjectMatch) {
      for (const m of subjectMatch) {
        const term = m.split(':').slice(1).join(':')
        searchTerms.push(`subject:${term}*`)
      }
      ftsQuery = ftsQuery.replace(/subject:\S+/gi, '').trim()
    }

    // Handle has:attachment
    const hasAttachment = /has:attachment/i.test(query)
    if (hasAttachment) {
      ftsQuery = ftsQuery.replace(/has:attachment/gi, '').trim()
    }

    // Handle is:unread/is:read
    const isUnread = /is:unread/i.test(query)
    const isRead = /is:read/i.test(query)
    ftsQuery = ftsQuery.replace(/is:(unread|read)/gi, '').trim()

    // Build FTS query
    let finalQuery = ftsQuery
    if (searchTerms.length > 0) {
      finalQuery = searchTerms.join(' ') + (ftsQuery ? ' ' + ftsQuery : '')
    }
    if (!finalQuery.trim()) {
      finalQuery = '*'
    }

    const ftsSearchQuery = finalQuery.includes(':')
      ? finalQuery
      : `"${finalQuery}"*`

    let sql = `
      SELECT e.*, f.name as folder_name, f.path as folder_path,
        bm25(emails_fts) as rank
      FROM emails_fts
      JOIN emails e ON emails_fts.rowid = e.id
      LEFT JOIN folders f ON e.folder_id = f.id
      WHERE emails_fts MATCH ?
    `
    const bindings: any[] = [ftsSearchQuery]

    if (accountId) {
      sql += ' AND e.account_id=?'
      bindings.push(accountId)
    }

    if (isUnread) {
      sql += ' AND e.is_read=0'
    } else if (isRead) {
      sql += ' AND e.is_read=1'
    }

    if (hasAttachment) {
      sql += ' AND e.has_attachments=1'
    }

    sql += ' ORDER BY rank LIMIT 100'

    let results = db.prepare(sql).all(...bindings) as any[]

    return results
  })

  ipcMain.handle('email:getAttachments', async (_event, id) => {
    const db = getDb()
    return db.prepare('SELECT * FROM attachments WHERE email_id=?').all(id)
  })

  ipcMain.handle('email:reply', async (_event, id, replyAll) => {
    const db = getDb()
    const email = db.prepare('SELECT * FROM emails WHERE id=?').get(id) as any
    if (!email) return null

    const toList: string[] = JSON.parse(email.to_list || '[]')
    const ccList: string[] = JSON.parse(email.cc_list || '[]')

    let replyTo = email.from_email
    if (replyAll) {
      return {
        to: replyTo,
        cc: [...toList.filter((t: string) => t !== email.from_email), email.from_email].join(', '),
        subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
        inReplyTo: email.message_id,
        references: email.references_id ? `${email.references_id} ${email.message_id}` : email.message_id,
      }
    }

    return {
      to: replyTo,
      subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
      inReplyTo: email.message_id,
      references: email.references_id ? `${email.references_id} ${email.message_id}` : email.message_id,
    }
  })

  ipcMain.handle('email:forward', async (_event, id) => {
    const db = getDb()
    const email = db.prepare('SELECT * FROM emails WHERE id=?').get(id) as any
    if (!email) return null

    return {
      subject: email.subject?.startsWith('转发:') ? email.subject : `转发: ${email.subject || ''}`,
      body: `

--- 转发的邮件 ---
发件人: ${email.from_name || ''} <${email.from_email}>
日期: ${new Date(email.date * 1000).toLocaleString()}
主题: ${email.subject || ''}

`,
      originalEmailId: email.id,
    }
  })

  ipcMain.handle('email:downloadAttachment', async (_event, attachmentId, savePath) => {
    const db = getDb()
    const attachment = db.prepare('SELECT * FROM attachments WHERE id=?').get(attachmentId) as any
    if (!attachment) return { success: false, error: 'Attachment not found' }

    let targetPath = savePath
    if (!targetPath) {
      const result = await dialog.showSaveDialog({
        defaultPath: attachment.filename,
        filters: [{ name: 'All Files', extensions: ['*'] }],
      })
      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Cancelled' }
      }
      targetPath = result.filePath
    }

    try {
      if (attachment.local_path && fs.existsSync(attachment.local_path)) {
        fs.copyFileSync(attachment.local_path, targetPath)
      } else {
        // Placeholder: actual download from IMAP would happen here
        log.warn(`Attachment ${attachmentId} has no local path`)
        fs.writeFileSync(targetPath, `Attachment placeholder: ${attachment.filename}`)
      }
      log.info(`Attachment downloaded to: ${targetPath}`)
      return { success: true, path: targetPath }
    } catch (err: any) {
      log.error('Failed to download attachment:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('email:exportEml', async (_event, emailId) => {
    const db = getDb()
    const email = db.prepare('SELECT * FROM emails WHERE id=?').get(emailId) as any
    if (!email) return { success: false, error: 'Email not found' }

    const body = db.prepare('SELECT * FROM email_bodies WHERE email_id=?').get(emailId) as any

    const result = await dialog.showSaveDialog({
      defaultPath: `${email.subject || 'email'}.eml`.replace(/[<>:"/\\|?*]/g, '_'),
      filters: [{ name: 'EML Files', extensions: ['eml'] }],
    })
    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' }
    }

    try {
      const content = [
        `From: ${email.from_name} <${email.from_email}>`,
        `To: ${email.to_list}`,
        `Subject: ${email.subject || ''}`,
        `Date: ${new Date(email.date * 1000).toUTCString()}`,
        `Message-ID: ${email.message_id}`,
        '',
        body?.text_plain || body?.text_html || '',
      ].join('\r\n')

      fs.writeFileSync(result.filePath, content)
      return { success: true, path: result.filePath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('email:exportMbox', async (_event, accountId, folderId) => {
    const db = getDb()
    let emails: any[]
    if (folderId) {
      emails = db.prepare('SELECT * FROM emails WHERE folder_id=? ORDER BY date').all(folderId) as any[]
    } else if (accountId) {
      emails = db.prepare('SELECT * FROM emails WHERE account_id=? ORDER BY date').all(accountId) as any[]
    } else {
      emails = db.prepare('SELECT * FROM emails ORDER BY date').all() as any[]
    }

    const result = await dialog.showSaveDialog({
      defaultPath: 'maildesk_export.mbox',
      filters: [{ name: 'MBOX Files', extensions: ['mbox'] }],
    })
    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' }
    }

    try {
      const lines: string[] = []
      for (const email of emails) {
        const body = db.prepare('SELECT * FROM email_bodies WHERE email_id=?').get(email.id) as any
        lines.push('From MAILER-DAEMON ' + new Date(email.date * 1000).toUTCString())
        lines.push(`From: ${email.from_name} <${email.from_email}>`)
        lines.push(`To: ${email.to_list}`)
        lines.push(`Subject: ${email.subject || ''}`)
        lines.push(`Date: ${new Date(email.date * 1000).toUTCString()}`)
        lines.push(`Message-ID: ${email.message_id}`)
        lines.push('')
        lines.push(body?.text_plain || body?.text_html || '')
        lines.push('')
        lines.push('')
      }
      fs.writeFileSync(result.filePath, lines.join('\r\n'))
      return { success: true, path: result.filePath, count: emails.length }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('settings:importData', async (_event, format, filePath) => {
    if (format === 'mbox' && filePath) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        // Basic MBOX parsing — split by From lines
        const messages = content.split(/\r?\nFrom /).filter(Boolean)
        let imported = 0
        const db = getDb()

        for (const msg of messages) {
          try {
            const parsed = await simpleParser(`From ${msg}`)
            const headers = parsed.headers

            const accountId = 1 // Default to first account
            const sentFolder = db.prepare("SELECT * FROM folders WHERE account_id=? AND type='inbox' LIMIT 1").get(accountId) as any
            if (!sentFolder) continue

            const existing = db.prepare('SELECT id FROM emails WHERE message_id=?').get(headers.get('message-id') || '')
            if (existing) continue

            db.prepare(`
              INSERT INTO emails (account_id, folder_id, uid, message_id, subject, from_name, from_email, to_list, date, is_read, snippet)
              VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, 1, ?)
            `).run(
              accountId, sentFolder.id,
              headers.get('message-id') || `import-${Date.now()}`,
              parsed.subject || '(无主题)',
              parsed.from?.name || '',
              parsed.from?.value?.[0]?.text || '',
              parsed.to?.value.map((t: any) => t.text).join(', '),
              Math.floor((parsed.date?.getTime() || Date.now()) / 1000),
              (parsed.text?.substring(0, 200) || '')
            )
            imported++
          } catch (e) {
            // Skip malformed messages
          }
        }

        if (imported > 0) {
          saveDatabase()
        }
        return { success: true, format, imported }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
    return { success: false, error: 'Unsupported format' }
  })

  // ========== OAuth2 Handlers ==========
  ipcMain.handle('account:getOAuthUrl', async (_event, provider) => {
    if (provider === 'gmail') {
      const clientId = process.env.GOOGLE_CLIENT_ID || ''
      const redirectUri = 'http://localhost:9876/oauth/callback'
      const scope = encodeURIComponent('https://mail.google.com/ https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send')
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&access_type=offline&scope=${scope}`
    }
    if (provider === 'outlook') {
      const clientId = process.env.OUTLOOK_CLIENT_ID || ''
      const redirectUri = 'http://localhost:9876/oauth/callback'
      const scope = encodeURIComponent('offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send')
      return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`
    }
    return ''
  })

  ipcMain.handle('account:handleOAuthCallback', async (_event, code, provider) => {
    // OAuth token exchange would be implemented here
    // For now, return a placeholder
    log.info(`OAuth callback received for provider: ${provider}`)
    return { success: false, error: 'OAuth not fully configured. Please use IMAP/SMTP password authentication.' }
  })

  // ========== Stats Daily Aggregation ==========
  ipcMain.handle('stats:recordEmail', async (_event, accountId, type: 'received' | 'sent' | 'read') => {
    const db = getDb()
    const today = new Date().toISOString().split('T')[0]
    const field = type === 'received' ? 'emails_received' : type === 'sent' ? 'emails_sent' : 'emails_read'

    try {
      db.run('BEGIN TRANSACTION')
      const existing = db.prepare('SELECT id FROM stats_daily WHERE date=? AND account_id=?').get(today, accountId)
      if (existing) {
        db.prepare(`UPDATE stats_daily SET ${field}=${field}+1 WHERE date=? AND account_id=?`).run(today, accountId)
      } else {
        db.prepare(`INSERT INTO stats_daily (date, account_id, ${field}) VALUES (?, ?, 1)`).run(today, accountId)
      }
      db.run('COMMIT')
      saveDatabase()
    } catch (e) {
      try { db.run('ROLLBACK') } catch {}
    }
    return true
  })

  ipcMain.handle('email:addTag', async (_event, emailId, tagId) => {
    const db = getDb()
    db.prepare('INSERT OR IGNORE INTO email_tags (email_id, tag_id) VALUES (?, ?)').run(emailId, tagId)
    saveDatabase()
    return true
  })

  ipcMain.handle('email:removeTag', async (_event, emailId, tagId) => {
    const db = getDb()
    db.prepare('DELETE FROM email_tags WHERE email_id=? AND tag_id=?').run(emailId, tagId)
    saveDatabase()
    return true
  })

  // ========== Rule Handlers ==========
  ipcMain.handle('rule:getAll', async () => {
    const db = getDb()
    const rules = db.prepare('SELECT * FROM rules ORDER BY priority ASC').all()
    return rules.map((r: any) => ({
      ...r,
      conditions: JSON.parse(r.conditions_json),
      actions: JSON.parse(r.actions_json)
    }))
  })

  ipcMain.handle('rule:create', async (_event, rule) => {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO rules (name, conditions_json, actions_json, priority, enabled, is_template)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(rule.name, JSON.stringify(rule.conditions), JSON.stringify(rule.actions), rule.priority || 0, rule.enabled ? 1 : 0, rule.is_template ? 1 : 0)
    saveDatabase()
    return { id: result.lastInsertRowid, ...rule }
  })

  ipcMain.handle('rule:update', async (_event, id, rule) => {
    const db = getDb()
    db.prepare(`
      UPDATE rules SET name=?, conditions_json=?, actions_json=?, priority=?, enabled=?, updated_at=unixepoch() WHERE id=?
    `).run(rule.name, JSON.stringify(rule.conditions), JSON.stringify(rule.actions), rule.priority, rule.enabled ? 1 : 0, id)
    saveDatabase()
    return { id, ...rule }
  })

  ipcMain.handle('rule:delete', async (_event, id) => {
    const db = getDb()
    db.prepare('DELETE FROM rules WHERE id=?').run(id)
    saveDatabase()
    return true
  })

  ipcMain.handle('rule:test', async (_event, ruleId) => {
    const db = getDb()
    const rule = db.prepare('SELECT * FROM rules WHERE id=?').get(ruleId) as any
    if (!rule) return []

    const conditions = JSON.parse(rule.conditions_json)
    const emails = db.prepare('SELECT * FROM emails ORDER BY date DESC LIMIT 100').all()
    const matched = emails.filter((email: any) => {
      return conditions.every((cond: any) => evaluateCondition(email, cond))
    })
    return matched
  })

  ipcMain.handle('rule:reorder', async (_event, orderedIds: number[]) => {
    const db = getDb()
    const stmt = db.prepare('UPDATE rules SET priority=? WHERE id=?')
    try {
      db.run('BEGIN TRANSACTION')
      orderedIds.forEach((id: number, index: number) => {
        stmt.run(index, id)
      })
      db.run('COMMIT')
      saveDatabase()
    } catch (e) {
      try { db.run('ROLLBACK') } catch {}
      throw e
    }
    return true
  })

  ipcMain.handle('rule:export', async () => {
    const db = getDb()
    const rules = db.prepare('SELECT * FROM rules WHERE is_template=0').all()
    return JSON.stringify({ version: '1.0', rules }, null, 2)
  })

  ipcMain.handle('rule:import', async (_event, jsonStr) => {
    const data = JSON.parse(jsonStr)
    if (!data.rules) throw new Error('Invalid rule file')
    const db = getDb()
    const stmt = db.prepare('INSERT INTO rules (name, conditions_json, actions_json, priority, enabled) VALUES (?, ?, ?, ?, ?)')
    try {
      db.run('BEGIN TRANSACTION')
      for (const rule of data.rules) {
        stmt.run(rule.name, rule.conditions_json, rule.actions_json, rule.priority || 0, rule.enabled ? 1 : 0)
      }
      db.run('COMMIT')
      saveDatabase()
    } catch (e) {
      try { db.run('ROLLBACK') } catch {}
      throw e
    }
    return true
  })

  // ========== Tag Handlers ==========
  ipcMain.handle('tag:getAll', async () => {
    const db = getDb()
    return db.prepare('SELECT * FROM tags ORDER BY created_at').all()
  })

  ipcMain.handle('tag:create', async (_event, name, color) => {
    const db = getDb()
    const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color)
    saveDatabase()
    return { id: result.lastInsertRowid, name, color }
  })

  ipcMain.handle('tag:update', async (_event, id, name, color) => {
    const db = getDb()
    db.prepare('UPDATE tags SET name=?, color=? WHERE id=?').run(name, color, id)
    saveDatabase()
    return { id, name, color }
  })

  ipcMain.handle('tag:delete', async (_event, id) => {
    const db = getDb()
    db.prepare('DELETE FROM tags WHERE id=?').run(id)
    saveDatabase()
    return true
  })

  // ========== Stats Handlers ==========
  ipcMain.handle('stats:getDashboard', async () => {
    const db = getDb()
    const totalEmails = (db.prepare('SELECT COUNT(*) as c FROM emails').get() as any)?.c || 0
    const unreadEmails = (db.prepare('SELECT COUNT(*) as c FROM emails WHERE is_read=0').get() as any)?.c || 0
    const totalAccounts = (db.prepare('SELECT COUNT(*) as c FROM accounts').get() as any)?.c || 0
    const totalRules = (db.prepare('SELECT COUNT(*) as c FROM rules').get() as any)?.c || 0
    return { totalEmails, unreadEmails, totalAccounts, totalRules }
  })

  ipcMain.handle('stats:getTrend', async (_event, days = 30) => {
    const db = getDb()
    const startTime = Math.floor(Date.now() / 1000) - days * 86400
    return db.prepare(`
      SELECT date(date, 'unixepoch') as day, COUNT(*) as count
      FROM emails WHERE date > ?
      GROUP BY day ORDER BY day
    `).all(startTime)
  })

  ipcMain.handle('stats:getTopSenders', async (_event, limit = 10) => {
    const db = getDb()
    return db.prepare(`
      SELECT from_email, from_name, COUNT(*) as count
      FROM emails GROUP BY from_email
      ORDER BY count DESC LIMIT ?
    `).all(limit)
  })

  ipcMain.handle('stats:getFolderStats', async () => {
    const db = getDb()
    return db.prepare(`
      SELECT f.name, f.path, COUNT(e.id) as email_count, SUM(CASE WHEN e.is_read=0 THEN 1 ELSE 0 END) as unread_count
      FROM folders f LEFT JOIN emails e ON e.folder_id = f.id
      GROUP BY f.id ORDER BY email_count DESC
    `).all()
  })

  // ========== Settings Handlers ==========
  ipcMain.handle('settings:get', async () => {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all() as any[]
    const settings: Record<string, string> = {}
    for (const row of rows) {
      settings[row.key] = row.value
    }
    return settings
  })

  ipcMain.handle('settings:set', async (_event, settings) => {
    const db = getDb()
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    try {
      db.run('BEGIN TRANSACTION')
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(key, String(value))
      }
      db.run('COMMIT')
      saveDatabase()
    } catch (e) {
      try { db.run('ROLLBACK') } catch {}
      throw e
    }
    return true
  })

  ipcMain.handle('settings:getTheme', async () => {
    const db = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key='theme'").get() as any
    return row?.value || 'system'
  })

  ipcMain.handle('settings:setTheme', async (_event, theme) => {
    const db = getDb()
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)").run(theme)
    if (theme === 'dark') {
      nativeTheme.themeSource = 'dark'
    } else if (theme === 'light') {
      nativeTheme.themeSource = 'light'
    } else {
      nativeTheme.themeSource = 'system'
    }
    return true
  })

  ipcMain.handle('settings:getStorageInfo', async () => {
    const db = getDb()
    const userDataPath = app.getPath('userData')
    const emailCount = (db.prepare('SELECT COUNT(*) as c FROM emails').get() as any)?.c || 0
    const dbSize = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get() as any
    return {
      userDataPath,
      emailCount,
      dbSizeBytes: dbSize?.size || 0,
      limitBytes: 5368709120 // 5GB default
    }
  })

  ipcMain.handle('settings:clearCache', async () => {
    const db = getDb()
    db.prepare('DELETE FROM email_bodies').run()
    db.prepare('UPDATE emails SET body_fetched=0').run()
    saveDatabase()
    return true
  })

  ipcMain.handle('settings:setRetention', async (_event, days) => {
    const db = getDb()
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('retention_days', ?)").run(String(days))
    saveDatabase()
    return true
  })

  ipcMain.handle('settings:exportData', async (_event, format) => {
    // Export implementation
    return { success: true, format }
  })

  // ========== Notification Handlers ==========
  ipcMain.handle('notification:getHistory', async (_event, page = 1, pageSize = 50) => {
    const db = getDb()
    const offset = (page - 1) * pageSize
    const rows = db.prepare(`
      SELECT nh.*, e.subject, e.from_email, e.from_name, a.email as account_email
      FROM notification_history nh
      JOIN emails e ON nh.email_id = e.id
      JOIN accounts a ON nh.account_id = a.id
      ORDER BY nh.shown_at DESC LIMIT ? OFFSET ?
    `).all(pageSize, offset)
    const total = (db.prepare('SELECT COUNT(*) as c FROM notification_history').get() as any)?.c || 0
    return { rows, total }
  })

  ipcMain.handle('notification:clearHistory', async () => {
    const db = getDb()
    db.prepare('DELETE FROM notification_history').run()
    return true
  })

  // ========== Window Handlers ==========
  ipcMain.handle('window:minimize', async () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle('window:maximize', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('window:close', async () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  ipcMain.handle('window:isMaximized', async () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() || false
  })

  // ========== App Handlers ==========
  ipcMain.handle('app:getPath', async () => {
    return app.getPath('userData')
  })

  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion()
  })

  log.info('IPC handlers registered')
}

function evaluateCondition(email: any, condition: any): boolean {
  switch (condition.field) {
    case 'subject':
      return email.subject?.toLowerCase().includes(condition.value.toLowerCase())
    case 'from':
      return email.from_email?.toLowerCase().includes(condition.value.toLowerCase())
    case 'to':
      return email.to_list?.toLowerCase().includes(condition.value.toLowerCase())
    case 'body':
      return email.snippet?.toLowerCase().includes(condition.value.toLowerCase())
    case 'hasAttachment':
      return condition.value ? !!email.has_attachments : !email.has_attachments
    case 'isRead':
      return condition.value ? !!email.is_read : !email.is_read
    case 'isStarred':
      return condition.value ? !!email.is_starred : !email.is_starred
    case 'accountId':
      return email.account_id === condition.value
    default:
      return true
  }
}

export { registerIpcHandlers }
