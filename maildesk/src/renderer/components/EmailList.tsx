import { useEffect, useMemo } from 'react'
import { Avatar, Button, Card, Empty, MenuProps, Space, Tag, Typography, Dropdown, message } from 'antd'
import { StarFilled, StarOutlined, DeleteOutlined, MoreOutlined, InboxOutlined, FolderOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import { refreshMailList } from '../utils/mailRefresh'

const { Title, Text } = Typography

export default function EmailList() {
  const { emails, selectedEmailId, setSelectedEmailId, folders, selectedFolderId, folderView, setEmails } = useAppStore()
  const title = useMemo(() => ({ inbox: '收件箱', starred: '星标', sent: '已发送', archive: '归档', trash: '垃圾箱', all: '全部邮件' }[folderView]), [folderView])
  const inboxFolder = folders.find((folder) => folder.type === 'inbox')
  const archiveFolder = folders.find((folder) => folder.type !== 'inbox' && folder.type !== 'sent' && folder.type !== 'trash')
  const trashFolder = folders.find((folder) => folder.type === 'trash')
  const sentFolder = folders.find((folder) => folder.type === 'sent')

  useEffect(() => {
    console.log('[MailDesk] list emails', { count: emails.length, selectedFolderId, folderView })
  }, [emails.length, selectedFolderId, folderView])

  const reload = refreshMailList

  useEffect(() => {
    reload().catch(() => {})
  }, [folderView, selectedFolderId])

  const toggleStar = async (mail: any, e: React.MouseEvent) => {
    e.stopPropagation()
    try { await window.electronAPI.email.setStar([mail.id], !mail.is_starred); await reload() } catch { message.error('星标操作失败') }
  }

  const markDelete = async (mail: any, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try { await window.electronAPI.email.delete([mail.id]); message.success('已移入垃圾箱'); await reload() } catch { message.error('删除失败') }
  }

  const moveToInbox = async (mail: any, e: React.MouseEvent) => {
    e.stopPropagation()
    try { await window.electronAPI.email.move([mail.id], inboxFolder?.id || mail.folder_id); message.success('已移回收件箱'); await reload() } catch { message.error('移动失败') }
  }

  const markArchive = async (mail: any, e: React.MouseEvent) => {
    e.stopPropagation()
    try { await window.electronAPI.email.move([mail.id], archiveFolder?.id || mail.folder_id); message.success('已归档'); await reload() } catch { message.error('归档失败') }
  }

  const markSent = async (mail: any, e: React.MouseEvent) => {
    e.stopPropagation()
    try { await window.electronAPI.email.move([mail.id], sentFolder?.id || mail.folder_id); message.success('已移动到已发送'); await reload() } catch { message.error('移动失败') }
  }

  const moveToTrash = async (mail: any, e: React.MouseEvent) => {
    e.stopPropagation()
    try { await window.electronAPI.email.move([mail.id], trashFolder?.id || mail.folder_id); message.success('已移入垃圾箱'); await reload() } catch { message.error('移动失败') }
  }

  const itemsFor = (mail: any): MenuProps['items'] => [
    { key: 'inbox', icon: <InboxOutlined />, label: '移回收件箱', onClick: () => moveToInbox(mail, {} as any) },
    { key: 'archive', icon: <FolderOutlined />, label: '归档', onClick: () => markArchive(mail, {} as any) },
    { key: 'sent', icon: <FolderOutlined />, label: '已发送', onClick: () => markSent(mail, {} as any) },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除', onClick: () => moveToTrash(mail, {} as any) },
  ]

  return (
    <section className="mail-list-pane panel-surface">
      <Space direction="vertical" size={12} style={{ width: '100%', padding: 20, overflow: 'auto', minHeight: 280 }}>
        <Text type="secondary">当前视图：{title}</Text>
        {emails.length === 0 ? (
          <Empty description={`暂无${title}`} style={{ minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }} />
        ) : emails.map((mail) => (
          <Card key={mail.id} bordered={false} className={`email-list-item panel-surface-strong ${selectedEmailId === mail.id ? 'selected' : ''}`} style={{ borderRadius: 22 }} onClick={() => setSelectedEmailId(mail.id)}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start">
              <Space align="start">
                <Avatar>{mail.from_name?.slice(0, 1) || 'M'}</Avatar>
                <div>
                  <Space>
                    <Text strong>{mail.from_name || mail.from_email}</Text>
                    {!mail.is_read ? <span className="unread-dot" /> : null}
                    <Button type="text" icon={mail.is_starred ? <StarFilled style={{ color: '#f5b301' }} /> : <StarOutlined />} onClick={(e) => toggleStar(mail, e)} />
                  </Space>
                  <Title level={5} style={{ margin: '6px 0 4px' }}>{mail.subject || '(无主题)'}</Title>
                  <Text type="secondary">{mail.snippet || (mail.body_fetched ? '正文已抓取，当前为空' : '暂无预览内容')}</Text>
                  {folderView === 'starred' ? <Tag color="gold">星标</Tag> : null}
                  {folderView === 'trash' ? <Tag color="red">垃圾箱</Tag> : null}
                  {folderView === 'sent' ? <Tag color="blue">已发送</Tag> : null}
                  {folderView === 'archive' ? <Tag color="green">归档</Tag> : null}
                </div>
              </Space>
              <div style={{ textAlign: 'right' }}>
                <Text type="secondary">{new Date(mail.date * 1000).toLocaleDateString()}</Text>
                <div style={{ marginTop: 8 }}>
                  {mail.tags?.[0] ? <Tag color="blue">{mail.tags[0].name}</Tag> : <Tag>邮件</Tag>}
                </div>
                <Dropdown menu={{ items: itemsFor(mail) }} trigger={['click']}>
                  <Button type="text" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
                </Dropdown>
              </div>
            </Space>
          </Card>
        ))}
      </Space>
    </section>
  )
}
