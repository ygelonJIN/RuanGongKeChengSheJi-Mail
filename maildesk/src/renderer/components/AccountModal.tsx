import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Checkbox, Divider, Form, Input, InputNumber, Modal, Popconfirm, Space, Steps, Tag, Typography, message } from 'antd'
import { CheckCircleOutlined, DeleteOutlined, LockOutlined, MailOutlined, SafetyCertificateOutlined, SyncOutlined, WarningOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'

const { Title, Text, Paragraph } = Typography

interface AccountModalProps {
  open: boolean
  mode: 'add' | 'edit'
  accountId: number | null
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

const commonProviders = [
  { value: 'qq', label: 'QQ 邮箱', host: 'imap.qq.com', port: 993, smtp_host: 'smtp.qq.com', smtp_port: 465 },
  { value: '163', label: '163 邮箱', host: 'imap.163.com', port: 993, smtp_host: 'smtp.163.com', smtp_port: 465 },
  { value: 'gmail', label: 'Gmail', host: 'imap.gmail.com', port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 465 },
  { value: 'custom', label: '自定义', host: '', port: 993, smtp_host: '', smtp_port: 465 },
]

export default function AccountModal({ open, mode, accountId, onClose, onSaved, onDeleted }: AccountModalProps) {
  const [form] = Form.useForm()
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState('qq')
  const [saving, setSaving] = useState(false)
  const [diagnostic, setDiagnostic] = useState<string>('')
  const { accounts, setAccounts } = useAppStore()
  const account = useMemo(() => accounts.find((item) => item.id === accountId), [accounts, accountId])

  useEffect(() => {
    if (!open) return
    form.resetFields()
    setStep(mode === 'add' ? 0 : 1)
    setProvider('qq')
    setDiagnostic('')
    if (account) {
      form.setFieldsValue(account)
      const matched = commonProviders.find((p) => p.host === account.imap_host)
      if (matched) setProvider(matched.value)
    }
  }, [open, mode, form, account])

  const selectedProvider = useMemo(() => commonProviders.find((p) => p.value === provider), [provider])

  const chooseProvider = (value: string) => {
    setProvider(value)
    const p = commonProviders.find((item) => item.value === value)
    if (p && value !== 'custom') form.setFieldsValue({ imap_host: p.host, imap_port: p.port, smtp_host: p.smtp_host, smtp_port: p.smtp_port, imap_use_tls: true, smtp_use_tls: true })
  }

  const reloadAccounts = async () => {
    const next = await window.electronAPI.account.getAll()
    setAccounts(next || [])
  }

  const runConnectionTest = async () => {
    try {
      const values = await form.validateFields()
      const result = await window.electronAPI.account.testConnection(values)
      if (result.success) {
        setDiagnostic('IMAP 连接测试成功，可以开始同步。')
      } else {
        setDiagnostic(`连接测试失败：${result.error || '未知错误'}`)
      }
    } catch {
      setDiagnostic('请先补全必填项再测试连接。')
    }
  }

  const saveAccount = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      setDiagnostic('')
      const result = window.electronAPI ? (mode === 'add' ? await window.electronAPI.account.add(values) : accountId != null ? await window.electronAPI.account.update(accountId, values) : null) : null
      if (result) await reloadAccounts()
      if (window.electronAPI && result?.id) {
        try { await window.electronAPI.account.sync(result.id) } catch (err: any) { setDiagnostic(`保存后同步失败：${err?.message || '未知错误'}`) }
      }
      message.success(mode === 'add' ? '账户已添加' : '账户已更新')
      onSaved()
      onClose()
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const deleteAccount = async () => {
    if (accountId == null || !window.electronAPI) return
    try {
      await window.electronAPI.account.delete(accountId)
      await reloadAccounts()
      message.success('账户已删除')
      onDeleted?.()
      onClose()
    } catch {
      message.error('删除失败')
    }
  }

  const syncAccountNow = async () => {
    if (accountId == null || !window.electronAPI) return
    try {
      setDiagnostic('正在同步，请查看顶部诊断面板与日志。')
      await window.electronAPI.account.sync(accountId)
      await reloadAccounts()
      message.success('已开始同步')
    } catch (err: any) {
      setDiagnostic(`同步失败：${err?.message || '未知错误'}`)
      message.error('同步失败')
    }
  }

  const loginHint = diagnostic || '如果同步失败为 LOGIN error，请优先检查 IMAP 用户名、授权码、服务器地址、端口和 SSL/TLS。'

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={720} centered title={null} className="account-modal" destroyOnClose>
      <div className="pane-header" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{mode === 'add' ? '添加邮箱账户' : '编辑邮箱账户'}</Title>
          <Text type="secondary">统一的 Aurora 账户配置面板</Text>
        </div>
      </div>
      <div style={{ padding: 16, maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}>
        <Alert icon={<WarningOutlined />} type="info" showIcon message="IMAP 登录失败排查" description={loginHint} style={{ marginBottom: 16 }} />
        <Steps current={step} items={[{ title: '选择服务', icon: <MailOutlined /> }, { title: '填写配置', icon: <LockOutlined /> }, { title: '保存', icon: <SafetyCertificateOutlined /> }]} />
        <Divider style={{ margin: '16px 0' }} />
        {step === 0 && (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {commonProviders.map((item) => (
              <Card key={item.value} bordered={false} className={`panel-surface-strong folder-tree-item ${provider === item.value ? 'active' : ''}`} onClick={() => chooseProvider(item.value)} style={{ borderRadius: 16, cursor: 'pointer' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                  <div><Text strong>{item.label}</Text><br /><Text type="secondary">IMAP {item.host || '手动填写'} · SMTP {item.smtp_host || '手动填写'}</Text></div>
                  {provider === item.value ? <CheckCircleOutlined /> : null}
                </Space>
              </Card>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <Button onClick={runConnectionTest}>测试连接</Button>
              <Space>
                <Button onClick={onClose}>取消</Button>
                <Button type="primary" onClick={() => setStep(1)}>下一步</Button>
              </Space>
            </div>
          </Space>
        )}
        {step === 1 && (
          <Form form={form} layout="vertical" initialValues={{ imap_use_tls: true, smtp_use_tls: true, imap_port: 993, smtp_port: 465 }}>
            <Paragraph type="secondary">请填写邮件服务的服务器、用户名与授权码。大多数邮箱都需要开启 SSL/TLS。</Paragraph>
            <Form.Item name="email" label="邮箱地址" rules={[{ required: true, type: 'email' }]}><Input placeholder="name@example.com" /></Form.Item>
            <Form.Item name="display_name" label="显示名称"><Input placeholder="你的姓名" /></Form.Item>
            <Divider orientation="left">IMAP</Divider>
            <Space.Compact style={{ width: '100%' }}><Form.Item name="imap_host" noStyle rules={[{ required: true }]}><Input placeholder="imap.qq.com" /></Form.Item><Form.Item name="imap_port" noStyle rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: 110 }} /></Form.Item></Space.Compact>
            <div style={{ height: 12 }} />
            <Form.Item name="imap_user" label="IMAP 用户名" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="imap_password" label="IMAP 密码 / 授权码" rules={[{ required: true }]}><Input.Password /></Form.Item>
            <Form.Item name="imap_use_tls" valuePropName="checked"><Checkbox>使用 SSL/TLS</Checkbox></Form.Item>
            <Divider orientation="left">SMTP</Divider>
            <Form.Item name="smtp_host" label="SMTP 服务器" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="smtp_port" label="SMTP 端口" rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="smtp_user" label="SMTP 用户名" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="smtp_password" label="SMTP 密码 / 授权码" rules={[{ required: true }]}><Input.Password /></Form.Item>
            <Form.Item name="smtp_use_tls" valuePropName="checked"><Checkbox>使用 SSL/TLS</Checkbox></Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <Button onClick={() => setStep(0)}>上一步</Button>
              <Space>
                {mode === 'edit' ? <Button icon={<SyncOutlined />} onClick={syncAccountNow}>立即同步</Button> : null}
                <Button onClick={onClose}>取消</Button>
                <Button type="primary" loading={saving} onClick={saveAccount}>保存</Button>
              </Space>
            </div>
          </Form>
        )}
        {step === 2 && <Alert type="success" message="账户已准备保存" description={selectedProvider?.label} showIcon />}
        {mode === 'edit' && <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Popconfirm title="确定删除账户？" onConfirm={deleteAccount} okText="删除" cancelText="取消"><Button danger icon={<DeleteOutlined />}>删除账户</Button></Popconfirm><Tag color="blue">编辑模式</Tag></div>}
      </div>
    </Modal>
  )
}
