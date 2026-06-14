import { Alert, Card, Progress, Space, Statistic, Tag, Typography } from 'antd'
import { useAppStore } from '../stores/appStore'

const { Text } = Typography

export default function DiagnosticsPanel() {
  const { accounts, folders, emails, rules, selectedAccountId, selectedFolderId, debug } = useAppStore()

  const folderCount = folders.length
  const emailCount = emails.length
  const ruleCount = rules.length
  const complete = Math.round(((accounts.length > 0 ? 1 : 0) + (folderCount > 0 ? 1 : 0) + (emailCount > 0 ? 1 : 0) + (ruleCount > 0 ? 1 : 0)) / 4 * 100)

  const reasons = [] as string[]
  if (accounts.length === 0) reasons.push('没有已保存账户')
  if (folderCount === 0) reasons.push('没有同步到文件夹')
  if (emailCount === 0) reasons.push('没有同步到邮件')
  if (selectedAccountId == null) reasons.push('未选中账户')
  if (selectedFolderId == null) reasons.push('未选中文件夹')

  const ok = reasons.length === 0

  return (
    <Card className="panel-surface-strong diagnostics-panel" bordered={false} style={{ borderRadius: 20 }}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }} align="center">
          <Space size={12} wrap>
            <Text strong>诊断面板</Text>
            <Tag color={ok ? 'green' : 'red'}>{ok ? '数据正常' : '需要排查'}</Tag>
            <Text type="secondary">直接显示为什么没邮件</Text>
          </Space>
          <Text type="secondary">完整度 {complete}%</Text>
        </Space>

        <div className="diagnostics-inline">
          <Statistic title="账户" value={accounts.length} />
          <Statistic title="文件夹" value={folderCount} />
          <Statistic title="邮件" value={emailCount} />
          <Statistic title="规则" value={ruleCount} />
          <Statistic title="选中账户" value={selectedAccountId ?? '未选中'} />
          <Statistic title="选中文件夹" value={selectedFolderId ?? '未选中'} />
        </div>

        <div className="diagnostics-inline">
          <Statistic title="正文原始字节" value={debug.bodyRawBytes} />
          <Statistic title="正文主题" value={debug.bodySubject || '无'} />
          <Statistic title="纯文本长度" value={debug.bodyTextLength} />
          <Statistic title="HTML长度" value={debug.bodyHtmlLength} />
          <Statistic title="MIME Part" value={debug.bodyParts} />
          <Statistic title="当前模式" value={debug.bodyRawBytes > 0 ? '已抓取' : '未抓取'} />
        </div>

        {!ok ? <Alert type="warning" showIcon message="可能原因" description={reasons.join('、')} /> : <Alert type="success" showIcon message="当前没有结构性缺口" description="如果仍然看不到邮件，请检查同步结果或筛选条件。" />}

        <Progress percent={complete} status={ok ? 'success' : 'active'} />
      </Space>
    </Card>
  )
}
