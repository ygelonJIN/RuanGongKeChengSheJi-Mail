import React, { useState } from 'react'
import { Tree, Badge, Button, Dropdown, Avatar, Input, Tooltip, Space, Typography } from 'antd'
import {
  InboxOutlined, SendOutlined, DeleteOutlined, FileOutlined,
  StarOutlined, SettingOutlined, PlusOutlined, SyncOutlined,
  MailOutlined, MenuFoldOutlined, MenuUnfoldOutlined, TeamOutlined,
  BarChartOutlined, FilterOutlined, DownOutlined, RightOutlined,
  MoreOutlined, EditOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import type { Folder, Account } from '../types'

const { Text } = Typography

interface SidebarProps {
  onAddAccount: () => void
  onEditAccount: (accountId: number) => void
  onOpenSettings: () => void
  onOpenStats: () => void
  onOpenRules: () => void
}

const folderIcons: Record<string, React.ReactNode> = {
  inbox: <InboxOutlined />,
  sent: <SendOutlined />,
  drafts: <FileOutlined />,
  trash: <DeleteOutlined />,
  spam: <FilterOutlined />,
  starred: <StarOutlined />,
  important: <StarOutlined style={{ color: '#f59e0b' }} />,
  mail: <MailOutlined />,
}

const folderColors: Record<string, string> = {
  inbox: '#2563eb',
  sent: '#16a34a',
  drafts: '#6b7280',
  trash: '#ef4444',
  spam: '#f59e0b',
  starred: '#eab308',
  important: '#dc2626',
  mail: '#6b7280',
}

export default function Sidebar({ onAddAccount, onEditAccount, onOpenSettings, onOpenStats, onOpenRules }: SidebarProps) {
  const {
    accounts, folders, setFolders,
    selectedAccountId, setSelectedAccountId,
    selectedFolderId, setSelectedFolderId,
    setSelectedEmailId,
    syncingAccounts, setSyncing,
    setSidebarVisible,
  } = useAppStore()

  const [expandedAccounts, setExpandedAccounts] = useState<Record<number, boolean>>({})
  const [collapsed, setCollapsed] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  const filteredAccounts = accounts.filter((a: Account) =>
    a.email.toLowerCase().includes(searchValue.toLowerCase())
  )

  const handleAccountClick = (accountId: number) => {
    setSelectedAccountId(accountId)
    setSelectedEmailId(null)
    const accountFolders = folders.filter((f: Folder) => f.account_id === accountId)
    const inbox = accountFolders.find((f: Folder) => f.type === 'inbox')
    if (inbox) {
      setSelectedFolderId(inbox.id)
    }
  }

  const handleFolderClick = (folder: Folder) => {
    setSelectedAccountId(folder.account_id)
    setSelectedFolderId(folder.id)
    setSelectedEmailId(null)
  }

  const handleSync = async (accountId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setSyncing(accountId, true)
    try {
      await window.electronAPI.account.sync(accountId)
      const folders = await window.electronAPI.folder.getAll(accountId)
      setFolders([...folders])
    } finally {
      setSyncing(accountId, false)
    }
  }

  const handleSyncAll = async () => {
    for (const account of accounts) {
      setSyncing(account.id, true)
    }
    try {
      await window.electronAPI.account.syncAll()
      const allFolders = await window.electronAPI.folder.getAll()
      setFolders(allFolders)
    } finally {
      accounts.forEach((a: Account) => setSyncing(a.id, false))
    }
  }

  const getFolderUnreadCount = (folder: Folder): number => {
    return folders.filter((f: Folder) => f.id === folder.id).reduce((sum: number, f: Folder) => sum + (f.unread_count || 0), 0)
  }

  const renderFolderTree = (accountId: number) => {
    const accountFolders = folders.filter((f: Folder) =>
      f.account_id === accountId && f.subscribed === 1
    )

    const groupByType = (type: string): Folder[] =>
      accountFolders.filter((f: Folder) => f.type === type)

    const renderFolderItem = (folder: Folder) => {
      const unread = folder.unread_count || 0
      const isSelected = selectedFolderId === folder.id
      const color = folderColors[folder.type] || folderColors.mail

      return (
        <div
          key={folder.id}
          className={`folder-tree-item ${isSelected ? 'active' : ''}`}
          onClick={() => handleFolderClick(folder)}
          style={{ paddingLeft: collapsed ? 8 : 16 }}
        >
          <span style={{ color, marginRight: 6 }}>
            {folderIcons[folder.type] || folderIcons.mail}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-sm">{folder.name}</span>
              {unread > 0 && (
                <Badge
                  count={unread}
                  size="small"
                  style={{
                    backgroundColor: '#2563eb',
                    fontSize: 10,
                    minWidth: 18,
                    height: 18,
                    lineHeight: '18px',
                  }}
                />
              )}
            </>
          )}
        </div>
      )
    }

    const groups = [
      { key: 'inbox', label: '收件箱', folders: groupByType('inbox') },
      { key: 'starred', label: '星标', folders: groupByType('starred') },
      { key: 'sent', label: '已发送', folders: groupByType('sent') },
      { key: 'drafts', label: '草稿', folders: groupByType('drafts') },
      { key: 'trash', label: '已删除', folders: groupByType('trash') },
      { key: 'spam', label: '垃圾邮件', folders: groupByType('spam') },
      { key: 'mail', label: '其他', folders: accountFolders.filter((f: Folder) => !['inbox', 'sent', 'drafts', 'trash', 'spam', 'starred', 'important'].includes(f.type)) },
    ].filter((g) => g.folders.length > 0)

    return (
      <div className="space-y-1">
        {groups.map((group) => (
          <div key={group.key}>
            {!collapsed && (
              <div
                className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-1 mt-2"
              >
                {group.label}
              </div>
            )}
            {group.folders.map((folder: Folder) => renderFolderItem(folder))}
          </div>
        ))}
      </div>
    )
  }

  const renderAccountSection = () => {
    if (collapsed) {
      return (
        <div className="space-y-2">
          {accounts.map((account: Account) => {
            const isSelected = selectedAccountId === account.id
            return (
              <Tooltip key={account.id} title={account.email} placement="right">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer mx-auto ${
                    isSelected ? 'bg-blue-100 dark:bg-blue-900' : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                  onClick={() => handleAccountClick(account.id)}
                >
                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    {account.email[0].toUpperCase()}
                  </span>
                </div>
              </Tooltip>
            )
          })}
          <Tooltip title="添加账户" placement="right">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer mx-auto bg-gray-100 dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
              onClick={onAddAccount}
            >
              <PlusOutlined className="text-gray-500" />
            </div>
          </Tooltip>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {filteredAccounts.map((account: Account) => {
          const isSelected = selectedAccountId === account.id
          const isSyncing = syncingAccounts.has(account.id)

          return (
            <div key={account.id}>
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => handleAccountClick(account.id)}
              >
                <Avatar
                  size={32}
                  style={{
                    backgroundColor: '#2563eb',
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {account.email[0].toUpperCase()}
                </Avatar>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {account.display_name || account.email.split('@')[0]}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{account.email}</div>
                    </div>
                    <Dropdown
                      menu={{
                        items: [
                          {
                            key: 'sync',
                            label: '同步',
                            icon: <SyncOutlined spin={isSyncing} />,
                            onClick: (e) => { e.domEvent.stopPropagation(); handleSync(account.id, e.domEvent as any) },
                          },
                          {
                            key: 'edit',
                            label: '编辑账户',
                            icon: <EditOutlined />,
                            onClick: (e) => { e.domEvent.stopPropagation(); onEditAccount(account.id) },
                          },
                        ]
                      }}
                      trigger={['click']}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Dropdown>
                  </>
                )}
              </div>
              {isSelected && !collapsed && (
                <div className="mt-1">
                  {renderFolderTree(account.id)}
                </div>
              )}
            </div>
          )
        })}

        <div className="px-3">
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={onAddAccount}
            block
          >
            {!collapsed && '添加账户'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-gray-700">
        {!collapsed && <span className="font-semibold text-base">MailDesk</span>}
        <Space>
          <Button
            type="text"
            size="small"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          {!collapsed && (
            <Tooltip title="统计">
              <Button
                type="text"
                size="small"
                icon={<BarChartOutlined />}
                onClick={onOpenStats}
              />
            </Tooltip>
          )}
        </Space>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 py-2">
          <Input
            size="small"
            placeholder="搜索账户..."
            prefix={<MailOutlined style={{ color: '#9ca3af' }} />}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {renderAccountSection()}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-2 py-2 space-y-1">
        {!collapsed && (
          <Dropdown
            menu={{
              items: [
                { key: 'sync', label: '同步所有', icon: <SyncOutlined />, onClick: handleSyncAll },
                { key: 'rules', label: '规则管理', icon: <FilterOutlined />, onClick: onOpenRules },
                { key: 'settings', label: '设置', icon: <SettingOutlined />, onClick: onOpenSettings },
              ]
            }}
          >
            <div className="folder-tree-item">
              <SettingOutlined />
              <span className="ml-2 text-sm">工具</span>
              <RightOutlined style={{ marginLeft: 'auto', fontSize: 10 }} />
            </div>
          </Dropdown>
        )}
        {collapsed && (
          <Tooltip title="设置" placement="right">
            <div
              className="folder-tree-item justify-center"
              onClick={onOpenSettings}
            >
              <SettingOutlined />
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
