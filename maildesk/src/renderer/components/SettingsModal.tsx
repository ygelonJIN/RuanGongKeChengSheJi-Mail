import { Button, Card, Divider, InputNumber, Modal, Select, Space, Switch, Tabs, Typography, message } from 'antd'
import { useAppStore } from '../stores/appStore'

const { Title, Text } = Typography

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { settings, setSettings } = useAppStore()

  const save = async () => {
    try {
      if (window.electronAPI) await window.electronAPI.settings.set(settings)
      message.success('设置已保存')
      onClose()
    } catch {
      message.error('保存设置失败')
    }
  }

  return (
    <Modal open={open} onCancel={onClose} onOk={save} width={720} centered title="设置" className="settings-modal">
      <Tabs
        items={[
          {
            key: 'general',
            label: '常规',
            children: (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <Card bordered={false} className="panel-surface-strong" style={{ borderRadius: 22 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div><Title level={5} style={{ margin: 0 }}>主题</Title><Text type="secondary">选择应用外观</Text></div>
                    <Select value={settings.theme || 'system'} onChange={(theme) => setSettings({ ...settings, theme })} style={{ width: 160 }} options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }, { value: 'system', label: '跟随系统' }]} />
                  </Space>
                </Card>
                <Card bordered={false} className="panel-surface-strong" style={{ borderRadius: 22 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div><Title level={5} style={{ margin: 0 }}>自动同步</Title><Text type="secondary">启动后自动同步邮件</Text></div>
                    <Switch checked={settings.auto_sync !== 'false'} onChange={(v) => setSettings({ ...settings, auto_sync: String(v) })} />
                  </Space>
                </Card>
                <Card bordered={false} className="panel-surface-strong" style={{ borderRadius: 22 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div><Title level={5} style={{ margin: 0 }}>同步间隔</Title><Text type="secondary">单位为秒</Text></div>
                    <InputNumber min={60} max={3600} value={Number(settings.sync_interval || 300)} onChange={(v) => setSettings({ ...settings, sync_interval: String(v || 300) })} addonAfter="秒" />
                  </Space>
                </Card>
              </Space>
            ),
          },
          {
            key: 'notifications',
            label: '通知',
            children: (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <Card bordered={false} className="panel-surface-strong" style={{ borderRadius: 22 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div><Title level={5} style={{ margin: 0 }}>新邮件通知</Title><Text type="secondary">显示桌面通知与声音</Text></div>
                    <Switch checked={settings.notification_enabled !== 'false'} onChange={(v) => setSettings({ ...settings, notification_enabled: String(v) })} />
                  </Space>
                </Card>
                <Card bordered={false} className="panel-surface-strong" style={{ borderRadius: 22 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div><Title level={5} style={{ margin: 0 }}>提示音</Title><Text type="secondary">选择通知音效</Text></div>
                    <Select value={settings.notification_sound || 'default'} onChange={(v) => setSettings({ ...settings, notification_sound: v })} style={{ width: 160 }} options={[{ value: 'default', label: '默认' }, { value: 'simple', label: '简洁' }, { value: 'none', label: '无声' }]} />
                  </Space>
                </Card>
              </Space>
            ),
          },
          {
            key: 'storage',
            label: '存储',
            children: (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <Card bordered={false} className="panel-surface-strong" style={{ borderRadius: 22 }}>
                  <Text strong>缓存限制</Text>
                  <Divider style={{ margin: '12px 0' }} />
                  <Select value={settings.retention_days || '365'} onChange={(v) => setSettings({ ...settings, retention_days: v })} style={{ width: 180 }} options={[{ value: '30', label: '30 天' }, { value: '90', label: '90 天' }, { value: '365', label: '1 年' }, { value: '0', label: '永久保留' }]} />
                </Card>
                <Card bordered={false} className="panel-surface-strong" style={{ borderRadius: 22 }}>
                  <Text strong>同步清理</Text>
                  <Divider style={{ margin: '12px 0' }} />
                  <Button danger onClick={async () => { try { await window.electronAPI.settings.clearCache(); message.success('缓存已清理') } catch { message.error('清理失败') } }}>清理缓存</Button>
                </Card>
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  )
}
