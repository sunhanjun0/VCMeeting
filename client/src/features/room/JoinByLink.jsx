// Join-by-link form (room feature UI, task 5.2). Shown when someone opens a shared
// /room/:id?token=... without an active session. A valid token joins with just a
// nickname (no password); an expired/invalid token falls back to asking for the
// room password (§2.2, §9). Uses the shared joinRoom flow; never touches the socket.

import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, App as AntApp } from 'antd';
import { useApp } from '../../AppContext.jsx';
import { joinRoom } from './actions.js';

export default function JoinByLink() {
  const app = useApp();
  const { id: roomId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);

  async function onFinish(values) {
    setLoading(true);
    try {
      const payload = needPassword
        ? { roomId, name: values.name, password: values.password }
        : { roomId, name: values.name, token };
      await joinRoom(app, payload);
      // Drop the token from the address bar once joined (avoid leaking it in history).
      navigate(`/room/${roomId}`, { replace: true });
    } catch (e) {
      if (e.code === 'unauthorized' && !needPassword) {
        setNeedPassword(true);
        message.warning('分享链接已失效或无效，请输入房间密码');
      } else if (e.code === 'unauthorized') {
        message.error('房间密码错误');
      } else {
        message.error(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: 16 }}>
      <Typography.Title level={3} style={{ textAlign: 'center' }}>加入房间 {roomId}</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
        {needPassword ? '分享链接已失效，请输入房间密码' : '通过分享链接加入，无需密码'}
      </Typography.Paragraph>
      <Card>
        <Form layout="vertical" onFinish={onFinish} disabled={loading}>
          <Form.Item name="name" label="你的昵称" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input placeholder="你的昵称" autoComplete="off" />
          </Form.Item>
          {needPassword && (
            <Form.Item name="password" label="房间密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password placeholder="房间密码" autoComplete="off" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block loading={loading}>加入房间</Button>
        </Form>
      </Card>
    </div>
  );
}
