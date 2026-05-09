import React, { useState, useEffect } from 'react'
import { Modal, Form, Input, InputNumber, Button, Steps, message, Alert, Space, Divider, Checkbox, Tooltip, Popconfirm } from 'antd'
import { CheckCircleOutlined, MailOutlined, LockOutlined, SafetyCertificateOutlined, QuestionCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import type { Account } from '../types'

interface AccountModalProps {
  open: boolean
  mode: 'add' | 'edit'
  accountId: number | null
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

const commonProviders = [
  {
    value: 'qq',
    label: 'QQ 邮箱',
    host: 'imap.qq.com',
    port: 993,
    smtp_host: 'smtp.qq.com',
    smtp_port: 465,
    tip: '需使用授权码（非 QQ 密码），授权码在邮箱网页版设置中生成',
  },
  {
    value: '163',
    label: '163 邮箱',
    host: 'imap.163.com',
    port: 993,
    smtp_host: 'smtp.163.com',
    smtp_port: 465,
    tip: '需使用授权码（在邮箱设置 → POP3/SMTP/IMAP 中开启并获取）',
  },
  {
    value: 'gmail',
    label: 'Gmail (Google)',
    host: 'imap.gmail.com',
    port: 993,
    smtp_host: 'smtp.gmail.com',
    smtp_port: 465,
    tip: '建议使用浏览器授权方式；如用应用密码需先开启两步验证',
  },
  {
    value: 'outlook',
    label: 'Outlook / Hotmail',
    host: 'outlook.office365.com',
    port: 993,
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    tip: '用户名填邮箱地址，密码为 Outlook 账户密码或应用密码',
  },
  {
    value: 'custom',
    label: '其他邮箱 / 自定义',
    host: '',
    port: 993,
    smtp_host: '',
    smtp_port: 465,
    tip: '手动填写 IMAP 和 SMTP 服务器地址、端口、用户名和密码',
  },
]

const TipIcon = ({ text }: { text: string }) => (
  <Tooltip title={text} placement="top">
    <QuestionCircleOutlined className="ml-1 text-gray-400 cursor-help" />
  </Tooltip>
)

const FieldLabel = ({ children, tip }: { children: React.ReactNode; tip?: string }) => (
  <span className="flex items-center">
    {children}
    {tip && <TipIcon text={tip} />}
  </span>
)

export default function AccountModal({ open, mode, accountId, onClose, onSaved, onDeleted }: AccountModalProps) {
  const [form] = Form.useForm()
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAuthGuide, setShowAuthGuide] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  useEffect(() => {
    if (open && mode === 'edit' && accountId) {
      setStep(2)
      loadAccount()
    } else if (open && mode === 'add') {
      form.resetFields()
      setStep(0)
      setProvider('')
      setTestResult(null)
    }
  }, [open, mode, accountId])

  const loadAccount = async () => {
    const accounts = await window.electronAPI.account.getAll()
    const account = accounts.find((a: any) => a.id === accountId)
    if (account) {
      form.setFieldsValue({
        email: account.email,
        display_name: account.display_name,
        imap_host: account.imap_host,
        imap_port: account.imap_port,
        imap_user: account.imap_user,
        imap_password: account.imap_password,
        imap_use_tls: !!account.imap_use_tls,
        smtp_host: account.smtp_host,
        smtp_port: account.smtp_port,
        smtp_user: account.smtp_user,
        smtp_password: account.smtp_password,
        smtp_use_tls: !!account.smtp_use_tls,
      })
      const p = commonProviders.find((x) => x.value === account.provider)
      if (p) setProvider(account.provider)
    }
  }

  const handleProviderSelect = (value: string) => {
    setProvider(value)
    const p = commonProviders.find((x) => x.value === value)
    if (p && value !== 'custom') {
      form.setFieldsValue({
        imap_host: p.host,
        imap_port: p.port,
        smtp_host: p.smtp_host,
        smtp_port: p.smtp_port,
      })
    }
  }

  const handleTest = async () => {
    try {
      await form.validateFields()
    } catch {
      return
    }
    const values = form.getFieldsValue(true)
    const p = commonProviders.find((x) => x.value === provider)
    if (p && !values.imap_host) {
      values.imap_host = p.host
      values.imap_port = p.port
      values.smtp_host = p.smtp_host
      values.smtp_port = p.smtp_port
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.account.testConnection(values)
      setTestResult(result)
    } catch (err: any) {
      setTestResult({ success: false, error: err.message })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    try {
      await form.validateFields()
    } catch {
      return
    }
    let values = form.getFieldsValue(true)
    const p = commonProviders.find((x) => x.value === provider)
    if (p && !values.imap_host) {
      values = { ...values, imap_host: p.host, imap_port: p.port, smtp_host: p.smtp_host, smtp_port: p.smtp_port }
    }
    setSaving(true)
    try {
      if (mode === 'edit' && accountId) {
        await window.electronAPI.account.update(accountId, { ...values, email: values.email })
      } else {
        await window.electronAPI.account.add({ ...values, email: values.email })
      }
      message.success(mode === 'edit' ? '账户已更新' : '账户已添加')
      onSaved()
      onClose()
    } catch (err: any) {
      message.error(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const selectedProvider = commonProviders.find((p) => p.value === provider)
  const needsAuthCode = provider === 'qq' || provider === '163'

  const handleDelete = async () => {
    if (!accountId) return
    try {
      await window.electronAPI.account.delete(accountId)
      message.success('账户已删除')
      onDeleted?.()
      onClose()
    } catch (err: any) {
      message.error(err.message || '删除失败')
    }
  }

  return (
    <Modal
      open={open}
      title={mode === 'add' ? '添加邮箱账户' : '编辑账户'}
      width={600}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      {mode === 'add' && (
        <Steps
          current={step}
          size="small"
          className="mb-6"
          items={[
            { title: '选择类型', icon: <MailOutlined /> },
            { title: '填写配置', icon: <LockOutlined /> },
            { title: '测试保存', icon: <SafetyCertificateOutlined /> },
          ]}
        />
      )}

      {step === 0 && mode === 'add' && (
        <div className="space-y-3">
          <div className="text-sm text-gray-500 mb-2">
            选择你的邮箱服务类型，选择后服务器地址将自动填充
          </div>
          {commonProviders.map((p) => (
            <div
              key={p.value}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                provider === p.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
              }`}
              onClick={() => handleProviderSelect(p.value)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    IMAP：{p.host}:{p.port} &nbsp;|&nbsp; SMTP：{p.smtp_host}:{p.smtp_port}
                  </div>
                </div>
                {provider === p.value && (
                  <CheckCircleOutlined className="text-blue-500 mt-0.5" />
                )}
              </div>
              {p.tip && (
                <div className="text-xs text-amber-600 mt-1">{p.tip}</div>
              )}
            </div>
          ))}

          <Button
            type="primary"
            block
            disabled={!provider}
            onClick={() => setStep(1)}
            className="mt-4"
          >
            下一步：填写账户信息
          </Button>
        </div>
      )}

      {step === 1 && (
        <>
          {selectedProvider && (
            <Alert
              type="info"
              message={`已选择：${selectedProvider.label}`}
              description={selectedProvider.tip}
              showIcon
              className="mb-4"
            />
          )}

          {needsAuthCode && (
            <Alert
              type="warning"
              message="重要：这里填的是【授权码】，不是邮箱登录密码"
              description={
                <div className="text-sm mt-2 space-y-1">
                  <p>1. 打开邮箱网页版并登录</p>
                  <p>2. 进入「设置 → 账户 → POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务」</p>
                  <p>3. 开启「IMAP/SMTP 服务」</p>
                  <p>4. 点击「生成授权码」，用手机扫码验证后获取授权码</p>
                  <p>5. 将授权码（形如 <code>abcdabcdabcdabcd</code> 的字符串）填入下方密码栏</p>
                </div>
              }
              className="mb-4"
            />
          )}

          {provider === 'gmail' && (
            <Alert
              type="info"
              message="Gmail 推荐使用浏览器授权"
              description="Gmail 已逐步关闭应用密码功能，建议在测试时通过浏览器完成 OAuth 授权。"
              showIcon
              className="mb-4"
            />
          )}

          <Form form={form} layout="vertical" className="mt-4">
            <Divider orientation="left">基本账户信息</Divider>

            <Form.Item
              name="email"
              label={<FieldLabel tip="填写你的完整邮箱地址，如 123456@qq.com">邮箱地址</FieldLabel>}
              rules={[{ required: true, type: 'email', message: '请输入有效的邮箱地址' }]}
            >
              <Input placeholder="123456@qq.com" />
            </Form.Item>

            <Form.Item
              name="display_name"
              label={<FieldLabel tip="发送邮件时对方看到的发件人名称，可不填">显示名称（发件人昵称）</FieldLabel>}
            >
              <Input placeholder="张三" />
            </Form.Item>

            <Divider orientation="left">IMAP 设置（收邮件）</Divider>

            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded p-3 mb-4 text-sm text-blue-700 dark:text-blue-300">
              <p><strong>IMAP 是什么？</strong> IMAP 用于从邮件服务器<strong>收取（下载）邮件</strong>。以下服务器地址、端口、用户名、密码均从你的邮箱官网获取。</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Form.Item
                name="imap_host"
                label={<FieldLabel tip="向你的邮箱服务商索取，如 imap.qq.com">IMAP 服务器地址</FieldLabel>}
                rules={[{ required: true, message: 'IMAP 服务器地址不能为空' }]}
                className="col-span-2 mb-3"
              >
                <Input placeholder="imap.qq.com" />
              </Form.Item>
              <Form.Item
                name="imap_port"
                label={<FieldLabel tip="IMAP 加密端口通常为 993（SSL）">端口</FieldLabel>}
                rules={[{ required: true, message: '端口不能为空' }]}
                className="mb-3"
              >
                <InputNumber placeholder="993" min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="imap_user"
                label={<FieldLabel tip="通常就是你的完整邮箱地址">用户名</FieldLabel>}
                rules={[{ required: true, message: '用户名不能为空' }]}
              >
                <Input placeholder="123456@qq.com" />
              </Form.Item>
              <Form.Item
                name="imap_password"
                label={<FieldLabel tip={needsAuthCode ? '授权码，非 QQ 登录密码！' : 'IMAP 登录密码或授权码'}>{needsAuthCode ? '授权码（IMAP）' : '密码'}</FieldLabel>}
                rules={[{ required: true, message: '密码不能为空' }]}
              >
                <Input.Password placeholder={needsAuthCode ? '填授权码，不是 QQ 密码！' : 'IMAP 密码'} />
              </Form.Item>
            </div>

            <Form.Item
              name="imap_use_tls"
              valuePropName="checked"
              className="mb-2"
            >
              <Checkbox className="font-medium">
                <FieldLabel tip="开启后使用加密连接（SSL/TLS），端口 993 通常需要开启。推荐始终保持开启以保护密码安全。">
                使用 SSL/TLS 加密连接
              </FieldLabel>
              </Checkbox>
            </Form.Item>

            <Divider orientation="left">SMTP 设置（发邮件）</Divider>

            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded p-3 mb-4 text-sm text-green-700 dark:text-green-300">
              <p><strong>SMTP 是什么？</strong> SMTP 用于<strong>发送邮件</strong>到对方的邮件服务器。设置通常与 IMAP 一致（同一服务商的用户名密码）。</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Form.Item
                name="smtp_host"
                label={<FieldLabel tip="向你的邮箱服务商索取，如 smtp.qq.com">SMTP 服务器地址</FieldLabel>}
                rules={[{ required: true, message: 'SMTP 服务器地址不能为空' }]}
                className="col-span-2 mb-3"
              >
                <Input placeholder="smtp.qq.com" />
              </Form.Item>
              <Form.Item
                name="smtp_port"
                label={<FieldLabel tip="SMTP 常用端口：465（SSL）或 587（STARTTLS）">端口</FieldLabel>}
                rules={[{ required: true, message: '端口不能为空' }]}
                className="mb-3"
              >
                <InputNumber placeholder="465" min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="smtp_user"
                label={<FieldLabel tip="通常与 IMAP 用户名相同，填完整邮箱地址">用户名</FieldLabel>}
                rules={[{ required: true, message: '用户名不能为空' }]}
              >
                <Input placeholder="123456@qq.com" />
              </Form.Item>
              <Form.Item
                name="smtp_password"
                label={<FieldLabel tip={needsAuthCode ? '授权码，非 QQ 登录密码！' : 'SMTP 登录密码或授权码'}>{needsAuthCode ? '授权码（SMTP）' : '密码'}</FieldLabel>}
                rules={[{ required: true, message: '密码不能为空' }]}
              >
                <Input.Password placeholder={needsAuthCode ? '填授权码，不是 QQ 密码！' : 'SMTP 密码'} />
              </Form.Item>
            </div>

            <Form.Item
              name="smtp_use_tls"
              valuePropName="checked"
              className="mb-2"
            >
              <Checkbox className="font-medium">
                <FieldLabel tip="开启后使用加密连接（SSL/TLS）。端口 465 推荐开启；端口 587 通常使用 STARTTLS 加密（也勾选此选项）。推荐始终保持开启。">
                使用 SSL/TLS 加密连接
              </FieldLabel>
              </Checkbox>
            </Form.Item>

            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded p-3 mt-4 text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <p><strong>SSL/TLS 是什么？</strong> SSL 和 TLS 是加密协议，用于在传输过程中保护你的密码和邮件内容，防止被窃听。</p>
              <p><strong>什么时候勾选？</strong> 使用 993 端口（IMAP）和 465 端口（SMTP）时几乎总是需要勾选；使用 587 端口（SMTP）时通常也勾选（称为 STARTTLS）。</p>
              <p><strong>始终建议勾选</strong>——不加密的连接会将你的密码以明文方式发送，极不安全。</p>
            </div>
          </Form>

          <div className="flex justify-between mt-4">
            <Button onClick={() => setStep(0)}>上一步</Button>
            <Button type="primary" onClick={() => setStep(2)}>下一步：测试并保存</Button>
          </div>
        </>
      )}

      {/* Edit mode: all-in-one editable form */}
      {step === 2 && mode === 'edit' && (
        <>
          <Form form={form} layout="vertical" className="mt-2">
            <Divider orientation="left">基本账户信息</Divider>

            <Form.Item
              name="email"
              label={<FieldLabel tip="填写你的完整邮箱地址，如 123456@qq.com">邮箱地址</FieldLabel>}
              rules={[{ required: true, type: 'email', message: '请输入有效的邮箱地址' }]}
            >
              <Input placeholder="123456@qq.com" />
            </Form.Item>

            <Form.Item
              name="display_name"
              label={<FieldLabel tip="发送邮件时对方看到的发件人名称">显示名称（发件人昵称）</FieldLabel>}
            >
              <Input placeholder="张三" />
            </Form.Item>

            <Divider orientation="left">IMAP 设置（收邮件）</Divider>

            <div className="grid grid-cols-3 gap-3">
              <Form.Item
                name="imap_host"
                label="IMAP 服务器地址"
                rules={[{ required: true, message: '不能为空' }]}
                className="col-span-2 mb-3"
              >
                <Input placeholder="imap.qq.com" />
              </Form.Item>
              <Form.Item
                name="imap_port"
                label="端口"
                rules={[{ required: true, message: '不能为空' }]}
                className="mb-3"
              >
                <InputNumber placeholder="993" min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item name="imap_user" label="用户名" rules={[{ required: true, message: '不能为空' }]}>
                <Input placeholder="123456@qq.com" />
              </Form.Item>
              <Form.Item name="imap_password" label={needsAuthCode ? '授权码（IMAP）' : '密码'}>
                <Input.Password placeholder={needsAuthCode ? '填授权码' : '密码'} />
              </Form.Item>
            </div>

            <Form.Item name="imap_use_tls" valuePropName="checked">
              <Checkbox>使用 SSL/TLS 加密连接</Checkbox>
            </Form.Item>

            <Divider orientation="left">SMTP 设置（发邮件）</Divider>

            <div className="grid grid-cols-3 gap-3">
              <Form.Item
                name="smtp_host"
                label="SMTP 服务器地址"
                rules={[{ required: true, message: '不能为空' }]}
                className="col-span-2 mb-3"
              >
                <Input placeholder="smtp.qq.com" />
              </Form.Item>
              <Form.Item
                name="smtp_port"
                label="端口"
                rules={[{ required: true, message: '不能为空' }]}
                className="mb-3"
              >
                <InputNumber placeholder="465" min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item name="smtp_user" label="用户名" rules={[{ required: true, message: '不能为空' }]}>
                <Input placeholder="123456@qq.com" />
              </Form.Item>
              <Form.Item name="smtp_password" label={needsAuthCode ? '授权码（SMTP）' : '密码'}>
                <Input.Password placeholder={needsAuthCode ? '填授权码' : '密码'} />
              </Form.Item>
            </div>

            <Form.Item name="smtp_use_tls" valuePropName="checked">
              <Checkbox>使用 SSL/TLS 加密连接</Checkbox>
            </Form.Item>
          </Form>

          {testResult && (
            <Alert
              type={testResult.success ? 'success' : 'error'}
              message={testResult.success ? '连接测试成功' : '连接测试失败'}
              description={testResult.error}
              className="mb-4"
            />
          )}

          <div className="flex justify-between">
            <Space>
              <Button onClick={handleTest} loading={testing}>
                {testing ? '测试中…' : '测试连接'}
              </Button>
              <Popconfirm
                title="确定要删除此账户吗？"
                description="删除后，所有本地邮件数据将被清除，且无法恢复。"
                onConfirm={handleDelete}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除账户
                </Button>
              </Popconfirm>
            </Space>
            <Space>
              <Button onClick={onClose}>取消</Button>
              <Button type="primary" loading={saving} onClick={handleSave}>
                保存修改
              </Button>
            </Space>
          </div>
        </>
      )}

      {/* Add mode step 2: summary + test + save */}
      {step === 2 && mode === 'add' && (
        <div className="py-4">
          <div className="mb-4">
            <div className="font-medium mb-2">即将保存的账户信息</div>
            <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 space-y-1">
              <div><span className="text-gray-500">邮箱：</span>{form.getFieldValue('email') || '—'}</div>
              <div><span className="text-gray-500">IMAP：</span>{form.getFieldValue('imap_host')}:{form.getFieldValue('imap_port')}</div>
              <div><span className="text-gray-500">IMAP 用户名：</span>{form.getFieldValue('imap_user')}</div>
              <div><span className="text-gray-500">IMAP SSL/TLS：</span>{form.getFieldValue('imap_use_tls') ? '开启' : '关闭'}</div>
              <div><span className="text-gray-500">SMTP：</span>{form.getFieldValue('smtp_host')}:{form.getFieldValue('smtp_port')}</div>
              <div><span className="text-gray-500">SMTP 用户名：</span>{form.getFieldValue('smtp_user')}</div>
              <div><span className="text-gray-500">SMTP SSL/TLS：</span>{form.getFieldValue('smtp_use_tls') ? '开启' : '关闭'}</div>
            </div>
          </div>

          {testResult && (
            <Alert
              type={testResult.success ? 'success' : 'error'}
              message={testResult.success ? '连接测试成功！' : '连接测试失败'}
              description={testResult.error}
              icon={testResult.success ? <CheckCircleOutlined /> : undefined}
              className="mb-4"
            />
          )}

          <Button
            block
            onClick={handleTest}
            loading={testing}
            className="mb-2"
          >
            {testing ? '正在测试连接…' : '测试连接'}
          </Button>

          <div className="text-xs text-gray-400 text-center mb-4">
            点击「测试连接」可验证账户配置是否正确，再保存更保险
          </div>

          <div className="flex justify-end">
            <Space>
              <Button onClick={onClose}>取消</Button>
              <Button type="primary" loading={saving} onClick={handleSave}>
                添加账户并同步
              </Button>
            </Space>
          </div>
        </div>
      )}
    </Modal>
  )
}
