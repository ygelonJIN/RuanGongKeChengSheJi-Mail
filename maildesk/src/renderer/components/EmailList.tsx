import React, { useState, useCallback } from 'react'
import { Input, Button, Checkbox, Dropdown, Tooltip, Spin, Empty, Badge, message, Alert } from 'antd'
import {
  SearchOutlined, ReloadOutlined, FilterOutlined, SortAscendingOutlined,
  SortDescendingOutlined, StarOutlined, StarFilled, DownOutlined,
  MoreOutlined, DeleteOutlined, MailOutlined, CheckOutlined, EyeInvisibleOutlined,
  TagOutlined, FolderOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import type { Email } from '../types'

interface EmailListProps {
  onRefresh: () => void
}

export default function EmailList({ onRefresh }: EmailListProps) {
  const {
    emails, setEmails, totalEmails,
    emailListLoading, setEmailListLoading,
    selectedFolderId, folders,
    selectedEmailId, setSelectedEmailId,
    setReplyToEmail, setComposeVisible,
    accounts,
  } = useAppStore()

  const [searchInput, setSearchInput] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [sortField, setSortField] = useState<'date' | 'from_email' | 'subject'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)

  const selectedFolder = folders.find((f: any) => f.id === selectedFolderId)
  const selectedAccount = accounts.find((a: any) => a.id === selectedFolder?.account_id)

  const loadEmails = useCallback(async () => {
    setEmailListLoading(true)
    try {
      const result = await window.electronAPI.email.getList({
        folderId: selectedFolderId!,
        page,
        pageSize,
        sortField,
        sortOrder,
      })
      setEmails(result.emails)
    } catch (err) {
      console.error('Failed to load emails:', err)
    } finally {
      setEmailListLoading(false)
    }
  }, [selectedFolderId, page, sortField, sortOrder])

  const handleSearch = async () => {
    if (!searchInput.trim()) {
      onRefresh()
      return
    }
    setEmailListLoading(true)
    try {
      const results = await window.electronAPI.email.search(searchInput, selectedAccount?.id)
      setEmails(results)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setEmailListLoading(false)
    }
  }

  const handleSelect = (emailId: number, checked: boolean) => {
    const newSelected = new Set(selectedIds)
    if (checked) {
      newSelected.add(emailId)
    } else {
      newSelected.delete(emailId)
    }
    setSelectedIds(newSelected)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(emails.map((e: Email) => e.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleBulkAction = async (action: string) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    try {
      switch (action) {
        case 'read':
          await window.electronAPI.email.setRead(ids, true)
          break
        case 'unread':
          await window.electronAPI.email.setRead(ids, false)
          break
        case 'star':
          await window.electronAPI.email.setStar(ids, true)
          break
        case 'unstar':
          await window.electronAPI.email.setStar(ids, false)
          break
        case 'delete':
          await window.electronAPI.email.delete(ids)
          break
      }
      setSelectedIds(new Set())
      onRefresh()
      message.success('操作成功')
    } catch (err) {
      message.error('操作失败')
    }
  }

  const handleEmailClick = (email: Email) => {
    setSelectedEmailId(email.id)
    if (!email.is_read) {
      window.electronAPI.email.setRead([email.id], true)
      const updated = emails.map((e: Email) =>
        e.id === email.id ? { ...e, is_read: 1 } : e
      )
      setEmails(updated)
    }
  }

  const handleReply = (email: Email, e: React.MouseEvent) => {
    e.stopPropagation()
    setReplyToEmail(email)
    setComposeVisible(true)
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const emailDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    if (emailDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    if (today.getTime() - emailDate.getTime() < 7 * 86400000) {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      return weekdays[date.getDay()]
    }
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const getAccountEmail = (accountId: number): string => {
    const account = accounts.find((a: any) => a.id === accountId)
    return account?.email || ''
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <Checkbox
          indeterminate={selectedIds.size > 0 && selectedIds.size < emails.length}
          checked={selectedIds.size === emails.length && emails.length > 0}
          onChange={(e) => handleSelectAll(e.target.checked)}
        />

        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRefresh}
          loading={emailListLoading}
        />

        <div className="flex-1">
          <Input
            size="small"
            placeholder="搜索邮件... (from: / subject: / has:attachment)"
            prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
          />
        </div>

        <div className="text-xs text-gray-400 whitespace-nowrap">
          {selectedFolder ? (
            <span>{totalEmails} 封邮件 · {selectedFolder.name}</span>
          ) : (
            <span>未选择文件夹</span>
          )}
        </div>

        <Dropdown
          menu={{
            items: [
              { key: 'date', label: '按时间排序', onClick: () => { setSortField('date'); setSortOrder('desc') } },
              { key: 'from', label: '按发件人排序', onClick: () => { setSortField('from_email'); setSortOrder('asc') } },
              { key: 'subject', label: '按主题排序', onClick: () => { setSortField('subject'); setSortOrder('asc') } },
            ]
          }}
        >
          <Button type="text" size="small" icon={<SortDescendingOutlined />}>
            排序 <DownOutlined style={{ fontSize: 10 }} />
          </Button>
        </Dropdown>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
          <span className="text-sm text-blue-600 dark:text-blue-400">
            已选择 {selectedIds.size} 封
          </span>
          <Button size="small" icon={<CheckOutlined />} onClick={() => handleBulkAction('read')}>已读</Button>
          <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => handleBulkAction('unread')}>未读</Button>
          <Button size="small" icon={<StarOutlined />} onClick={() => handleBulkAction('star')}>星标</Button>
          <Button size="small" icon={<DeleteOutlined />} onClick={() => handleBulkAction('delete')}>删除</Button>
        </div>
      )}

      {/* Email list */}
      <div className="flex-1 overflow-y-auto">
        {emailListLoading && emails.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Spin size="large" />
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <Empty
              image={<MailOutlined style={{ fontSize: 48, color: '#d1d5db' }} />}
              description={
                selectedFolder
                  ? `${selectedFolder.name} 中没有邮件`
                  : '选择一个文件夹'
              }
              className="mt-16"
            />
            {selectedFolder && (
              <div className="text-xs text-gray-400 text-center max-w-xs">
                <p className="mb-1">文件夹信息：类型={selectedFolder.type}，路径={selectedFolder.path}</p>
                <p>已同步邮件总数：{totalEmails} 封</p>
                <p className="mt-1 text-amber-500">
                  如邮件数为 0，请点击上方旋转按钮「重新同步」
                </p>
              </div>
            )}
            {!selectedFolder && (
              <div className="text-xs text-gray-400 text-center">
                <p>当前账户共 {folders.length} 个文件夹</p>
                <p className="mt-1">请在左侧选择一个账户和文件夹查看邮件</p>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {emails.map((email: Email) => {
              const isSelected = selectedEmailId === email.id
              const isChecked = selectedIds.has(email.id)
              const isUnread = !email.is_read

              return (
                <div
                  key={email.id}
                  className={`email-list-item ${isSelected ? 'selected' : ''} px-4 py-3 cursor-pointer relative`}
                  onClick={() => handleEmailClick(email)}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <Checkbox
                      checked={isChecked}
                      onChange={(e) => handleSelect(email.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5"
                    />

                    {/* Star */}
                    <Button
                      type="text"
                      size="small"
                      className="p-0 min-w-0"
                      onClick={async (e) => {
                        e.stopPropagation()
                        await window.electronAPI.email.setStar([email.id], !email.is_starred)
                        const updated = emails.map((em: Email) =>
                          em.id === email.id ? { ...em, is_starred: em.is_starred ? 0 : 1 } : em
                        )
                        setEmails(updated)
                      }}
                    >
                      {email.is_starred ? (
                        <StarFilled style={{ color: '#eab308' }} />
                      ) : (
                        <StarOutlined style={{ color: '#d1d5db' }} />
                      )}
                    </Button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isUnread && <span className="unread-dot flex-shrink-0" />}
                          <span className={`text-sm truncate ${isUnread ? 'font-semibold' : 'font-normal'}`}>
                            {email.from_name || email.from_email.split('@')[0]}
                          </span>
                          {email.tags && email.tags.length > 0 && (
                            <div className="flex gap-1 flex-shrink-0">
                              {email.tags.slice(0, 2).map((tag: any) => (
                                <span
                                  key={tag.id}
                                  className="px-1.5 py-0.5 rounded text-xs"
                                  style={{
                                    backgroundColor: tag.color + '20',
                                    color: tag.color,
                                  }}
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatDate(email.date)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-sm truncate flex-1 ${isUnread ? 'font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                          {email.subject || '(无主题)'}
                        </span>
                        {email.has_attachments === 1 && (
                          <Tooltip title="有附件">
                            <span className="text-gray-400 flex-shrink-0">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-1.38-1.12-2.5-2.5-2.5S10 3.62 10 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-4.5z"/>
                              </svg>
                            </span>
                          </Tooltip>
                        )}
                        {email.priority === 'high' && (
                          <span className="text-red-500 text-xs font-medium flex-shrink-0">!</span>
                        )}
                      </div>

                      <div className="text-xs text-gray-400 truncate mt-0.5">
                        {email.snippet || '(无预览)'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalEmails > pageSize && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500">
            第 {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalEmails)} 条，共 {totalEmails} 条
          </span>
          <div className="flex gap-1">
            <Button
              size="small"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <Button
              size="small"
              disabled={page * pageSize >= totalEmails}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
