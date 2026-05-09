import React, { useState, useRef, useEffect } from 'react'
import { Modal, Input, Button, Dropdown, Space, Upload, message, Tabs, Tooltip } from 'antd'
import {
  CloseOutlined, SendOutlined, SaveOutlined, PaperClipOutlined,
  DownOutlined, BgColorsOutlined, LinkOutlined, PictureOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import type { Email } from '../types'

const { TextArea } = Input

interface ComposeProps {
  onClose: () => void
  replyTo?: Email | null
}

export default function Compose({ onClose, replyTo }: ComposeProps) {
  const { accounts, folders, setAccounts, setFolders } = useAppStore()

  const [activeTab, setActiveTab] = useState('compose')
  const [fromAccountId, setFromAccountId] = useState<number>(accounts[0]?.id || 0)
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [draftId, setDraftId] = useState<number | null>(null)
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (replyTo) {
      if ((replyTo as any).id === -1) {
        // Forward
        setSubject(`转发: ${replyTo.subject}`)
        setBody(`\n\n--- 转发的邮件 ---\n发件人: ${replyTo.from_name || replyTo.from_email}\n主题: ${replyTo.subject}\n日期: ${new Date(replyTo.date * 1000).toLocaleString()}\n\n`)
      } else {
        // Reply
        const replyPrefix = replyTo.from_email
        if (to) {
          setTo(prev => prev ? `${prev}, ${replyPrefix}` : replyPrefix)
        } else {
          setTo(replyPrefix)
        }
        const reSubject = replyTo.subject?.startsWith('Re:')
          ? replyTo.subject
          : `Re: ${replyTo.subject || ''}`
        setSubject(reSubject)
        setBody(`\n\n--- 原邮件 ---\n发件人: ${replyTo.from_name || ''} <${replyTo.from_email}>\n日期: ${new Date(replyTo.date * 1000).toLocaleString()}\n主题: ${replyTo.subject}\n\n`)
      }
      setFromAccountId(replyTo.account_id)
    }
  }, [replyTo])

  useEffect(() => {
    editorRef.current?.focus()
  }, [])

  const handleSend = async () => {
    if (!fromAccountId) {
      message.error('请选择发送账户')
      return
    }
    if (!to.trim()) {
      message.error('请输入收件人')
      return
    }

    setSending(true)
    try {
      const toList = to.split(/[,;]/).map(s => s.trim()).filter(Boolean)
      const ccList = cc.split(/[,;]/).map(s => s.trim()).filter(Boolean)
      const bccList = bcc.split(/[,;]/).map(s => s.trim()).filter(Boolean)

      const result = await window.electronAPI.email.send({
        accountId: fromAccountId,
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject: subject || '(无主题)',
        body,
        isHtml: false,
        inReplyTo: replyTo?.message_id,
        references: replyTo?.references_id,
        draftId: draftId || undefined,
      })

      if (result.success) {
        message.success('发送成功')
        onClose()
      } else {
        message.error(`发送失败: ${result.error}`)
      }
    } catch (err: any) {
      message.error(`发送失败: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!fromAccountId) return

    try {
      const toList = to.split(/[,;]/).map(s => s.trim()).filter(Boolean)
      const ccList = cc.split(/[,;]/).map(s => s.trim()).filter(Boolean)
      const bccList = bcc.split(/[,;]/).map(s => s.trim()).filter(Boolean)

      const result = await window.electronAPI.email.saveDraft({
        accountId: fromAccountId,
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject: subject || '(无主题)',
        body,
        draftId: draftId || undefined,
      })

      if (result.success) {
        setDraftId(result.draftId!)
        message.success('草稿已保存')
      }
    } catch (err) {
      message.error('保存失败')
    }
  }

  const handleAttach = async () => {
    // File attachment via input[type=file]
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = () => {
      if (input.files) {
        message.info(`已选择 ${input.files.length} 个文件`)
      }
    }
    input.click()
  }

  return (
    <Modal
      open
      width={720}
      height={600}
      title={null}
      footer={null}
      closable={false}
      maskClosable={false}
      centered
      className="compose-modal"
      styles={{
        body: { padding: 0, height: '70vh', display: 'flex', flexDirection: 'column' },
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <span className="font-medium">新建邮件</span>
        <div className="flex items-center gap-1">
          <Tooltip title="保存草稿">
            <Button size="small" icon={<SaveOutlined />} onClick={handleSaveDraft} />
          </Tooltip>
          <Tooltip title="关闭">
            <Button size="small" icon={<CloseOutlined />} onClick={onClose} />
          </Tooltip>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-sm">
        <span className="text-gray-500">发件人：</span>
        <Dropdown
          menu={{
            items: accounts.map((a: any) => ({
              key: a.id,
              label: a.email,
              onClick: () => setFromAccountId(a.id),
            })),
          }}
          trigger={['click']}
        >
          <Button size="small">
            {accounts.find((a: any) => a.id === fromAccountId)?.email || '选择账户'}
            <DownOutlined style={{ fontSize: 10 }} />
          </Button>
        </Dropdown>

        <div className="flex items-center gap-1 flex-1 ml-4">
          <span className="text-gray-500">收件人：</span>
          <Input
            size="small"
            placeholder="多个地址用逗号分隔"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ flex: 1 }}
            className="dark:bg-gray-700 dark:border-gray-600"
          />
          <Button size="small" type="text" onClick={() => setShowCc(!showCc)}>抄送</Button>
          <Button size="small" type="text" onClick={() => setShowBcc(!showBcc)}>密送</Button>
        </div>
      </div>

      {showCc && (
        <div className="flex items-center gap-1 px-4 py-1 border-b border-gray-200 dark:border-gray-700 text-sm">
          <span className="text-gray-500 w-14">抄送：</span>
          <Input
            size="small"
            placeholder="多个地址用逗号分隔"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            className="dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
      )}

      {showBcc && (
        <div className="flex items-center gap-1 px-4 py-1 border-b border-gray-200 dark:border-gray-700 text-sm">
          <span className="text-gray-500 w-14">密送：</span>
          <Input
            size="small"
            placeholder="多个地址用逗号分隔"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            className="dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
      )}

      {/* Subject */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-gray-500">主题：</span>
        <Input
          size="small"
          placeholder="输入邮件主题"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 dark:bg-gray-700 dark:border-gray-600"
        />
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <TextArea
          ref={editorRef as any}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="写邮件..."
          autoSize={{ minRows: 12, maxRows: 999 }}
          style={{
            height: '100%',
            border: 'none',
            resize: 'none',
            fontSize: 14,
            lineHeight: 1.8,
          }}
          className="px-4 py-3 dark:bg-gray-900"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Tooltip title="添加附件">
            <Button size="small" icon={<PaperClipOutlined />} onClick={handleAttach}>附件</Button>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={handleSend}>
            发送
          </Button>
        </div>
      </div>
    </Modal>
  )
}
