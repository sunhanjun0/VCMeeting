// Create/Join form (room feature UI). On success, navigates to /room/:id.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tabs, Form, Input, Button, Typography, App as AntApp } from 'antd';
import { useApp } from '../../AppContext.jsx';
import { createRoom, joinRoom } from './actions.js';

export default function HomeForm() {
  const app = useApp();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(false);

  async function onCreate(values) {
    setLoading(true);
    try {
      const { roomId } = await createRoom(app, values);
      message.success(`房间已创建：${roomId}`);
      navigate(`/room/${roomId}`);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onJoin(values) {
    setLoading(true);
    try {
      await joinRoom(app, values);
      navigate(`/room/${values.roomId}`);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  const createTab = (
    <Form layout="vertical" onFinish={onCreate} disabled={loading}>
      <Form.Item name="name" label="你的昵称" rules={[{ required: true, message: '请输入昵称' }]}>
        <Input placeholder="Alice" autoComplete="off" />
      </Form.Item>
      <Form.Item name="password" label="房间密码" rules={[{ required: true, message: '请设置密码' }]}>
        <Input.Password placeholder="用于他人加入" autoComplete="new-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={loading}>创建房间</Button>
    </Form>
  );

  const joinTab = (
    <Form layout="vertical" onFinish={onJoin} disabled={loading}>
      <Form.Item name="roomId" label="房间号" rules={[{ required: true, message: '请输入房间号' }]}>
        <Input placeholder="房间号" autoComplete="off" />
      </Form.Item>
      <Form.Item name="name" label="你的昵称" rules={[{ required: true, message: '请输入昵称' }]}>
        <Input placeholder="Bob" autoComplete="off" />
      </Form.Item>
      <Form.Item name="password" label="房间密码" rules={[{ required: true, message: '请输入密码' }]}>
        <Input.Password placeholder="房间密码" autoComplete="off" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={loading}>加入房间</Button>
    </Form>
  );

  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: 16 }}>
      <Typography.Title level={2} style={{ textAlign: 'center' }}>LivePage</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
        实时演示同步工具
      </Typography.Paragraph>
      <Card>
        <Tabs
          centered
          items={[
            { key: 'create', label: '创建房间', children: createTab },
            { key: 'join', label: '加入房间', children: joinTab }
          ]}
        />
      </Card>
    </div>
  );
}
