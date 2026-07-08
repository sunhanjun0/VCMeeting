// Room view (room feature UI). Renders room identity + live participant list.
// The iframe stage and other features mount alongside this in later tasks.

import { useNavigate } from 'react-router-dom';
import { Layout, Typography, List, Tag, Badge, Button, Space } from 'antd';
import { useApp } from '../../AppContext.jsx';
import { useSlice } from '../../core/store.js';
import { leaveRoom } from './actions.js';

export default function RoomView() {
  const app = useApp();
  const navigate = useNavigate();
  const room = useSlice(app.store, 'room');

  async function onLeave() {
    await leaveRoom(app);
    navigate('/');
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <Typography.Text strong style={{ color: '#fff' }}>房间 {room.roomId}</Typography.Text>
          <Tag color={room.role === 'host' ? 'gold' : 'blue'}>{room.role === 'host' ? '主持人' : '参会者'}</Tag>
        </Space>
        <Button size="small" onClick={onLeave}>离开</Button>
      </Layout.Header>
      <Layout>
        <Layout.Content style={{ padding: 24 }}>
          <Typography.Paragraph type="secondary">演示区（iframe 舞台将在后续任务挂载）。</Typography.Paragraph>
        </Layout.Content>
        <Layout.Sider width={260} theme="light" style={{ padding: 16 }}>
          <Typography.Title level={5}>参会者（{room.participants.length}）</Typography.Title>
          <List
            size="small"
            dataSource={room.participants}
            renderItem={(p) => (
              <List.Item>
                <Space>
                  <Badge status={p.connected ? 'success' : 'default'} />
                  <span>{p.name}</span>
                  {p.role === 'host' && <Tag color="gold">主持人</Tag>}
                </Space>
              </List.Item>
            )}
          />
        </Layout.Sider>
      </Layout>
    </Layout>
  );
}
