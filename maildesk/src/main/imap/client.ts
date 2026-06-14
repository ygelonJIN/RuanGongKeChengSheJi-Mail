import Imap from 'imap'
import { simpleParser } from 'mailparser'
import log from 'electron-log'
import { getDb, saveDatabase } from '../database'
import { shell } from 'electron'
import path from 'path'
import fs from 'fs'
import iconv from 'iconv-lite'
import dns from 'dns'
import net from 'net'

function imapDebug(step: string, data: any = {}): void {
  log.info(`[imap-debug] ${step}`, data)
}

function cleanMailText(input: string): string {
  if (!input) return ''
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => !/^(date|from|subject|message-id|to|cc|bcc):/i.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeHeaderValue(value: string): string {
  if (!value) return ''
  return value.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_match, charset, encoding, content) => {
    try {
      const cs = String(charset).toLowerCase().replace(/[^a-z0-9_-]/g, '')
      if (String(encoding).toUpperCase() === 'B') {
        const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
        return new TextDecoder(cs).decode(bytes)
      }
      const qp = content.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
      return new TextDecoder(cs).decode(Uint8Array.from(qp, (c) => c.charCodeAt(0)))
    } catch {
      return value
    }
  })
}

function decodeMimeText(raw: string): string {
  if (!raw) return ''
  return decodeHeaderValue(raw)
}

function collectBuffer(fetcher: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let resolved = false
    fetcher.on('message', (msg: any) => {
      msg.on('body', (stream: any) => {
        stream.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        stream.once('end', () => {
          if (resolved) return
          resolved = true
          resolve(Buffer.concat(chunks))
        })
      })
    })
    fetcher.once('error', (err: Error) => { if (!resolved) { resolved = true; reject(err) } })
    fetcher.once('end', () => { if (!resolved) { resolved = true; resolve(Buffer.concat(chunks)) } })
  })
}

function extractFromRawMime(raw: string): { textPlain: string; textHtml: string } {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const headerEnd = normalized.indexOf('\n\n')
  if (headerEnd < 0) return { textPlain: '', textHtml: '' }
  const headerText = normalized.slice(0, headerEnd)
  const bodyText = normalized.slice(headerEnd + 2)
  const headers: Record<string, string> = {}
  for (const line of headerText.split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
  }
  const contentType = headers['content-type'] || ''
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i)
  if (!/multipart\//i.test(contentType) || !boundaryMatch) return { textPlain: '', textHtml: '' }

  const boundary = `--${boundaryMatch[1]}`
  const parts = bodyText.split(boundary).map((p) => p.trim()).filter(Boolean)
  let textPlain = ''
  let textHtml = ''

  for (const part of parts) {
    if (part === '--') continue
    const partHeaderEnd = part.indexOf('\n\n')
    if (partHeaderEnd < 0) continue
    const partHeaderText = part.slice(0, partHeaderEnd)
    let partBody = part.slice(partHeaderEnd + 2).trim()
    const partHeaders: Record<string, string> = {}
    for (const line of partHeaderText.split('\n')) {
      const idx = line.indexOf(':')
      if (idx > 0) partHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
    }
    const pType = (partHeaders['content-type'] || '').toLowerCase()
    const encoding = (partHeaders['content-transfer-encoding'] || '').toLowerCase()

    if (encoding.includes('base64')) {
      try { partBody = Buffer.from(partBody.replace(/\s+/g, ''), 'base64').toString('utf8') } catch {}
    } else if (encoding.includes('quoted-printable')) {
      partBody = partBody.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    }

    if (/text\/plain/i.test(pType) && !textPlain) textPlain = cleanMailText(decodeMimeText(partBody))
    if (/text\/html/i.test(pType) && !textHtml) textHtml = htmlToReadableText(decodeMimeText(partBody))
  }

  return { textPlain, textHtml }
}

function decodeBodyText(raw: string): string {
  if (!raw) return ''
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  text = text.replace(/^.*?\n\n/s, '')
  if (/Content-Transfer-Encoding:\s*base64/i.test(raw)) {
    try { text = Buffer.from(text.replace(/\s+/g, ''), 'base64').toString('utf8') } catch {}
  } else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(raw)) {
    text = text.replace(/=\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
  }
  return cleanMailText(decodeMimeText(text))
}

function shouldIgnoreAsBody(text: string): boolean {
  if (!text) return true
  const normalized = text.trim()
  if (!normalized) return true
  if (/^@media\b/i.test(normalized)) return true
  if (/^\s*\.mailmaster-|^\s*#mailcontent|^\s*\.ntes-edm-/i.test(normalized)) return true
  if (/^\s*[.#]?[a-z0-9_-]+\s*\{[^}]*\}$/is.test(normalized.slice(0, 500))) return true
  return false
}

function htmlToReadableText(html: string): string {
  if (!html) return ''
  const withoutCss = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
  const unescaped = withoutCss
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  const text = unescaped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return cleanMailText(text)
}

function pickReadableText(parsed: any, raw?: string): { textPlain: string; textHtml: string } {
  let plain = cleanMailText(String(parsed?.text || ''))
  let html = htmlToReadableText(String(parsed?.html || ''))
  if (shouldIgnoreAsBody(plain)) plain = ''
  if (shouldIgnoreAsBody(html)) html = ''
  if ((!plain && !html) && raw) {
    const fallback = extractFromRawMime(raw)
    plain = plain || fallback.textPlain
    html = html || fallback.textHtml
    if (shouldIgnoreAsBody(plain)) plain = ''
    if (shouldIgnoreAsBody(html)) html = ''
    if (!plain && !html) {
      plain = decodeBodyText(raw)
      if (shouldIgnoreAsBody(plain)) plain = ''
    }
  }
  return { textPlain: plain, textHtml: html }
}

function sendImapId(imap: any): Promise<void> {
  return new Promise((resolve) => {
    const idStr = '("NAME" "MailDesk" "VERSION" "1.0.0" "VENDOR" "MailDesk Team")'
    log.info('[IMAP] Sending ID command for 163 compatibility')
    imap._enqueue(`ID ${idStr}`, (err: Error | null) => {
      if (err) {
        log.warn('[IMAP] ID command failed (non-fatal):', err.message)
        imapDebug('id-command:error', { error: err.message })
      } else {
        imapDebug('id-command:success')
      }
      resolve()
    })
  })
}

async function diagnoseImapEndpoint(host: string, port: number): Promise<{ resolved?: string[]; preferredHost?: string; tcp?: string; warning?: string }> {
  const result: { resolved?: string[]; preferredHost?: string; tcp?: string; warning?: string } = {}
  try {
    const resolved = await dns.promises.lookup(host, { all: true })
    result.resolved = resolved.map((item) => item.address)
    result.preferredHost = resolved.find((item) => item.family === 4)?.address || resolved[0]?.address
  } catch (err: any) {
    result.warning = `DNS 解析失败: ${err?.message || String(err)}`
    return result
  }

  const probeHost = result.preferredHost || host
  await new Promise<void>((resolve) => {
    const socket = net.createConnection({ host: probeHost, port })
    const timer = setTimeout(() => {
      result.tcp = `TCP 连接超时 (${probeHost}:${port})`
      socket.destroy()
      resolve()
    }, 5000)

    socket.once('connect', () => {
      clearTimeout(timer)
      result.tcp = `TCP 连接成功 (${probeHost}:${port})`
      socket.end()
      resolve()
    })

    socket.once('error', (err: Error & { code?: string }) => {
      clearTimeout(timer)
      result.tcp = `TCP 连接失败: ${err.code || ''} ${err.message}`.trim()
      resolve()
    })
  })

  return result
}

export async function testAccountConnection(config: any): Promise<{ success: boolean; error?: string }> {
  imapDebug('test-connection:start', { host: config.imap_host, port: config.imap_port, user: config.imap_user, tls: !!config.imap_use_tls })
  if (!config.imap_host || !config.imap_host.trim()) return { success: false, error: 'IMAP 服务器地址不能为空' }
  if (!config.imap_user || !config.imap_user.trim()) return { success: false, error: '用户名不能为空' }
  if (!config.imap_password) return { success: false, error: '密码/授权码不能为空' }

  const port = config.imap_port || 993
  const endpoint = await diagnoseImapEndpoint(config.imap_host, port)
  if (endpoint.warning) {
    imapDebug('test-connection:dns-failed', endpoint)
    return { success: false, error: endpoint.warning }
  }
  imapDebug('test-connection:endpoint', endpoint)
  if (endpoint.tcp && endpoint.tcp.includes('超时')) {
    return { success: false, error: endpoint.tcp }
  }

  return new Promise((resolve) => {
    const imap = new Imap({ user: config.imap_user, password: config.imap_password, host: endpoint.preferredHost || config.imap_host, port, tls: !!config.imap_use_tls, tlsOptions: { rejectUnauthorized: false, servername: config.imap_host, minVersion: 'TLSv1.2' }, connTimeout: 30000, authTimeout: 30000 })
    imap.once('ready', () => { sendImapId(imap).then(() => { imap.openBox('INBOX', false, (err) => { if (err) { imap.end(); resolve({ success: false, error: err.message }) } else { imap.end(); resolve({ success: true }) } }) }) })
    imap.once('error', (err: Error) => resolve({ success: false, error: `${err.message}${endpoint.tcp ? `；${endpoint.tcp}` : ''}` }))
    imap.connect()
  })
}

export async function connectImap(accountConfig: any): Promise<Imap> {
  imapDebug('connect:start', { accountId: accountConfig.id, email: accountConfig.email, host: accountConfig.imap_host, port: accountConfig.imap_port, tls: !!accountConfig.imap_use_tls, user: accountConfig.imap_user })
  const port = accountConfig.imap_port || 993
  const endpoint = await diagnoseImapEndpoint(accountConfig.imap_host, port)
  imapDebug('connect:endpoint', { ...endpoint, accountId: accountConfig.id, host: accountConfig.imap_host, port })
  if (endpoint.warning) {
    throw new Error(endpoint.warning)
  }

  return new Promise((resolve, reject) => {
    const imap = new Imap({ user: accountConfig.imap_user, password: accountConfig.imap_password, host: endpoint.preferredHost || accountConfig.imap_host, port, tls: !!accountConfig.imap_use_tls, tlsOptions: { rejectUnauthorized: false, servername: accountConfig.imap_host, minVersion: 'TLSv1.2' }, connTimeout: 30000, authTimeout: 30000 })
    imap.once('ready', () => { sendImapId(imap).then(() => resolve(imap)).catch(() => resolve(imap)) })
    imap.once('error', (err: Error) => reject(new Error(`${err.message}${endpoint.tcp ? `；${endpoint.tcp}` : ''}`)))
    imap.connect()
  })
}

export async function fetchFolderList(imap: Imap, accountId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    imap.getBoxes('', (err: Error | null, boxes: any) => {
      if (err) return reject(err)
      const db = getDb()
      const processBoxes = (boxObj: any, parentPath: string, parentId: string) => {
        for (const [name, box] of Object.entries(boxObj || {})) {
          const b = box as any
          const fullPath = parentPath ? `${parentPath}${name}` : name
          const folderType = inferFolderType(name, b)
          upsertFolder(db, accountId, fullPath, name, fullPath, parentId, folderType)
          if (b.children) processBoxes(b.children, fullPath, fullPath)
        }
      }
      try { processBoxes(boxes, '', ''); saveDatabase(); resolve() } catch (e) { reject(e) }
    })
  })
}

function inferFolderType(name: string, box: any): string {
  const lower = name.toLowerCase()
  if (lower === 'inbox') return 'inbox'
  if (lower === 'sent' || lower === '已发送') return 'sent'
  if (lower === 'drafts' || lower === '草稿') return 'drafts'
  if (lower === 'trash' || lower === '已删除') return 'trash'
  if (lower === 'spam' || lower === '垃圾邮件') return 'spam'
  return 'mail'
}

function upsertFolder(db: any, accountId: number, remoteId: string, name: string, fullPath: string, parentId: string, folderType: string): void {
  db.prepare(`
    INSERT INTO folders (account_id, remote_id, name, path, parent_remote_id, type, subscribed)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(account_id, remote_id) DO UPDATE SET
      name=excluded.name,
      path=excluded.path,
      parent_remote_id=excluded.parent_remote_id,
      type=excluded.type,
      subscribed=1
  `).run(accountId, remoteId, name, fullPath, parentId, folderType)
}

export async function syncEmails(imap: Imap, accountId: number, folderId: number, onProgress?: (p: number) => void): Promise<number> {
  const db = getDb()
  const folder = db.prepare('SELECT * FROM folders WHERE id=?').get(folderId) as any
  if (!folder) return 0

  return new Promise((resolve, reject) => {
    imap.openBox(folder.path === 'INBOX' ? 'INBOX' : folder.path, false, (err: Error | null) => {
      if (err) return reject(err)
      imap.search(['ALL'], (searchErr: Error | null, uids: number[]) => {
        if (searchErr) return reject(searchErr)
        if (!uids?.length) return resolve(0)
        let count = 0
        const fetcher = imap.fetch(uids, { bodies: '', struct: true })
        fetcher.on('message', (msg: any, seqno: number) => {
          msg.on('body', (stream: any) => {
            const chunks: Buffer[] = []
            stream.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
            stream.once('end', async () => {
              try {
                const raw = Buffer.concat(chunks)
                const parsed = await simpleParser(raw)
                const { textPlain, textHtml } = pickReadableText(parsed, raw.toString('binary'))
                const subject = decodeHeaderValue(String(parsed.subject || '(无主题)'))
                const fromEmail = parsed.from?.value?.[0]?.address || parsed.from?.text || ''
                const fromName = decodeHeaderValue(parsed.from?.value?.[0]?.name || parsed.from?.text || '')
                const toList = JSON.stringify(parsed.to?.value?.map((v: any) => v.address) || [])
                const ccList = JSON.stringify(parsed.cc?.value?.map((v: any) => v.address) || [])
                const bccList = JSON.stringify(parsed.bcc?.value?.map((v: any) => v.address) || [])
                const messageId = parsed.messageId || ''
                const existingEmail = db.prepare('SELECT id FROM emails WHERE account_id=? AND folder_id=? AND uid=?').get(accountId, folderId, msg.uid || seqno) as any
                const duplicateByMeta = db.prepare(`
                  SELECT id FROM emails
                  WHERE account_id=?
                    AND folder_id=?
                    AND COALESCE(NULLIF(message_id,''), '')=?
                    AND COALESCE(NULLIF(subject,''), '')=?
                    AND COALESCE(date / 86400, 0)=COALESCE(? / 86400, 0)
                  ORDER BY is_read ASC, is_starred DESC, is_sent DESC, created_at ASC, id ASC LIMIT 1
                `).get(accountId, folderId, messageId || '', subject || '', Math.floor((parsed.date?.getTime?.() || Date.now()) / 1000)) as any
                const inserted = existingEmail ? { lastInsertRowid: existingEmail.id } : duplicateByMeta ? { lastInsertRowid: duplicateByMeta.id } : db.prepare(`INSERT INTO emails (account_id, folder_id, uid, message_id, in_reply_to, references_id, subject, from_name, from_email, to_list, cc_list, bcc_list, date, size, has_attachments, is_read, is_starred, is_draft, is_sent, priority, snippet, body_fetched) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                  .run(accountId, folderId, msg.uid || seqno, messageId, parsed.inReplyTo || '', Array.isArray(parsed.references) ? parsed.references.join(' ') : '', subject, fromName, fromEmail, toList, ccList, bccList, Math.floor((parsed.date?.getTime?.() || Date.now()) / 1000), raw.length, parsed.attachments?.length ? 1 : 0, 0, 0, 0, folder.type === 'sent' ? 1 : 0, 'normal', textPlain.slice(0, 150), (textPlain || textHtml) ? 1 : 0)
                const emailId = Number(inserted.lastInsertRowid || existingEmail?.id || duplicateByMeta?.id || 0)
                if (emailId && (textPlain || textHtml)) {
                  db.prepare('INSERT OR REPLACE INTO email_bodies (email_id, text_html, text_plain, fetched_at) VALUES (?, ?, ?, unixepoch())').run(emailId, textHtml, textPlain)
                }
                db.prepare('UPDATE emails SET message_id=COALESCE(NULLIF(message_id, \'\'), ?), body_fetched=?, snippet=COALESCE(NULLIF(snippet, \'\'), ?) WHERE account_id=? AND folder_id=? AND uid=?')
                  .run(messageId || `local-${accountId}-${folderId}-${msg.uid || seqno}`, (textPlain || textHtml) ? 1 : 0, textPlain.slice(0, 150), accountId, folderId, msg.uid || seqno)
                count++
                if (onProgress) onProgress(Math.round((count / uids.length) * 100))
              } catch (e) {
                imapDebug('emails:parse:error', { accountId, folderId, error: (e as any)?.message || String(e) })
              }
            })
          })
        })
        fetcher.once('error', reject)
        fetcher.once('end', async () => { saveDatabase(); resolve(count) })
      })
    })
  })
}

export async function fetchEmailBody(imap: Imap, accountId: number, uid: number, folderPath: string): Promise<{ textHtml: string; textPlain: string }> {
  imapDebug('body:fetch:start', { accountId, uid, folderPath })
  const db = getDb()
  return new Promise((resolve) => {
    imap.openBox(folderPath === 'INBOX' ? 'INBOX' : folderPath, false, (openErr: Error | null) => {
      if (openErr) return resolve({ textHtml: '', textPlain: '' })
      const cached = db.prepare('SELECT * FROM email_bodies WHERE email_id=(SELECT id FROM emails WHERE account_id=? AND folder_id=(SELECT id FROM folders WHERE path=? LIMIT 1) AND uid=? LIMIT 1)').get(accountId, folderPath, uid) as any
      if (cached?.text_plain || cached?.text_html) {
        resolve({ textHtml: cached.text_html || '', textPlain: cached.text_plain || '' })
        return
      }
      const fetcher = imap.fetch(uid, { bodies: '', struct: true })
      collectBuffer(fetcher as any)
        .then(async (raw) => {
          try {
            const parsed = await simpleParser(raw)
            const { textPlain, textHtml } = pickReadableText(parsed, raw.toString('binary'))
            const email = db.prepare('SELECT id FROM emails WHERE account_id=? AND folder_id=(SELECT id FROM folders WHERE path=? LIMIT 1) AND uid=? LIMIT 1').get(accountId, folderPath, uid) as any
            if (email?.id) {
              db.prepare('INSERT OR REPLACE INTO email_bodies (email_id, text_html, text_plain) VALUES (?, ?, ?)').run(email.id, textHtml, textPlain)
            }
            resolve({ textHtml, textPlain })
          } catch {
            resolve({ textHtml: '', textPlain: '' })
          }
        })
        .catch(() => resolve({ textHtml: '', textPlain: '' }))
    })
  })
}

export async function getUnreadCount(accountId: number): Promise<number> {
  const db = getDb()
  const result = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE account_id=? AND is_read=0`).get(accountId) as any
  return result?.c || 0
}
