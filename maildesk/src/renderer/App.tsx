import React, { useEffect, useState, useCallback } from 'react'
import { Layout } from 'antd'
import { useAppStore } from './stores/appStore'
import Sidebar from './components/Sidebar'
import EmailList from './components/EmailList'
import EmailPreview from './components/EmailPreview'
import Compose from './components/Compose'
import SettingsModal from './components/SettingsModal'
import AccountModal from './components/AccountModal'
import RuleModal from './components/RuleModal'
import StatsPage from './components/StatsPage'
import type { Theme } from '@preload/index'

const { Sider, Content } = Layout

function App() {
  const {
    sidebarVisible, setSidebarVisible,
    previewVisible, setPreviewVisible,
    sidebarWidth, setSidebarWidth,
    setTheme, setSettings, setAccounts, setFolders, setRules, setTags,
    composeVisible, setComposeVisible,
    replyToEmail, setReplyToEmail,
    selectedFolderId, setSelectedFolderId,
    setEmails, setTotalEmails, setEmailListLoading,
    setSelectedEmailId,
  } = useAppStore()

  const [currentView, setCurrentView] = useState<'mail' | 'stats'>('mail')
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [accountModalMode, setAccountModalMode] = useState<'add' | 'edit'>('add')
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)

  // Initialize app
  useEffect(() => {
    const init = async () => {
      try {
        const [settings, accounts, folders, rules, tags, savedTheme] = await Promise.all([
          window.electronAPI.settings.get(),
          window.electronAPI.account.getAll(),
          window.electronAPI.folder.getAll(),
          window.electronAPI.rule.getAll(),
          window.electronAPI.tag.getAll(),
          window.electronAPI.settings.getTheme(),
        ])

        setSettings(settings)
        setAccounts(accounts)
        setFolders(folders)
        setRules(rules)
        setTags(tags)

        const themeMode = savedTheme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : savedTheme as 'light' | 'dark'
        setTheme(themeMode)
        document.documentElement.classList.toggle('dark', themeMode === 'dark')

        if (accounts.length > 0) {
          const inboxFolder = folders.find(
            (f: any) => f.account_id === accounts[0].id && f.type === 'inbox'
          )
          if (inboxFolder) {
            setSelectedFolderId(inboxFolder.id)
          }
          try {
            await window.electronAPI.account.syncAll()
            const [folders2] = await Promise.all([window.electronAPI.folder.getAll()])
            setFolders(folders2)
          } catch (err) {
            console.error('Initial sync failed:', err)
          }
        }
      } catch (err) {
        console.error('Failed to initialize app:', err)
      }
    }

    init()
  }, [])

  // Listen for menu events
  useEffect(() => {
    const cleanups: (() => void)[] = []

    cleanups.push(window.electronAPI.on('menu:new-email', () => {
      setReplyToEmail(null)
      setComposeVisible(true)
    }))

    cleanups.push(window.electronAPI.on('menu:add-account', () => {
      setAccountModalMode('add')
      setEditingAccountId(null)
      setAccountModalOpen(true)
    }))

    cleanups.push(window.electronAPI.on('menu:account-settings', () => {
      setSettingsModalOpen(true)
    }))

    cleanups.push(window.electronAPI.on('menu:sync-all', async () => {
      await window.electronAPI.account.syncAll()
    }))

    cleanups.push(window.electronAPI.on('account:sync-complete', async (data: any) => {
      const folders = await window.electronAPI.folder.getAll()
      setFolders(folders)
      if (selectedFolderId) {
        try {
          const result = await window.electronAPI.email.getList({ folderId: selectedFolderId, pageSize: 50 })
          setEmails(result.emails)
          setTotalEmails(result.total)
        } catch {}
      }
    }))

    cleanups.push(window.electronAPI.on('menu:about', () => {
      setSettingsModalOpen(true)
    }))

    cleanups.push(window.electronAPI.on('toggle-sidebar', () => {
      setSidebarVisible(!sidebarVisible)
    }))

    cleanups.push(window.electronAPI.on('toggle-preview', () => {
      setPreviewVisible(!previewVisible)
    }))

    cleanups.push(window.electronAPI.on('theme:changed', (_theme: string) => {
      setTheme(_theme as 'light' | 'dark')
      document.documentElement.classList.toggle('dark', _theme === 'dark')
    }))

    cleanups.push(window.electronAPI.on('navigate', (payload: any) => {
      if (typeof payload === 'string') {
        setCurrentView(payload === 'stats' ? 'stats' : 'mail')
      } else if (payload?.type === 'email') {
        setSelectedEmailId(payload.id)
      }
    }))

    cleanups.push(window.electronAPI.on('notification:clicked', (emailId: number) => {
      setSelectedEmailId(emailId)
    }))

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [sidebarVisible])

  // Load emails when folder changes
  const loadEmails = useCallback(async () => {
    if (!selectedFolderId) return
    setEmailListLoading(true)
    try {
      const result = await window.electronAPI.email.getList({ folderId: selectedFolderId, pageSize: 50 })
      setEmails(result.emails)
      setTotalEmails(result.total)
    } catch (err) {
      console.error('Failed to load emails:', err)
    } finally {
      setEmailListLoading(false)
    }
  }, [selectedFolderId])

  useEffect(() => {
    if (selectedFolderId && currentView === 'mail') {
      loadEmails()
    }
  }, [selectedFolderId, loadEmails, currentView])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n':
            e.preventDefault()
            setReplyToEmail(null)
            setComposeVisible(true)
            break
          case 'b':
            e.preventDefault()
            setSidebarVisible(!sidebarVisible)
            break
          case ',':
            e.preventDefault()
            setSettingsModalOpen(true)
            break
        }
      }
      if (e.key === 'Escape') {
        setComposeVisible(false)
        setSettingsModalOpen(false)
        setAccountModalOpen(false)
        setRuleModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarVisible])

  const handleResizerDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(150, Math.min(400, startWidth + delta))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [sidebarWidth])

  const handleAccountModalOpen = () => {
    setAccountModalMode('add')
    setEditingAccountId(null)
    setAccountModalOpen(true)
  }

  return (
    <Layout className="h-screen overflow-hidden">
      <Layout>
        {sidebarVisible && currentView === 'mail' && (
          <>
            <Sider
              width={sidebarWidth}
              style={{
                background: 'var(--ant-color-bg-container)',
                borderRight: '1px solid var(--ant-color-border-secondary)',
                overflow: 'auto',
                height: '100vh',
              }}
            >
              <Sidebar
                onAddAccount={handleAccountModalOpen}
                onEditAccount={(accountId) => {
                  setEditingAccountId(accountId)
                  setAccountModalMode('edit')
                  setAccountModalOpen(true)
                }}
                onOpenSettings={() => setSettingsModalOpen(true)}
                onOpenStats={() => setCurrentView('stats')}
                onOpenRules={() => { setEditingRuleId(null); setRuleModalOpen(true) }}
              />
            </Sider>
            <div
              className="resizer"
              onMouseDown={handleResizerDrag}
            />
          </>
        )}

        <Content style={{ display: 'flex', overflow: 'hidden', height: '100vh' }}>
          {currentView === 'mail' ? (
            <>
              <div style={{ width: previewVisible ? '35%' : '100%', minWidth: 280, display: 'flex', flexDirection: 'column', borderRight: previewVisible ? '1px solid var(--ant-color-border-secondary)' : 'none' }}>
                <EmailList onRefresh={loadEmails} />
              </div>
              {previewVisible && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 400 }}>
                  <EmailPreview />
                </div>
              )}
            </>
          ) : (
            <StatsPage onBack={() => setCurrentView('mail')} />
          )}
        </Content>
      </Layout>

      {composeVisible && (
        <Compose
          onClose={() => { setComposeVisible(false); setReplyToEmail(null) }}
          replyTo={replyToEmail}
        />
      )}

      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />

      <AccountModal
        open={accountModalOpen}
        mode={accountModalMode}
        accountId={editingAccountId}
        onClose={() => setAccountModalOpen(false)}
        onDeleted={async () => {
          const accounts = await window.electronAPI.account.getAll()
          const folders = await window.electronAPI.folder.getAll()
          setAccounts(accounts)
          setFolders(folders)
          setSelectedFolderId(null)
          setSelectedEmailId(null)
        }}
        onSaved={async () => {
          const accounts = await window.electronAPI.account.getAll()
          const folders = await window.electronAPI.folder.getAll()
          setAccounts(accounts)
          setFolders(folders)
          if (accounts.length > 0) {
            const inboxFolder = folders.find(
              (f: any) => f.account_id === accounts[accounts.length - 1].id && f.type === 'inbox'
            )
            if (inboxFolder) {
              setSelectedFolderId(inboxFolder.id)
            }
            try {
              await window.electronAPI.account.sync(accounts[accounts.length - 1].id)
              const folders2 = await window.electronAPI.folder.getAll()
              setFolders(folders2)
            } catch (err) {
              console.error('Sync after add failed:', err)
            }
          }
        }}
      />

      <RuleModal
        open={ruleModalOpen}
        ruleId={editingRuleId}
        onClose={() => setRuleModalOpen(false)}
        onSaved={async () => {
          const rules = await window.electronAPI.rule.getAll()
          setRules(rules)
        }}
      />
    </Layout>
  )
}

export default App
