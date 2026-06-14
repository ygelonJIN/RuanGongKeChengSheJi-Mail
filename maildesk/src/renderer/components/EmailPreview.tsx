import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, Space, Tag, Typography, message, Segmented, Drawer } from 'antd'
import { CompassOutlined, StarFilled, StarOutlined, DeleteOutlined, MailOutlined, DownloadOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import { refreshMailList } from '../utils/mailRefresh'

const { Title, Text, Paragraph } = Typography

type BodyViewMode = 'smart' | 'plain' | 'html' | 'raw'

function decodeMimeWord(input: string) {
  if (!input) return ''
  return input.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_match, charset, encoding, content) => {
    try {
      const cs = String(charset).toLowerCase().replace(/[^a-z0-9_-]/g, '')
      if (String(encoding).toUpperCase() === 'B') {
        const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
        return new TextDecoder(cs).decode(bytes)
      }
      const qp = content.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
      return new TextDecoder(cs).decode(Uint8Array.from(qp, (c) => c.charCodeAt(0)))
    } catch {
      return input
    }
  })
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractHtmlBody(html: string) {
  if (!html) return ''
  const withoutCss = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
  try {
    const doc = new DOMParser().parseFromString(withoutCss, 'text/html')
    doc.querySelectorAll('style, script, noscript').forEach((el) => el.remove())
    const bodyText = doc.body?.innerText?.trim() || doc.body?.textContent?.trim() || ''
    if (bodyText) return bodyText
    const docText = doc.documentElement?.innerText?.trim() || doc.documentElement?.textContent?.trim() || ''
    if (docText) return docText
    return stripHtml(withoutCss)
  } catch {
    return stripHtml(withoutCss)
  }
}

function looksLikeCssOnly(text: string) {
  const s = text.trim()
  if (!s) return true
  if (/^@media\b/i.test(s)) return true
  if (/^\s*[.#]?[a-z0-9_-]+\s*\{[^}]*\}$/is.test(s.slice(0, 800))) return true
  return false
}

function extractBodyText(input: string) {
  if (!input) return ''
  const normalized = input.replace(/\r\n/g, '\n')
  const candidate = normalized.split(/\n\n/).slice(1).join('\n\n') || normalized
  return candidate.split('\n').filter((line) => !/^(date|from|subject|message-id|to|cc|bcc):/i.test(line.trim())).join('\n').trim()
}

export default function EmailPreview() {
  const { emails, selectedEmailId, emailBody, setEmailBody, setDebug, bumpMailChangeTick } = useAppStore()
  const selectedMail = emails.find((mail) => mail.id === selectedEmailId) ?? emails[0]
  const [loadingBody, setLoadingBody] = useState(false)
  const [attachments, setAttachments] = useState<any[]>([])
  const [mode, setMode] = useState<BodyViewMode>('smart')
  const [panel, setPanel] = useState<'info' | 'attachments' | 'raw' | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!selectedMail || !window.electronAPI) return
      setLoadingBody(true)
      try {
        const [body, atts] = await Promise.all([
          window.electronAPI.email.getBody(selectedMail.id),
          window.electronAPI.email.getAttachments(selectedMail.id).catch(() => []),
        ])
        if (!cancelled) {
          setEmailBody(body)
          setAttachments(atts || [])
          setDebug({
            bodyRawBytes: body?.rawBytes || 0,
            bodySubject: body?.subject || '',
            bodyTextLength: (body?.text_plain || '').length,
            bodyHtmlLength: (body?.text_html || '').length,
            bodyParts: body?.parts || 0,
          })
        }
      } catch {
        if (!cancelled) {
          setEmailBody(null)
          setAttachments([])
          setDebug({ bodyRawBytes: 0, bodySubject: '', bodyTextLength: 0, bodyHtmlLength: 0, bodyParts: 0 })
        }
      } finally {
        if (!cancelled) setLoadingBody(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedMail?.id, setEmailBody, setDebug])

  const setStar = async () => { if (!selectedMail) return; try { await window.electronAPI.email.setStar([selectedMail.id], !selectedMail.is_starred); await refreshMailList(); bumpMailChangeTick() } catch { message.error('星标操作失败') } }
  const markRead = async () => { if (!selectedMail) return; try { await window.electronAPI.email.setRead([selectedMail.id], true); await refreshMailList(); bumpMailChangeTick() } catch { message.error('标记已读失败') } }
  const trash = async () => { if (!selectedMail) return; try { await window.electronAPI.email.delete([selectedMail.id]); message.success('已移入垃圾箱'); await refreshMailList(); bumpMailChangeTick(); const next = useAppStore.getState().emails.find((mail) => mail.id !== selectedMail.id); if (next) useAppStore.getState().setSelectedEmailId(next.id); else useAppStore.getState().setSelectedEmailId(null) } catch { message.error('删除失败') } }
  const downloadAttachment = async (attachmentId: number) => {
    try { const result = await window.electronAPI.email.downloadAttachment(attachmentId); if (result?.success) message.success('附件已保存'); else message.error(result?.error || '下载失败') } catch { message.error('下载失败') }
  }

  const displaySubject = useMemo(() => decodeMimeWord(selectedMail?.subject || '(无主题)'), [selectedMail?.subject])
  const displayFrom = useMemo(() => decodeMimeWord(selectedMail?.from_name || selectedMail?.from_email || ''), [selectedMail?.from_name, selectedMail?.from_email])
  const rawPlain = emailBody?.text_plain || ''
  const rawHtml = emailBody?.text_html || ''
  const rawSnippet = selectedMail?.snippet || ''

  const displayBody = useMemo(() => {
    const plain = decodeMimeWord(extractBodyText(rawPlain))
    const html = decodeMimeWord(extractHtmlBody(rawHtml))
    const snippet = decodeMimeWord(extractBodyText(rawSnippet))
    const picked = plain || html || snippet || ''
    if (looksLikeCssOnly(picked)) return '暂无正文预览'
    return picked || '暂无正文预览'
  }, [rawPlain, rawHtml, rawSnippet])

  useEffect(() => {
    if (!selectedMail || !window.electronAPI || loadingBody) return
    if (displayBody === '暂无正文预览' && !emailBody) {
      window.electronAPI.email.getBody(selectedMail.id).then((body) => {
        if (!body) return
        setEmailBody(body)
        setDebug({
          bodyRawBytes: body?.rawBytes || 0,
          bodySubject: body?.subject || '',
          bodyTextLength: (body?.text_plain || '').length,
          bodyHtmlLength: (body?.text_html || '').length,
          bodyParts: body?.parts || 0,
        })
      }).catch(() => {})
    }
  }, [selectedMail?.id, displayBody, loadingBody, emailBody, setEmailBody, setDebug])

  const bodyStatusText = useMemo(() => {
    if (loadingBody) return '正文加载中，优先读取本地缓存...'
    if (emailBody?.text_plain || emailBody?.text_html) return '正文已从本地缓存读取'
    if (selectedMail?.body_fetched) return '正文已抓取，但当前内容为空'
    return '正文暂未缓存，正在自动尝试从 IMAP 获取'
  }, [loadingBody, emailBody?.text_plain, emailBody?.text_html, selectedMail?.body_fetched])

  const effectiveBody = useMemo(() => {
    const plain = decodeMimeWord(extractBodyText(rawPlain))
    const html = decodeMimeWord(extractHtmlBody(rawHtml))
    const snippet = decodeMimeWord(extractBodyText(rawSnippet))
    const candidate = plain || html || snippet || ''
    if (candidate && !looksLikeCssOnly(candidate)) return candidate
    return bodyStatusText
  }, [rawPlain, rawHtml, rawSnippet, bodyStatusText])

  const bodyContent = useMemo(() => {
    switch (mode) {
      case 'plain': return decodeMimeWord(rawPlain || effectiveBody)
      case 'html': return decodeMimeWord(extractHtmlBody(rawHtml || effectiveBody))
      case 'raw': return [rawPlain, rawHtml, rawSnippet].filter(Boolean).join('\n\n-----\n\n') || effectiveBody
      default: return effectiveBody
    }
  }, [mode, rawPlain, rawHtml, rawSnippet, effectiveBody])

  if (!selectedMail) return <section className="mail-preview-pane panel-surface preview-empty-shell"><Empty description="请选择一封邮件查看内容" style={{ margin: 'auto' }} /></section>

  const metaItems = [
    { children: `日期：${new Date(selectedMail.date * 1000).toLocaleString()}` },
    { children: `发件人：${displayFrom || '未知'}` },
    { children: `主题：${displaySubject}` },
    { children: `消息 ID：${selectedMail.message_id || '无'}` },
  ]

  return (
    <section className="mail-preview-pane panel-surface">
      <div className="pane-header">
        <div>
          <Text type="secondary">当前邮件</Text>
          <Title level={3} style={{ marginTop: 8 }}>{displaySubject}</Title>
          <Space wrap><Text strong>{displayFrom}</Text><Tag color="blue">{selectedMail.tags?.[0]?.name || '邮件'}</Tag><Tag color="geekblue">附件 {attachments.length}</Tag><Text type="secondary">{new Date(selectedMail.date * 1000).toLocaleString()}</Text></Space>
        </div>
        <Space><Button icon={selectedMail.is_starred ? <StarFilled /> : <StarOutlined />} onClick={setStar} /><Button icon={<MailOutlined />} onClick={markRead}>已读</Button><Button icon={<DeleteOutlined />} onClick={trash}>删除</Button><Button icon={<CompassOutlined />}>回复</Button></Space>
      </div>

      <Card className="panel-surface-strong preview-body-card" bordered={false} style={{ borderRadius: 24, margin: 20, marginBottom: 0 }}>
        <Space direction="vertical" size={12} style={{ width: '100%', minHeight: 0 }}>
          <Segmented value={mode} onChange={(value) => setMode(value as BodyViewMode)} options={[{ label: '智能', value: 'smart' }, { label: '纯文本', value: 'plain' }, { label: 'HTML', value: 'html' }, { label: '原始', value: 'raw' }]} />
          <div className="preview-body-scroll">
            <Text type="secondary">{bodyStatusText}</Text>
            <Paragraph style={{ fontSize: 16, lineHeight: 1.9, marginBottom: 0, whiteSpace: 'pre-wrap' }}>{loadingBody ? '正在加载正文...' : bodyContent}</Paragraph>
            {mode !== 'raw' && bodyContent.length > 0 && rawHtml && /@media|display:\s*none|position:\s*absolute|font-family/i.test(rawHtml) ? (
              <Text type="secondary">检测到邮件内容是营销/响应式 HTML，已自动提取可读正文。</Text>
            ) : null}
          </div>
        </Space>
      </Card>

      <Drawer open={panel !== null} onClose={() => setPanel(null)} width={320} title={panel === 'info' ? '邮件信息' : panel === 'attachments' ? '附件' : '原始内容'}>
        {panel === 'info' ? (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>{metaItems.map((item, index) => <div key={index} className="preview-mini-line"><span className="preview-mini-dot" /><Text>{item.children}</Text></div>)}</Space>
        ) : panel === 'attachments' ? (
          <Space direction="vertical" style={{ width: '100%' }} size={6}>{attachments.length === 0 ? <Text type="secondary">无附件</Text> : attachments.map((att) => <div key={att.id} className="attachment-row"><Text ellipsis style={{ minWidth: 0 }}>{att.filename}</Text><Button size="small" icon={<DownloadOutlined />} onClick={() => downloadAttachment(att.id)}>下载</Button></div>)}</Space>
        ) : (
          <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6 }}>{rawPlain || rawHtml || rawSnippet || '无原始内容'}</Paragraph>
        )}
      </Drawer>
    </section>
  )
}
