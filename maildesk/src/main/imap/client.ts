import Imap from 'imap'
import { simpleParser } from 'mailparser'
import log from 'electron-log'
import { getDb, saveDatabase } from '../database'
import { shell } from 'electron'
import path from 'path'
import fs from 'fs'
import iconv from 'iconv-lite'

export async function testAccountConnection(config: any): Promise<{ success: boolean; error?: string }> {
  if (!config.imap_host || !config.imap_host.trim()) {
    return { success: false, error: 'IMAP 服务器地址不能为空' }
  }
  if (!config.imap_user || !config.imap_user.trim()) {
    return { success: false, error: '用户名不能为空' }
  }
  if (!config.imap_password) {
    return { success: false, error: '密码/授权码不能为空' }
  }

  return new Promise((resolve) => {
    const imap = new Imap({
      user: config.imap_user,
      password: config.imap_password,
      host: config.imap_host,
      port: config.imap_port || 993,
      tls: !!config.imap_use_tls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 15000,
    })

    imap.once('ready', () => {
      // Send ID command for 163/网易邮箱 compatibility
      const idStr = '("NAME" "MailDesk" "VERSION" "1.0.0" "VENDOR" "MailDesk Team")'
      ;(imap as any)._enqueue(`ID ${idStr}`, () => {})

      imap.openBox('INBOX', false, (err) => {
        if (err) {
          log.error('IMAP INBOX test failed:', err.message)
          imap.end()
          resolve({ success: false, error: err.message })
        } else {
          log.info('IMAP connection verified: INBOX accessible')
          imap.end()
          resolve({ success: true })
        }
      })
    })

    imap.once('error', (err: Error) => {
      log.error('IMAP connection test failed:', err.message)
      resolve({ success: false, error: err.message })
    })

    imap.connect()
  })
}

export async function connectImap(accountConfig: any): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: accountConfig.imap_user,
      password: accountConfig.imap_password,
      host: accountConfig.imap_host,
      port: accountConfig.imap_port || 993,
      tls: !!accountConfig.imap_use_tls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 15000,
    })

    imap.once('ready', () => {
      // 163/网易邮箱要求在 SELECT 之前发送 ID 命令 (RFC 2971)，否则返回 "Unsafe Login"
      sendImapId(imap).then(() => resolve(imap)).catch(reject)
    })
    imap.once('error', (err: Error) => {
      log.error(`IMAP connection error for ${accountConfig.email}:`, err.message)
      reject(err)
    })

    imap.connect()
  })
}

function sendImapId(imap: any): Promise<void> {
  return new Promise((resolve) => {
    const idStr = '("NAME" "MailDesk" "VERSION" "1.0.0" "VENDOR" "MailDesk Team")'
    log.info('[IMAP] Sending ID command for 163 compatibility')
    imap._enqueue(`ID ${idStr}`, (err: Error | null) => {
      if (err) {
        log.warn('[IMAP] ID command failed (non-fatal):', err.message)
      } else {
        log.info('[IMAP] ID command sent successfully')
      }
      resolve()
    })
  })
}

export async function fetchFolderList(imap: Imap, accountId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    imap.getBoxes('', (err: Error | null, boxes: any) => {
      if (err) {
        log.error('[fetchFolderList] getBoxes error:', err.message)
        reject(err)
        return
      }

      const db = getDb()
      let folderCount = 0
      const processBoxes = (boxObj: any, parentPath: string, parentId: string) => {
        for (const [name, box] of Object.entries(boxObj)) {
          const b = box as any
          const fullPath = parentPath ? `${parentPath}${name}` : name
          const folderType = inferFolderType(name, b)
          db.prepare(`
            INSERT OR REPLACE INTO folders (account_id, remote_id, name, path, parent_remote_id, type, subscribed)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(accountId, fullPath, name, fullPath, parentId, folderType, 1)
          log.info(`[fetchFolderList] Folder: name="${name}", path="${fullPath}", type="${folderType}"`)
          folderCount++
          if (b.children) {
            processBoxes(b.children, `${fullPath}`, fullPath)
          }
        }
      }

      try {
        processBoxes(boxes, '', '')
        saveDatabase()
        log.info(`[fetchFolderList] Total folders fetched for account ${accountId}: ${folderCount}`)
        resolve()
      } catch (e) {
        log.error('[fetchFolderList] error:', e)
        reject(e)
      }
    })
  })
}

function inferFolderType(name: string, box: any): string {
  const lower = name.toLowerCase()
  if (lower === 'inbox') return 'inbox'
  if (lower === '[gmail]/sent' || lower === 'sent' || lower === '已发送') return 'sent'
  if (lower === '[gmail]/drafts' || lower === 'drafts' || lower === '草稿') return 'drafts'
  if (lower === '[gmail]/trash' || lower === 'trash' || lower === '[gmail]/bin' || lower === '已删除') return 'trash'
  if (lower === '[gmail]/spam' || lower === 'spam' || lower === '垃圾邮件') return 'spam'
  if (lower === '[gmail]/starred' || lower === 'starred') return 'starred'
  if (lower === '[gmail]/important' || lower === 'important') return 'important'
  if (box.attribs?.includes('\\Sent')) return 'sent'
  if (box.attribs?.includes('\\Drafts')) return 'drafts'
  if (box.attribs?.includes('\\Trash')) return 'trash'
  if (box.attribs?.includes('\\Spam')) return 'spam'
  return 'mail'
}

export async function syncEmails(imap: Imap, accountId: number, folderId: number, onProgress?: (p: number) => void): Promise<number> {
  const db = getDb()

  const folder = db.prepare('SELECT * FROM folders WHERE id=?').get(folderId) as any
  if (!folder) return 0

  log.info(`[syncEmails] Starting sync for folder: id=${folderId}, name=${folder.name}, path=${folder.path}, type=${folder.type}`)

  return new Promise((resolve, reject) => {
    const mailboxPath = folder.path === 'INBOX' ? 'INBOX' : folder.path

    imap.openBox(mailboxPath, false, (err: Error | null) => {
      if (err) {
        log.error(`[syncEmails] Failed to open mailbox "${mailboxPath}":`, err.message)
        reject(err)
        return
      }

      log.info(`[syncEmails] Opened mailbox "${mailboxPath}"`)

      // imap.search() automatically prepends "UID " prefix, so ['ALL'] becomes "UID SEARCH ALL"
      imap.search(['ALL'], (searchErr: Error | null, uids: number[]) => {
        if (searchErr) {
          log.error(`[syncEmails] UID SEARCH failed:`, searchErr.message)
          imap.closeBox(true, () => {})
          reject(searchErr)
          return
        }

        if (!uids || uids.length === 0) {
          log.info(`[syncEmails] No messages found in "${mailboxPath}"`)
          imap.closeBox(true, () => {})
          resolve(0)
          return
        }

        log.info(`[syncEmails] Found ${uids.length} messages in "${mailboxPath}", fetching...`)

        // Fetch headers for all UIDs at once
        const fetcher = imap.fetch(uids, {
          bodies: 'HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES X-PRIORITY)',
          struct: true,
        })

        let count = 0

        fetcher.on('message', (msg: any, seqno: number) => {
          msg.on('body', (stream: any, info: any) => {
            let buffer = ''
            stream.on('data', (chunk: Buffer) => { buffer += chunk.toString('utf8') })
            stream.once('end', () => {
              try {
                const header = Imap.parseHeader(buffer)
                const uid = msg.uid || seqno
                const messageId = header['message-id']?.[0] || `local-${Date.now()}-${uid}`
                const subject = decodeSubject(header.subject?.[0] || '(无主题)')
                const fromEmail = header.from?.[0] || ''
                const fromName = extractName(header['from']?.[0] || '')
                const toList = JSON.stringify(header.to || [])
                const ccList = JSON.stringify(header.cc || [])
                const bccList = JSON.stringify(header.bcc || [])
                const date = header.date?.[0] ? new Date(header.date[0]).getTime() / 1000 : Math.floor(Date.now() / 1000)
                const priority = extractPriority(header)
                const flags = msg.flags || []
                const snippet = extractSnippet(buffer)

                db.prepare(`
                  INSERT OR REPLACE INTO emails
                  (account_id, folder_id, uid, message_id, in_reply_to, references_id, subject, from_name, from_email, to_list, cc_list, bcc_list, date, size, has_attachments, is_read, is_starred, is_draft, is_sent, priority, snippet)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  accountId, folderId, uid, messageId,
                  header['in-reply-to']?.[0] || '',
                  header.references?.[0] || '',
                  subject, fromName, fromEmail, toList, ccList, bccList, date, 0,
                  0, flags.includes('\\Seen') ? 1 : 0,
                  flags.includes('\\Flagged') ? 1 : 0,
                  flags.includes('\\Draft') ? 1 : 0,
                  folder.type === 'sent' ? 1 : 0,
                  priority, snippet
                )
                count++

                if (onProgress) {
                  onProgress(Math.round((count / uids.length) * 100))
                }
              } catch (e) {
                log.error('[syncEmails] Failed to parse email header:', e)
              }
            })
          })

          msg.once('attributes', (attrs: any) => {
            const hasAttachments = attrs.struct?.some((part: any) => {
              return part.disposition?.type?.toLowerCase() === 'attachment' ||
                (part.disposition?.type?.toLowerCase() === 'inline' && part.disposition?.attributes?.filename)
            })

            if (hasAttachments && attrs.struct) {
              const uid = attrs.uid || msg.uid || seqno
              db.prepare('UPDATE emails SET has_attachments=1 WHERE account_id=? AND folder_id=? AND uid=?')
                .run(accountId, folderId, uid)

              for (const part of attrs.struct) {
                if (part.disposition?.type?.toLowerCase() === 'attachment' ||
                    (part.disposition?.type?.toLowerCase() === 'inline' && part.disposition?.attributes?.filename)) {
                  const filename = part.disposition?.attributes?.filename ||
                    part.params?.name || `attachment_${part.partID}`
                  db.prepare(`
                    INSERT OR IGNORE INTO attachments (email_id, filename, content_type, size, part_id)
                    VALUES ((SELECT id FROM emails WHERE account_id=? AND folder_id=? AND uid=?), ?, ?, ?, ?)
                  `).run(accountId, folderId, uid, filename, part.type, part.length || 0, part.partID)
                }
              }
            }
          })
        })

        fetcher.once('error', (err: Error) => {
          log.error('[syncEmails] IMAP fetch error:', err)
          imap.closeBox(true, () => {})
          reject(err)
        })

        fetcher.once('end', () => {
          saveDatabase()
          imap.closeBox(true, () => {})
          log.info(`[syncEmails] Synced ${count}/${uids.length} emails for folder "${folder.name}"`)
          resolve(count)
        })
      })
    })
  })
}

function decodeSubject(str: string): string {
  try {
    const quotedPrintable = str.replace(/=\?([^\?]+)\?([BQ])\?([^\?]*)\?=/gi, (_, charset, encoding, text) => {
      try {
        if (encoding === 'B') {
          return Buffer.from(text, 'base64').toString(charset)
        } else if (encoding === 'Q') {
          return iconv.decode(Buffer.from(text.replace(/_/g, ' ')), charset)
        }
        return text
      } catch {
        return text
      }
    })

    const reEncoded = /=\?([^\?]+)\?([BQ])\?([^\?]*)\?=/gi
    let match
    let result = quotedPrintable
    while ((match = reEncoded.exec(quotedPrintable)) !== null) {
      try {
        const [full, charset, encoding, encoded] = match
        if (encoding === 'B') {
          const decoded = Buffer.from(encoded, 'base64').toString()
          result = result.replace(full, decoded)
        }
      } catch {
        // Keep original if decode fails
      }
    }

    return result || str
  } catch {
    return str
  }
}

function extractSnippet(buffer: string, maxLength: number = 150): string {
  try {
    let text = buffer
    text = text.replace(/=\r?\n/g, '')
    text = text.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    text = text.replace(/<[^>]+>/g, ' ')
    text = text.replace(/\s+/g, ' ').trim()
    return text.substring(0, maxLength)
  } catch {
    return ''
  }
}

function extractName(fromStr: string): string {
  const match = fromStr.match(/"([^"]+)"/)
  return match ? match[1] : fromStr.split('<')[0].trim().replace(/"/g, '')
}

function extractPriority(header: any): string {
  const xPriority = header['x-priority']?.[0]
  const priority = header.priority?.[0]

  if (xPriority === '1' || xPriority === '2' || priority === 'high') return 'high'
  if (xPriority === '5' || priority === 'low') return 'low'
  return 'normal'
}

export async function fetchEmailBody(imap: Imap, accountId: number, uid: number, folderPath: string): Promise<{ textHtml: string; textPlain: string }> {
  return new Promise((resolve) => {
    const mailboxPath = folderPath === 'INBOX' ? 'INBOX' : folderPath

    // Open the mailbox first so UID FETCH works
    imap.openBox(mailboxPath, false, (openErr: Error | null) => {
      if (openErr) {
        log.error('[fetchEmailBody] openBox failed:', openErr.message)
        resolve({ textHtml: '', textPlain: '' })
        return
      }

      const fetcher = imap.fetch(uid, { bodies: '' })
      let resolved = false

      fetcher.on('message', (msg: any) => {
        msg.on('body', (stream: any) => {
          let buffer = ''
          stream.on('data', (chunk: Buffer) => { buffer += chunk.toString('utf8') })
          stream.once('end', async () => {
            if (resolved) return
            resolved = true
            try {
              const parsed = await simpleParser(buffer)
              resolve({ textHtml: parsed.html as string || '', textPlain: parsed.text as string || '' })
            } catch {
              resolve({ textHtml: '', textPlain: '' })
            }
          })
        })
      })

      fetcher.once('error', () => { if (!resolved) { resolved = true; resolve({ textHtml: '', textPlain: '' }) } })
      fetcher.once('end', () => { if (!resolved) { resolved = true; resolve({ textHtml: '', textPlain: '' }) } })
    })
  })
}

export async function getUnreadCount(accountId: number): Promise<number> {
  const db = getDb()
  const result = db.prepare(`
    SELECT COUNT(*) as c FROM emails WHERE account_id=? AND is_read=0
  `).get(accountId) as any
  return result?.c || 0
}
