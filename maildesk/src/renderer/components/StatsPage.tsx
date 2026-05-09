import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Statistic, Spin, Select, Space, Typography, Button } from 'antd'
import {
  MailOutlined, EyeOutlined, CheckCircleOutlined,
  UserOutlined, FolderOutlined, UnorderedListOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts'
import { useAppStore } from '../stores/appStore'

const { Title, Text } = Typography

interface StatsPageProps {
  onBack: () => void
}

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

export default function StatsPage({ onBack }: StatsPageProps) {
  const { stats, setStats } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [trendData, setTrendData] = useState<any[]>([])
  const [topSenders, setTopSenders] = useState<any[]>([])
  const [folderStats, setFolderStats] = useState<any[]>([])
  const [days, setDays] = useState(30)

  useEffect(() => {
    loadStats()
  }, [days])

  const loadStats = async () => {
    setLoading(true)
    try {
      const [dashboard, trend, topSendersData, folderStatsData] = await Promise.all([
        window.electronAPI.stats.getDashboard(),
        window.electronAPI.stats.getTrend(days),
        window.electronAPI.stats.getTopSenders(10),
        window.electronAPI.stats.getFolderStats(),
      ])

      setStats(dashboard)
      setTrendData(trend || [])
      setTopSenders(topSendersData || [])
      setFolderStats(folderStatsData || [])
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="large" />
      </div>
    )
  }

  const pieData = folderStats.slice(0, 6).map((f: any, i: number) => ({
    name: f.name,
    value: f.email_count,
    color: COLORS[i % COLORS.length],
  }))

  const barData = topSenders.map((s: any) => ({
    name: s.from_name || s.from_email.split('@')[0],
    count: s.count,
  }))

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} className="mb-2" />
          <Title level={3} className="m-0">邮件统计</Title>
          <Text type="secondary">了解你的邮件活动概况</Text>
        </div>
        <Select
          value={days}
          onChange={setDays}
          options={[
            { value: 7, label: '最近7天' },
            { value: 30, label: '最近30天' },
            { value: 90, label: '最近90天' },
            { value: 365, label: '最近一年' },
          ]}
          style={{ width: 140 }}
        />
      </div>

      {/* Overview Cards */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总邮件数"
              value={stats.totalEmails}
              prefix={<MailOutlined className="text-blue-500" />}
              valueStyle={{ color: '#2563eb' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="未读邮件"
              value={stats.unreadEmails}
              prefix={<EyeOutlined className="text-orange-500" />}
              valueStyle={{ color: '#f59e0b' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已配置账户"
              value={stats.totalAccounts}
              prefix={<UserOutlined className="text-green-500" />}
              valueStyle={{ color: '#16a34a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="活跃规则"
              value={stats.totalRules}
              prefix={<UnorderedListOutlined className="text-purple-500" />}
              valueStyle={{ color: '#8b5cf6' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Trend Chart */}
        <Col xs={24} lg={16}>
          <Card title="收件趋势" className="h-full">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => {
                    const d = new Date(v)
                    return `${d.getMonth() + 1}/${d.getDate()}`
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v) => new Date(v).toLocaleDateString('zh-CN')}
                  formatter={(v: any) => [`${v} 封`, '收件数']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCount)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* Folder Distribution */}
        <Col xs={24} lg={8}>
          <Card title="文件夹分布" className="h-full">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => [`${v} 封`, '邮件数']} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* Top Senders */}
        <Col xs={24}>
          <Card title="Top 发件人">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <Tooltip formatter={(v: any) => [`${v} 封`, '发件数']} />
                <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* Folder Details Table */}
        <Col xs={24}>
          <Card title="文件夹详情">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium">文件夹</th>
                    <th className="text-right py-2 px-3 font-medium">邮件总数</th>
                    <th className="text-right py-2 px-3 font-medium">未读数</th>
                    <th className="text-right py-2 px-3 font-medium">已读率</th>
                  </tr>
                </thead>
                <tbody>
                  {folderStats.map((f: any, i: number) => {
                    const total = f.email_count || 1
                    const read = total - (f.unread_count || 0)
                    const readRate = Math.round((read / total) * 100)
                    return (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="py-2 px-3 flex items-center gap-2">
                          <FolderOutlined className="text-gray-400" />
                          {f.name}
                        </td>
                        <td className="text-right py-2 px-3">{f.email_count}</td>
                        <td className="text-right py-2 px-3">
                          {f.unread_count > 0 && (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">
                              {f.unread_count}
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2 px-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${readRate}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{readRate}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
