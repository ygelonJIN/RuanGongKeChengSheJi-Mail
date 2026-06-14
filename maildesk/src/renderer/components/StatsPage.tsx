import { Card, Col, Empty, Progress, Row, Space, Statistic, Typography } from 'antd'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

const { Title, Text } = Typography

const fallback = [
  { day: 'Mon', value: 18 },
  { day: 'Tue', value: 32 },
  { day: 'Wed', value: 26 },
  { day: 'Thu', value: 44 },
  { day: 'Fri', value: 38 },
  { day: 'Sat', value: 52 },
  { day: 'Sun', value: 47 },
]

export default function StatsPage() {
  const { stats } = useAppStore()

  useEffect(() => {
    if (window.electronAPI) window.electronAPI.stats.getDashboard().then((data) => useAppStore.getState().setStats(data))
  }, [])

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>统计看板</Title>
        <Text type="secondary">Aurora 风格的收发趋势与账户概览</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}><Card className="panel-surface-strong" bordered={false}><Statistic title="总邮件数" value={stats.totalEmails} /></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="panel-surface-strong" bordered={false}><Statistic title="未读邮件" value={stats.unreadEmails} /></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="panel-surface-strong" bordered={false}><Statistic title="账户数" value={stats.totalAccounts} /></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="panel-surface-strong" bordered={false}><Statistic title="规则数" value={stats.totalRules} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card className="panel-surface-strong" bordered={false} style={{ borderRadius: 24 }}>
            <Title level={5}>近 7 天趋势</Title>
            {stats.totalEmails === 0 ? (
              <Empty description="暂无统计数据" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={fallback}>
                  <defs><linearGradient id="auroraFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5b7cfa" stopOpacity={0.85} /><stop offset="95%" stopColor="#5b7cfa" stopOpacity={0.08} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="day" /><YAxis /><Tooltip /><Area type="monotone" dataKey="value" stroke="#5b7cfa" fill="url(#auroraFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card className="panel-surface-strong" bordered={false} style={{ borderRadius: 24 }}>
            <Title level={5}>系统健康</Title>
            <Space direction="vertical" style={{ width: '100%' }} size={14}>
              <div><Text type="secondary">同步完成率</Text><Progress percent={96} /></div>
              <div><Text type="secondary">规则命中率</Text><Progress percent={78} /></div>
              <div><Text type="secondary">附件解析</Text><Progress percent={84} /></div>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
