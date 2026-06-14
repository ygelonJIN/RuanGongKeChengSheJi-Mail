import { Button, Card, Divider, Input, Modal, Space, Tag, Typography } from 'antd'
import { CloseOutlined, PaperClipOutlined, SendOutlined, SaveOutlined } from '@ant-design/icons'

const { TextArea } = Input
const { Title, Text } = Typography

interface ComposeProps {
  open: boolean
  onClose: () => void
}

export default function Compose({ open, onClose }: ComposeProps) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={860} centered className="compose-modal" title={null}>
      <div className="pane-header" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>写邮件</Title>
          <Text type="secondary">Aurora 统一写作面板</Text>
        </div>
        <Space>
          <Button icon={<SaveOutlined />}>草稿</Button>
          <Button icon={<CloseOutlined />} onClick={onClose} />
        </Space>
      </div>

      <div style={{ padding: 20 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Input placeholder="收件人" />
          <Input placeholder="主题" />
          <Card className="panel-surface-strong" bordered={false} style={{ borderRadius: 22 }}>
            <TextArea rows={10} placeholder="开始写你的邮件内容..." bordered={false} />
          </Card>
          <Space wrap>
            <Tag color="blue">附件</Tag>
            <Tag color="purple">富文本</Tag>
            <Tag color="cyan">模板</Tag>
          </Space>
        </Space>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button icon={<PaperClipOutlined />}>添加附件</Button>
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" icon={<SendOutlined />}>发送</Button>
        </Space>
      </div>
    </Modal>
  )
}
