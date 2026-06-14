import { useCallback, useEffect, useState } from 'react'
import { App as AntApp, Badge, Button, ConfigProvider, FloatButton, Input, Layout, Space, Typography, message, theme } from 'antd'
import { BellOutlined, DashboardOutlined, MailOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import EmailList from './components/EmailList'
import EmailPreview from './components/EmailPreview'
import Sidebar from './components/Sidebar'
import Compose from './components/Compose'
import SettingsModal from './components/SettingsModal'
import RuleModal from './components/RuleModal'
import AccountModal from './components/AccountModal'
import StatsPage from './components/StatsPage'
import { useAppStore } from './stores/appStore'

const { Header, Content } = Layout
const { Title } = Typography

export default function App() {
  const [composeOpen, setComposeOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountMode, setAccountMode] = useState<'add' | 'edit'>('add')
  const [activeView, setActiveView] = useState<'mail' | 'stats'>('mail')
  const [search, setSearch] = useState('')
  const { accounts, setAccounts, setFolders, setEmails, setRules, setStats, setSettings, selectedAccountId, selectedFolderId, folderView, setSelectedAccountId, setSelectedFolderId } = useAppStore()

  const loadData = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    const [accountsData, folders, emailResult, rules, dashboard, settings] = await Promise.all([
      api.account.getAll(),
      api.folder.getAll(selectedAccountId ?? undefined),
      api.email.getList({ pageSize: 30, accountId: selectedAccountId ?? undefined, folderId: typeof selectedFolderId === 'number' ? selectedFolderId : undefined }),
      api.rule.getAll(),
      api.stats.getDashboard(),
      api.settings.get(),
    ])
    setAccounts(accountsData || [])
    setFolders(folders || [])
    setEmails(emailResult?.emails || [])
    setRules(rules || [])
    setStats(dashboard || { totalEmails: 0, unreadEmails: 0, totalAccounts: 0, totalRules: 0 })
    setSettings(settings || {})
    if (!selectedAccountId && accountsData?.[0]?.id) setSelectedAccountId(accountsData[0].id)
    if (selectedFolderId == null) setSelectedFolderId(null)
    return { accountsData, folders, emailResult, dashboard }
  }, [selectedAccountId, selectedFolderId, setAccounts, setFolders, setEmails, setRules, setStats, setSettings, setSelectedAccountId, setSelectedFolderId])

  useEffect(() => { document.title = 'MailDesk'; loadData().catch(() => message.warning('真实数据加载失败，已保留本地界面预览')) }, [loadData])

  useEffect(() => {
    if (!window.electronAPI) return
    const offComplete = window.electronAPI.on('account:sync-complete', () => { loadData().catch(() => {}); message.success('同步完成，已刷新数据') })
    const offError = window.electronAPI.on('account:sync-error', (payload: any) => { const error = typeof payload === 'object' && payload?.error ? payload.error : '同步失败'; message.error(`同步失败：${error}`) })
    return () => { offComplete?.(); offError?.() }
  }, [loadData])

  const openAccountConfig = (mode: 'add' | 'edit') => { setAccountMode(mode); setAccountOpen(true) }

  const syncAndReload = async () => {
    try {
      if (selectedAccountId) await window.electronAPI?.account.sync(selectedAccountId)
      else await window.electronAPI?.account.syncAll()
      await loadData()
      message.success('同步完成')
    } catch {
      message.warning('同步可能未完成，请检查账户配置或服务器参数')
      await loadData().catch(() => {})
    }
  }

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: '#5b7cfa', borderRadius: 18 } }}>
      <AntApp>
        <Layout className="app-shell">
          <Layout className="app-frame panel-surface">
            <Header className="app-topbar">
              <Space size={14} align="center"><div className="app-brand-copy"><Title level={4} style={{ margin: 0, color: 'var(--text-primary)' }}>MailDesk</Title></div></Space>
              <Space size={12} wrap>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} allowClear placeholder="搜索邮件、联系人、标签" prefix={<SearchOutlined />} style={{ width: 260, borderRadius: 999 }} />
                <Button icon={<PlusOutlined />} type="primary" onClick={() => setComposeOpen(true)}>写邮件</Button>
                <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>设置</Button>
                <Badge count={3} size="small"><Button icon={<BellOutlined />} aria-label="通知" /></Badge>
              </Space>
            </Header>

            <Layout className="dashboard-grid">
              <Sidebar onConfigureAccount={() => openAccountConfig(accounts.length ? 'edit' : 'add')} />
              <Content className="content-area">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <Space>
                    <Button type={activeView === 'mail' ? 'primary' : 'default'} icon={<MailOutlined />} onClick={() => setActiveView('mail')}>邮件</Button>
                    <Button type={activeView === 'stats' ? 'primary' : 'default'} icon={<DashboardOutlined />} onClick={() => setActiveView('stats')}>统计</Button>
                    <Button onClick={syncAndReload}>同步并刷新</Button>
                  </Space>
                  <Space><Button icon={<DashboardOutlined />} onClick={() => setRuleOpen(true)}>规则</Button></Space>
                </div>
                {activeView === 'mail' ? <div className={`mail-layout view-${folderView}`}><EmailList /><EmailPreview /></div> : <StatsPage />}
              </Content>
            </Layout>
          </Layout>

          <FloatButton.Group trigger="hover" type="primary" style={{ right: 24, bottom: 24 }}><FloatButton icon={<DashboardOutlined />} tooltip="规则" onClick={() => setRuleOpen(true)} /></FloatButton.Group>
          <Compose open={composeOpen} onClose={() => setComposeOpen(false)} />
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
          <RuleModal open={ruleOpen} onClose={() => setRuleOpen(false)} />
          <AccountModal open={accountOpen} mode={accountMode} accountId={accounts[0]?.id ?? null} onClose={() => setAccountOpen(false)} onSaved={() => { setAccountOpen(false); syncAndReload().catch(() => {}) }} onDeleted={() => { setAccountOpen(false); syncAndReload().catch(() => {}) }} />
        </Layout>
      </AntApp>
    </ConfigProvider>
  )
}
