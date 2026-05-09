import React, { useEffect, useState, useCallback } from 'react'
import { Button, Spin, Dropdown, Tooltip, message, Tabs, Modal, Space, Divider } from 'antd'
import {
  RetweetOutlined, SwapLeftOutlined, ForwardOutlined,
  DeleteOutlined, StarOutlined, StarFilled, PrinterOutlined,
  DownOutlined, MoreOutlined, TagOutlined, MailOutlined,
  DownloadOutlined, RollbackOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons'
import DOMPurify from 'dompurify'
import { useAppStore } from '../stores/appStore'
import type { Email, EmailBody, Attachment } from '../types'

export default function EmailPreview() {
  const {
    selectedEmailId, emails, setEmails,
    folders, accounts, selectedFolderId,
    setReplyToEmail, setComposeVisible,
  } = useAppStore()

  const [email, setEmail] = useState<Email | null>(null)
  const [body, setBody] = useState<EmailBody | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [htmlView, setHtmlView] = useState(true)

  const loadEmail = useCallback(async (id: number) => {
    setLoading(true)
    try {
      const [emailData, bodyData, attData] = await Promise.all([
        window.electronAPI.email.getById(id),
        window.electronAPI.email.getBody(id),
        window.electronAPI.email.getAttachments(id),
      ])

      if (emailData) {
        // Also fetch full body if not yet cached
        if (!bodyData || !bodyData.text_html) {
          const fullBody = await window.electronAPI.email.getBody(id)
          setBody(fullBody)
        } else {
          setBody(bodyData)
        }
        setEmail(emailData)
        setAttachments(attData || [])
      }
    } catch (err) {
      console.error('Failed to load email:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedEmailId) {
      const found = emails.find((e: Email) => e.id === selectedEmailId)
      if (found) {
        setEmail(found)
        setBody(null)
        setAttachments([])
        loadEmail(selectedEmailId)
      }
    } else {
      setEmail(null)
      setBody(null)
      setAttachments([])
    }
  }, [selectedEmailId])

  const handleReply = (replyAll: boolean) => {
    if (email) {
      setReplyToEmail(email)
      setComposeVisible(true)
    }
  }

  const handleForward = () => {
    if (email) {
      setReplyToEmail({ ...email, id: -1 } as any)
      setComposeVisible(true)
    }
  }

  const handleStar = async () => {
    if (!email) return
    const newStarred = email.is_starred ? 0 : 1
    await window.electronAPI.email.setStar([email.id], !!newStarred)
    setEmail({ ...email, is_starred: newStarred })
    const updated = emails.map((e: Email) =>
      e.id === email.id ? { ...e, is_starred: newStarred } : e
    )
    setEmails(updated)
    message.success(newStarred ? '已标记星标' : '已取消星标')
  }

  const handleDelete = async () => {
    if (!email) return
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: '确定要删除这封邮件吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        await window.electronAPI.email.delete([email.id])
        const updated = emails.filter((e: Email) => e.id !== email.id)
        setEmails(updated)
        useAppStore.getState().setSelectedEmailId(null)
        message.success('已删除')
      },
    })
  }

  const handleMove = async (folderId: number) => {
    if (!email) return
    await window.electronAPI.email.move([email.id], folderId)
    const updated = emails.filter((e: Email) => e.id !== email.id)
    setEmails(updated)
    useAppStore.getState().setSelectedEmailId(null)
    message.success('已移动')
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getEmailContent = (): { html: string; text: string } => {
    if (!body) return { html: '', text: '' }

    const html = body.text_html || ''
    const text = body.text_plain || ''

    if (htmlView && html) {
      const cleanHtml = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'em', 'strong', 'a', 'img', 'blockquote',
          'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td', 'th',
          'div', 'span', 'pre', 'code', 'hr'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel'],
      })
      return { html: cleanHtml, text }
    }

    return { html: '', text: text || '' }
  }

  const renderEmailHeader = () => {
    if (!email) return null

    const fromDisplay = email.from_name
      ? `${email.from_name} <${email.from_email}>`
      : email.from_email

    const toList: any[] = JSON.parse(email.to_list || '[]')
    const ccList: any[] = JSON.parse(email.cc_list || '[]')

    return (
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold mb-3 leading-snug">{email.subject || '(无主题)'}</h2>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium flex-shrink-0">
            {(email.from_name || email.from_email)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{email.from_name || email.from_email.split('@')[0]}</span>
                <span className="text-gray-500 text-sm ml-2">&lt;{email.from_email}&gt;</span>
              </div>
              <span className="text-xs text-gray-400">{formatDate(email.date)}</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-0.5">
              <div><span className="text-gray-400">收件人：</span>{toList.join(', ')}</div>
              {ccList.length > 0 && (
                <div><span className="text-gray-400">抄送：</span>{ccList.join(', ')}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderEmailActions = () => {
    if (!email) return null

    const folderOptions = folders
      .filter((f: any) => f.id !== selectedFolderId && f.account_id === email.account_id)
      .map((f: any) => ({ key: f.id, label: f.name }))

    return (
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <Tooltip title="回复">
          <Button size="small" icon={<RetweetOutlined />} onClick={() => handleReply(false)}>回复</Button>
        </Tooltip>
        <Tooltip title="回复全部">
          <Button size="small" icon={<SwapLeftOutlined />} onClick={() => handleReply(true)}>回复全部</Button>
        </Tooltip>
        <Tooltip title="转发">
          <Button size="small" icon={<ForwardOutlined />} onClick={handleForward}>转发</Button>
        </Tooltip>
        <Divider type="vertical" />
        <Tooltip title={email.is_starred ? '取消星标' : '标记星标'}>
          <Button
            size="small"
            icon={email.is_starred ? <StarFilled style={{ color: '#eab308' }} /> : <StarOutlined />}
            onClick={handleStar}
          />
        </Tooltip>
        <Dropdown menu={{ items: folderOptions, onClick: ({ key }) => handleMove(Number(key)) }}>
          <Button size="small" icon={<RollbackOutlined />}>移动</Button>
        </Dropdown>
        <Tooltip title="删除">
          <Button size="small" danger icon={<DeleteOutlined />} onClick={handleDelete} />
        </Tooltip>
        <div className="flex-1" />
        <Dropdown
          menu={{
            items: [
              { key: 'print', label: '打印', icon: <PrinterOutlined />, onClick: () => window.print() },
              { key: 'raw', label: '查看原文', icon: <MailOutlined /> },
            ]
          }}
        >
          <Button size="small" icon={<MoreOutlined />} />
        </Dropdown>
      </div>
    )
  }

  const renderAttachments = () => {
    if (attachments.length === 0) return null

    return (
      <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700">
        <div className="text-sm font-medium mb-2 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400">
            <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-1.38-1.12-2.5-2.5-2.5S10 3.62 10 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-4.5z"/>
          </svg>
          附件 ({attachments.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {attachments.map((att: Attachment) => (
            <div
              key={att.id}
              className="attachment-chip"
              onClick={async () => {
                const result = await window.electronAPI.email.downloadAttachment(att.id)
                if (result.success) message.success('下载完成')
              }}
            >
              <MailOutlined />
              <span className="font-medium">{att.filename}</span>
              <span className="text-gray-400">({formatFileSize(att.size)})</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!selectedEmailId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <MailOutlined style={{ fontSize: 48 }} />
          <p className="mt-2 text-sm">选择一封邮件查看详情</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="large" />
      </div>
    )
  }

  const { html, text } = getEmailContent()

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {renderEmailActions()}
      {renderEmailHeader()}

      {/* View toggle */}
      {html && text && (
        <div className="px-4 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
          <Tabs
            size="small"
            activeKey={htmlView ? 'html' : 'text'}
            onChange={(key) => setHtmlView(key === 'html')}
            items={[
              { key: 'html', label: '富文本' },
              { key: 'text', label: '纯文本' },
            ]}
            style={{ marginBottom: 0 }}
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {htmlView && html ? (
          <div
            className="email-body"
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
              lineHeight: 1.8,
              wordBreak: 'break-word',
              fontSize: 14,
            }}
          />
        ) : text ? (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed" style={{ fontFamily: 'inherit' }}>
            {text}
          </pre>
        ) : (
          <div className="text-gray-400 text-center mt-8">
            <p>邮件正文加载中...</p>
            <Button type="link" onClick={() => loadEmail(selectedEmailId!)}>
              重新加载
            </Button>
          </div>
        )}
      </div>

      {renderAttachments()}
    </div>
  )
}
