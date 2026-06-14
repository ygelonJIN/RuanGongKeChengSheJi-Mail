import { useEffect, useState } from 'react'
import { Button, Card, Divider, Input, Modal, Select, Space, Tag, Typography, message } from 'antd'
import { CheckCircleOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'

const { Title, Text, Paragraph } = Typography

interface RuleModalProps { open: boolean; onClose: () => void }

export default function RuleModal({ open, onClose }: RuleModalProps) {
  const [name, setName] = useState('')
  const { setRules } = useAppStore()

  useEffect(() => { if (open) setName('') }, [open])

  const save = async () => {
    try {
      const rule = { name, conditions: [], actions: [], priority: 0, enabled: true }
      const result = window.electronAPI ? await window.electronAPI.rule.create(rule) : rule
      setRules((prev) => [...prev, result] as any)
      message.success('规则已保存')
      onClose()
    } catch {
      message.error('保存规则失败')
    }
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={860} centered title={null} className="rule-modal">
      <div className="pane-header" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>规则引擎</Title>
          <Text type="secondary">用条件和动作构建自动化流</Text>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Card className="panel-surface-strong" bordered={false} style={{ borderRadius: 22 }}>
            <Space direction="vertical" style={{ width: '100%' }}><Text strong>规则名称</Text><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：将通知邮件自动归档" /></Space>
          </Card>
          <Card className="panel-surface-strong" bordered={false} style={{ borderRadius: 22 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space><FilterOutlined /><Text strong>条件</Text></Space>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>当邮件满足这些条件时触发动作。</Paragraph>
              <Space wrap><Tag color="blue">发件人包含</Tag><Tag color="cyan">主题包含</Tag><Tag color="purple">未读</Tag></Space>
              <Button icon={<PlusOutlined />}>添加条件</Button>
            </Space>
          </Card>
          <Card className="panel-surface-strong" bordered={false} style={{ borderRadius: 22 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space><CheckCircleOutlined /><Text strong>动作</Text></Space>
              <Select defaultValue="move" style={{ width: '100%' }} options={[{ value: 'move', label: '移动到文件夹' }, { value: 'read', label: '标记已读' }, { value: 'star', label: '加星标' }]} />
            </Space>
          </Card>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Tag color="blue">匹配优先级高</Tag>
            <Space><Button onClick={onClose}>取消</Button><Button type="primary" onClick={save}>保存规则</Button></Space>
          </div>
        </Space>
      </div>
    </Modal>
  )
}
