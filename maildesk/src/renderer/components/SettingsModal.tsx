import React, { useState } from 'react'
import { Modal, Tabs, Switch, Select, InputNumber, Button, Slider, Space, message, Divider } from 'antd'
import {
  BellOutlined, BgColorsOutlined, DatabaseOutlined,
  SafetyOutlined, SyncOutlined, InfoCircleOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { settings, setSettings, theme, setTheme } = useAppStore()
  const [localSettings, setLocalSettings] = useState(settings)

  const handleSave = async () => {
    try {
      await window.electronAPI.settings.set(localSettings as any)
      setSettings(localSettings)

      if (localSettings.theme && localSettings.theme !== theme) {
        await window.electronAPI.settings.setTheme(localSettings.theme as 'light' | 'dark' | 'system')
        const actualTheme = localSettings.theme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : localSettings.theme
        setTheme(actualTheme as 'light' | 'dark')
        document.documentElement.classList.toggle('dark', actualTheme === 'dark')
      }

      message.success('设置已保存')
      onClose()
    } catch (err) {
      message.error('保存失败')
    }
  }

  const updateSetting = (key: string, value: any) => {
    setLocalSettings((prev: any) => ({ ...prev, [key]: value }))
  }

  return (
    <Modal
      open={open}
      title="设置"
      width={600}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="取消"
    >
      <Tabs
        defaultActiveKey="general"
        items={[
          {
            key: 'general',
            label: '常规',
            children: (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">深色模式</div>
                    <div className="text-sm text-gray-500">选择应用外观主题</div>
                  </div>
                  <Select
                    value={localSettings.theme || 'system'}
                    onChange={(v) => updateSetting('theme', v)}
                    options={[
                      { value: 'light', label: '浅色' },
                      { value: 'dark', label: '深色' },
                      { value: 'system', label: '跟随系统' },
                    ]}
                    style={{ width: 140 }}
                  />
                </div>

                <Divider />

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">自动同步</div>
                    <div className="text-sm text-gray-500">启动时自动同步所有账户邮件</div>
                  </div>
                  <Switch
                    checked={localSettings.auto_sync !== 'false'}
                    onChange={(v) => updateSetting('auto_sync', String(v))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">同步间隔</div>
                    <div className="text-sm text-gray-500">邮件同步的时间间隔（秒）</div>
                  </div>
                  <InputNumber
                    min={60}
                    max={3600}
                    step={60}
                    value={parseInt(localSettings.sync_interval || '300')}
                    onChange={(v) => updateSetting('sync_interval', String(v))}
                    addonAfter="秒"
                  />
                </div>

                <Divider />

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">显示预览窗格</div>
                    <div className="text-sm text-gray-500">在邮件列表右侧显示邮件预览</div>
                  </div>
                  <Switch
                    checked={localSettings.preview_pane !== 'false'}
                    onChange={(v) => updateSetting('preview_pane', String(v))}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'notification',
            label: '通知',
            children: (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">启用通知</div>
                    <div className="text-sm text-gray-500">收到新邮件时显示桌面通知</div>
                  </div>
                  <Switch
                    checked={localSettings.notification_enabled !== 'false'}
                    onChange={(v) => updateSetting('notification_enabled', String(v))}
                  />
                </div>

                <Divider />

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">通知声音</div>
                    <div className="text-sm text-gray-500">新邮件提示音</div>
                  </div>
                  <Select
                    value={localSettings.notification_sound || 'default'}
                    onChange={(v) => updateSetting('notification_sound', v)}
                    options={[
                      { value: 'default', label: '默认提示音' },
                      { value: 'simple', label: '简洁提示音' },
                      { value: 'important', label: '重要提示音' },
                      { value: 'none', label: '无声' },
                    ]}
                    style={{ width: 160 }}
                  />
                </div>

                <Divider />

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">勿扰模式</div>
                    <div className="text-sm text-gray-500">在指定时间段内静音</div>
                  </div>
                  <Switch
                    checked={localSettings.dnd_enabled === 'true'}
                    onChange={(v) => updateSetting('dnd_enabled', String(v))}
                  />
                </div>

                {localSettings.dnd_enabled === 'true' && (
                  <div className="flex items-center gap-4 ml-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">从</span>
                      <InputNumber
                        size="small"
                        min={0}
                        max={23}
                        value={parseInt(localSettings.dnd_start?.split(':')[0] || '22')}
                        onChange={(v) => updateSetting('dnd_start', `${String(v).padStart(2, '0')}:00`)}
                      />
                      <span className="text-sm">到</span>
                      <InputNumber
                        size="small"
                        min={0}
                        max={23}
                        value={parseInt(localSettings.dnd_end?.split(':')[0] || '8')}
                        onChange={(v) => updateSetting('dnd_end', `${String(v).padStart(2, '0')}:00`)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'storage',
            label: '存储',
            children: (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">存储空间限制</div>
                      <div className="text-sm text-gray-500">本地缓存邮件数据的上限</div>
                    </div>
                    <span className="text-sm text-gray-500">
                      {Math.round(parseInt(localSettings.storage_limit || '5368709120') / (1024 * 1024 * 1024) * 10) / 10} GB
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={50}
                    value={Math.round(parseInt(localSettings.storage_limit || '5368709120') / (1024 * 1024 * 1024))}
                    onChange={(v) => updateSetting('storage_limit', String(v * 1024 * 1024 * 1024))}
                    marks={{ 1: '1G', 10: '10G', 20: '20G', 50: '50G' }}
                  />
                </div>

                <Divider />

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">数据保留期限</div>
                    <div className="text-sm text-gray-500">超过此期限的邮件正文将被清理</div>
                  </div>
                  <Select
                    value={localSettings.retention_days || '365'}
                    onChange={(v) => updateSetting('retention_days', v)}
                    options={[
                      { value: '30', label: '30天' },
                      { value: '90', label: '90天' },
                      { value: '180', label: '180天' },
                      { value: '365', label: '1年' },
                      { value: '730', label: '2年' },
                      { value: '0', label: '永久保留' },
                    ]}
                    style={{ width: 120 }}
                  />
                </div>

                <Divider />

                <Button danger onClick={async () => {
                  await window.electronAPI.settings.clearCache()
                  message.success('缓存已清理')
                }}>
                  清理邮件缓存
                </Button>

                <Divider />

                <div className="space-y-3">
                  <div className="font-medium">数据导入 / 导出</div>
                  <div className="flex gap-2">
                    <Button onClick={async () => {
                      const result = await window.electronAPI.settings.exportData('mbox')
                      if (result.success) {
                        message.success('导出成功')
                      }
                    }}>
                      导出 MBOX
                    </Button>
                    <Button onClick={async () => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = '.mbox'
                      input.onchange = async () => {
                        if (input.files?.[0]) {
                          try {
                            const result = await window.electronAPI.settings.importData('mbox', input.files[0].path)
                            if (result.success) {
                              message.success(`导入成功，共 ${result.imported || 0} 封邮件`)
                            } else {
                              message.error(result.error || '导入失败')
                            }
                          } catch (e: any) {
                            message.error(e.message || '导入失败')
                          }
                        }
                      }
                      input.click()
                    }}>
                      导入 MBOX
                    </Button>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'about',
            label: '关于',
            children: (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <h2 className="text-2xl font-bold mb-2">MailDesk</h2>
                  <p className="text-gray-500">版本 1.0.0</p>
                  <p className="text-sm text-gray-400 mt-4">
                    一款现代化的 Windows 桌面邮件客户端
                  </p>
                </div>
                <Divider />
                <div className="text-sm text-gray-500 space-y-2">
                  <div className="flex justify-between">
                    <span>技术栈</span>
                    <span>Electron + React + TypeScript</span>
                  </div>
                  <div className="flex justify-between">
                    <span>数据存储</span>
                    <span>SQLite + FTS5</span>
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />
    </Modal>
  )
}
