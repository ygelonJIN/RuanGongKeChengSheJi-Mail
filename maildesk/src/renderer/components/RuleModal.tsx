import React, { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Switch, Button, Card, Space, Tag, message, Divider, Dropdown, List, Empty } from 'antd'
import {
  PlusOutlined, FilterOutlined, DeleteOutlined, EditOutlined,
  DownOutlined, SaveOutlined, SwapOutlined, FolderOutlined,
  TagOutlined, BellOutlined, SoundOutlined, CheckOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import type { Rule, RuleCondition, RuleAction } from '../types'

interface RuleModalProps {
  open: boolean
  ruleId: number | null
  onClose: () => void
  onSaved: () => void
}

const fieldOptions = [
  { value: 'subject', label: '主题' },
  { value: 'from', label: '发件人' },
  { value: 'to', label: '收件人' },
  { value: 'body', label: '正文' },
  { value: 'hasAttachment', label: '附件' },
  { value: 'isRead', label: '已读状态' },
  { value: 'isStarred', label: '星标' },
  { value: 'priority', label: '优先级' },
]

const operatorOptions: Record<string, { value: string; label: string }[]> = {
  subject: [
    { value: 'contains', label: '包含' },
    { value: 'notContains', label: '不包含' },
    { value: 'equals', label: '等于' },
    { value: 'startsWith', label: '开头是' },
    { value: 'endsWith', label: '结尾是' },
  ],
  from: [
    { value: 'contains', label: '包含' },
    { value: 'notContains', label: '不包含' },
    { value: 'equals', label: '等于' },
    { value: 'regex', label: '正则匹配' },
  ],
  to: [
    { value: 'contains', label: '包含' },
    { value: 'notContains', label: '不包含' },
  ],
  body: [
    { value: 'contains', label: '包含' },
    { value: 'notContains', label: '不包含' },
    { value: 'regex', label: '正则匹配' },
  ],
  hasAttachment: [
    { value: 'equals', label: '等于' },
  ],
  isRead: [
    { value: 'equals', label: '等于' },
  ],
  isStarred: [
    { value: 'equals', label: '等于' },
  ],
  priority: [
    { value: 'equals', label: '等于' },
  ],
}

const actionOptions = [
  { value: 'moveToFolder', label: '移动到文件夹', icon: <FolderOutlined /> },
  { value: 'markRead', label: '标记为已读', icon: <CheckOutlined /> },
  { value: 'markUnread', label: '标记为未读', icon: <EditOutlined /> },
  { value: 'star', label: '添加星标', icon: <TagOutlined /> },
  { value: 'unstar', label: '移除星标', icon: <TagOutlined /> },
  { value: 'addTag', label: '添加标签', icon: <TagOutlined /> },
  { value: 'delete', label: '移至垃圾箱', icon: <DeleteOutlined /> },
  { value: 'notify', label: '桌面通知', icon: <BellOutlined /> },
  { value: 'playSound', label: '播放提示音', icon: <SoundOutlined /> },
]

export default function RuleModal({ open, ruleId, onClose, onSaved }: RuleModalProps) {
  const { rules, folders, tags, accounts } = useAppStore()
  const [mode, setMode] = useState<'list' | 'edit' | 'create'>('list')
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [ruleName, setRuleName] = useState('')
  const [conditions, setConditions] = useState<RuleCondition[]>([])
  const [actions, setActions] = useState<RuleAction[]>([])
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setMode('list')
    }
  }, [open])

  useEffect(() => {
    if (ruleId) {
      const rule = rules.find((r: Rule) => r.id === ruleId)
      if (rule) {
        setEditingRule(rule)
        setRuleName(rule.name)
        setConditions(rule.conditions)
        setActions(rule.actions)
        setEnabled(!!rule.enabled)
        setMode('edit')
      }
    }
  }, [ruleId, rules])

  const addCondition = () => {
    setConditions([
      ...conditions,
      { id: Date.now().toString(), field: 'subject', operator: 'contains', value: '' },
    ])
  }

  const removeCondition = (id: string) => {
    setConditions(conditions.filter((c) => c.id !== id))
  }

  const updateCondition = (id: string, field: keyof RuleCondition, value: any) => {
    setConditions(
      conditions.map((c) =>
        c.id === id ? { ...c, [field]: value, ...(field === 'field' ? { operator: 'contains', value: '' } : {}) } : c
      )
    )
  }

  const addAction = () => {
    setActions([
      ...actions,
      { id: Date.now().toString(), type: 'markRead' as any },
    ])
  }

  const removeAction = (id: string) => {
    setActions(actions.filter((a) => a.id !== id))
  }

  const updateAction = (id: string, field: keyof RuleAction, value: any) => {
    setActions(actions.map((a) => (a.id === id ? { ...a, [field]: value } : a)))
  }

  const handleSave = async () => {
    if (!ruleName.trim()) {
      message.error('请输入规则名称')
      return
    }
    if (conditions.length === 0) {
      message.error('请添加至少一个条件')
      return
    }
    if (actions.length === 0) {
      message.error('请添加至少一个操作')
      return
    }

    setSaving(true)
    try {
      const ruleData = {
        name: ruleName,
        conditions,
        actions,
        priority: editingRule?.priority || 0,
        enabled,
      }

      if (mode === 'edit' && editingRule) {
        await window.electronAPI.rule.update(editingRule.id, ruleData)
      } else {
        await window.electronAPI.rule.create(ruleData)
      }

      message.success(mode === 'edit' ? '规则已更新' : '规则已创建')
      onSaved()
      setMode('list')
      setEditingRule(null)
    } catch (err: any) {
      message.error(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await window.electronAPI.rule.delete(id)
    onSaved()
    message.success('规则已删除')
  }

  const handleTest = async () => {
    if (!editingRule && mode === 'create') {
      message.warning('请先保存规则后再测试')
      return
    }
    const ruleId = editingRule?.id || (await window.electronAPI.rule.create({
      name: ruleName,
      conditions,
      actions,
      priority: 999,
      enabled: true,
    }))?.id

    if (ruleId) {
      const results = await window.electronAPI.rule.test(ruleId)
      if (Array.isArray(results)) {
        message.info(`测试匹配到 ${results.length} 封历史邮件`)
      }
    }
  }

  const renderConditionEditor = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">条件（满足以下全部条件）</span>
        <Button size="small" icon={<PlusOutlined />} onClick={addCondition}>
          添加条件
        </Button>
      </div>
      {conditions.map((cond, idx) => (
        <div key={cond.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <Select
            size="small"
            value={cond.field}
            onChange={(v) => updateCondition(cond.id, 'field', v)}
            options={fieldOptions}
            style={{ width: 100 }}
          />
          <Select
            size="small"
            value={cond.operator}
            onChange={(v) => updateCondition(cond.id, 'operator', v)}
            options={operatorOptions[cond.field] || operatorOptions.subject}
            style={{ width: 100 }}
          />
          {['hasAttachment', 'isRead', 'isStarred'].includes(cond.field) ? (
            <Select
              size="small"
              value={cond.value === true || cond.value === 'true'}
              onChange={(v) => updateCondition(cond.id, 'value', v)}
              options={[
                { value: true, label: '是' },
                { value: false, label: '否' },
              ]}
              style={{ width: 80 }}
            />
          ) : (
            <Input
              size="small"
              placeholder="值"
              value={cond.value as string}
              onChange={(e) => updateCondition(cond.id, 'value', e.target.value)}
              style={{ flex: 1 }}
            />
          )}
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeCondition(cond.id)} />
        </div>
      ))}
      {conditions.length === 0 && (
        <Empty description="暂无条件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  )

  const renderActionEditor = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">操作</span>
        <Button size="small" icon={<PlusOutlined />} onClick={addAction}>
          添加操作
        </Button>
      </div>
      {actions.map((action) => (
        <div key={action.id} className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
          <Select
            size="small"
            value={action.type}
            onChange={(v) => updateAction(action.id, 'type', v)}
            options={actionOptions.map((o) => ({ value: o.value, label: o.label }))}
            style={{ width: 140 }}
          />
          {action.type === 'moveToFolder' && (
            <Select
              size="small"
              placeholder="选择文件夹"
              value={action.value as number | undefined}
              onChange={(v) => updateAction(action.id, 'value', v)}
              options={folders.map((f: any) => ({ value: f.id, label: f.name }))}
              style={{ flex: 1 }}
              allowClear
            />
          )}
          {action.type === 'addTag' && (
            <Select
              size="small"
              placeholder="选择标签"
              value={action.value as number | undefined}
              onChange={(v) => updateAction(action.id, 'value', v)}
              options={tags.map((t: any) => ({ value: t.id, label: t.name }))}
              style={{ flex: 1 }}
              allowClear
            />
          )}
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeAction(action.id)} />
        </div>
      ))}
      {actions.length === 0 && (
        <Empty description="暂无操作" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  )

  const renderRuleList = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-lg font-medium">规则管理</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setMode('create')}>
          新建规则
        </Button>
      </div>

      <List
        dataSource={rules.filter((r: Rule) => !r.is_template)}
        renderItem={(rule: Rule) => (
          <List.Item
            actions={[
              <Button key="edit" type="text" icon={<EditOutlined />} onClick={() => {
                setEditingRule(rule)
                setRuleName(rule.name)
                setConditions(rule.conditions)
                setActions(rule.actions)
                setEnabled(!!rule.enabled)
                setMode('edit')
              }} />,
              <Button key="delete" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(rule.id)} />,
            ]}
          >
            <List.Item.Meta
              avatar={<Switch checked={!!rule.enabled} onChange={async (v) => {
                await window.electronAPI.rule.update(rule.id, { ...rule, enabled: v })
                onSaved()
              }} />}
              title={<span className={rule.enabled ? '' : 'line-through text-gray-400'}>{rule.name}</span>}
              description={
                <span className="text-xs text-gray-500">
                  条件: {rule.conditions.length}个 | 操作: {rule.actions.length}个 | 已匹配: {rule.match_count}封
                </span>
              }
            />
          </List.Item>
        )}
        locale={{ emptyText: <Empty description="暂无规则，点击上方按钮创建" /> }}
      />
    </div>
  )

  return (
    <Modal
      open={open}
      title={mode === 'list' ? '规则管理' : (mode === 'create' ? '新建规则' : '编辑规则')}
      width={700}
      onCancel={() => {
        if (mode === 'list') {
          onClose()
        } else {
          setMode('list')
          setEditingRule(null)
        }
      }}
      footer={
        mode === 'list' ? null : (
          <Space>
            <Button onClick={() => {
              setMode('list')
              setEditingRule(null)
            }}>取消</Button>
            <Button onClick={handleTest}>测试</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              保存
            </Button>
          </Space>
        )
      }
    >
      {mode === 'list' ? (
        renderRuleList()
      ) : (
        <div className="space-y-4">
          <Form layout="vertical">
            <Form.Item label="规则名称">
              <Input
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="给规则起个名字"
              />
            </Form.Item>
            <Form.Item label="启用规则">
              <Switch checked={enabled} onChange={setEnabled} />
            </Form.Item>
          </Form>

          <Divider />

          {renderConditionEditor()}

          <Divider />

          {renderActionEditor()}
        </div>
      )}
    </Modal>
  )
}
