import nodemailer from 'nodemailer'
import { simpleParser } from 'mailparser'
import log from 'electron-log'
import { getDb } from '../database'

export async function sendEmail(data: {
  accountId: number
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  isHtml?: boolean
  attachments?: any[]
  inReplyTo?: string
  references?: string
  draftId?: number
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const db = getDb()
  const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(data.accountId) as any

  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_use_tls,
    auth: {
      user: account.smtp_user,
      pass: account.smtp_password,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
  } as any)

  const mailOptions = {
    from: `"${account.display_name || account.email}" <${account.smtp_user}>`,
    to: data.to.join(', '),
    cc: data.cc?.length ? data.cc.join(', ') : undefined,
    bcc: data.bcc?.length ? data.bcc.join(', ') : undefined,
    subject: data.subject,
    html: data.isHtml ? data.body : undefined,
    text: data.isHtml ? undefined : data.body,
    attachments: data.attachments?.map((att: any) => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
      cid: att.cid,
    })),
    inReplyTo: data.inReplyTo,
    references: data.references,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    log.info(`Email sent: ${info.messageId}`)

    // Save to Sent folder
    if (data.draftId) {
      db.prepare('DELETE FROM emails WHERE id=?').run(data.draftId)
    }

    // Record sent email in database
    const sentFolder = db.prepare(
      "SELECT * FROM folders WHERE account_id=? AND type='sent' LIMIT 1"
    ).get(data.accountId) as any

    if (sentFolder) {
      db.prepare(`
        INSERT INTO emails (account_id, folder_id, uid, message_id, subject, from_name, from_email, to_list, cc_list, bcc_list, date, is_sent, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), 1, 1)
      `).run(
        data.accountId, sentFolder.id, 0, info.messageId,
        data.subject, account.display_name || '', account.email,
        JSON.stringify(data.to), JSON.stringify(data.cc || []), JSON.stringify(data.bcc || [])
      )
    }

    transporter.close()
    return { success: true, messageId: info.messageId }
  } catch (err: any) {
    log.error('Failed to send email:', err)
    transporter.close()
    return { success: false, error: err.message }
  }
}

export async function saveDraft(data: {
  accountId: number
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  isHtml?: boolean
  attachments?: any[]
  draftId?: number
}): Promise<{ success: boolean; draftId?: number; error?: string }> {
  const db = getDb()

  const draftFolder = db.prepare(
    "SELECT * FROM folders WHERE account_id=? AND type='drafts' LIMIT 1"
  ).get(data.accountId) as any

  if (!draftFolder) {
    return { success: false, error: 'Draft folder not found' }
  }

  try {
    if (data.draftId) {
      db.prepare(`
        UPDATE emails SET subject=?, to_list=?, cc_list=?, bcc_list=?, snippet=?
        WHERE id=? AND folder_id=?
      `).run(
        data.subject, JSON.stringify(data.to || []), JSON.stringify(data.cc || []), JSON.stringify(data.bcc || []),
        (data.body || '').substring(0, 200), data.draftId, draftFolder.id
      )

      if (data.body) {
        db.prepare('INSERT OR REPLACE INTO email_bodies (email_id, text_html, text_plain) VALUES (?, ?, ?)')
          .run(data.draftId, data.isHtml ? data.body : '', data.isHtml ? '' : data.body)
      }

      return { success: true, draftId: data.draftId }
    } else {
      const result = db.prepare(`
        INSERT INTO emails (account_id, folder_id, uid, message_id, subject, from_name, from_email, to_list, cc_list, bcc_list, date, is_draft, is_read, snippet)
        VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, unixepoch(), 1, 1, ?)
      `).run(
        data.accountId, draftFolder.id, `draft-${Date.now()}`,
        data.subject, '', data.accountId,
        JSON.stringify(data.to || []), JSON.stringify(data.cc || []), JSON.stringify(data.bcc || []),
        (data.body || '').substring(0, 200)
      )

      const draftId = result.lastInsertRowid as number

      if (data.body) {
        db.prepare('INSERT OR REPLACE INTO email_bodies (email_id, text_html, text_plain) VALUES (?, ?, ?)')
          .run(draftId, data.isHtml ? data.body : '', data.isHtml ? '' : data.body)
      }

      return { success: true, draftId }
    }
  } catch (err: any) {
    log.error('Failed to save draft:', err)
    return { success: false, error: err.message }
  }
}
