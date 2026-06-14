import { Avatar, Badge, Card, Divider, Space, Tag, Typography } from 'antd'
import { DeleteOutlined, FolderOutlined, InboxOutlined, SendOutlined, StarOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'

const { Title, Text } = Typography

const items = [
  { id: 'inbox', icon: <InboxOutlined />, label: '收件箱', type: 'inbox' as const },
  { id: 'starred', icon: <StarOutlined />, label: '星标', type: 'starred' as const },
  { id: 'sent', icon: <SendOutlined />, label: '已发送', type: 'sent' as const },
  { id: 'archive', icon: <FolderOutlined />, label: '归档', type: 'archive' as const },
  { id: 'trash', icon: <DeleteOutlined />, label: '垃圾箱', type: 'trash' as const },
]

export default function Sidebar({ onConfigureAccount }: { onConfigureAccount: () => void }) {
  const { selectedFolderId, setSelectedFolderId, setFolderView, accounts, folders, emails, selectedAccountId } = useAppStore()
  const activeAccount = accounts.find((account) => account.id === selectedAccountId) || accounts[0]

  const scopedFolders = folders.filter((folder) => !selectedAccountId || folder.account_id === selectedAccountId)
  const scopedEmails = emails.filter((email) => !selectedAccountId || email.account_id === selectedAccountId)
  const countByView = (view: string) => {
    if (view === 'starred') return scopedEmails.filter((email) => email.is_starred).length
    if (view === 'trash') return scopedEmails.filter((email) => scopedFolders.some((folder) => folder.id === email.folder_id && folder.type === 'trash')).length
    if (view === 'sent') return scopedEmails.filter((email) => email.is_sent || scopedFolders.some((folder) => folder.id === email.folder_id && folder.type === 'sent')).length
    if (view === 'archive') return scopedEmails.filter((email) => scopedFolders.some((folder) => folder.id === email.folder_id && folder.type !== 'inbox' && folder.type !== 'sent' && folder.type !== 'trash')).length
    return scopedEmails.filter((email) => scopedFolders.some((folder) => folder.id === email.folder_id && folder.type === view)).length
  }

  return (
    <div className="sidebar panel-surface" style={{ borderRadius: 30 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card bordered={false} className="panel-surface-strong account-mini-card" style={{ borderRadius: 24 }} onClick={onConfigureAccount}>
          <Space align="start" size={14} style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <Space align="start" size={14} style={{ minWidth: 0, flex: 1 }}>
              <Avatar size={48} style={{ background: 'linear-gradient(135deg, #5b7cfa, #7ea0ff)' }}>A</Avatar>
              <div className="account-mini-copy">
                <Title level={5} style={{ margin: 0 }}>{activeAccount?.display_name || '账户配置'}</Title>
                <Text type="secondary" ellipsis>{activeAccount?.email || '点击配置账户'}</Text>
                <div style={{ marginTop: 12 }}>
                  <Tag color="blue">Synced</Tag>
                  <Tag color="cyan">Protected</Tag>
                </div>
              </div>
            </Space>
          </Space>
        </Card>

        <Divider style={{ margin: 0 }} />

        <Card bordered={false} className="panel-surface-strong" style={{ borderRadius: 24 }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {items.map((item) => (
              <div key={item.id} className={`folder-tree-item ${selectedFolderId === item.id ? 'active' : ''}`} role="button" tabIndex={0} onClick={() => { setFolderView(item.id as any); setSelectedFolderId(null) }}>
                <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <Space style={{ minWidth: 0 }}>
                    {item.icon}
                    <span className="folder-label">{item.label}</span>
                  </Space>
                  <Space size={6}>
                    <Badge count={item.type === 'starred' ? scopedEmails.filter((email) => email.is_starred).filter((email) => !selectedAccountId || email.account_id === selectedAccountId).length : 0} size="small" />
                    <span className="folder-count">{countByView(item.type)}</span>
                  </Space>
                </Space>
              </div>
            ))}
          </Space>
        </Card>
      </Space>
    </div>
  )
}
