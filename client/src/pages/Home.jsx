import { Link } from 'react-router-dom';
import { Typography, Space } from 'antd';

// Assembly placeholder. Create/join forms land in features/room (task 3.3).
export default function Home() {
  return (
    <Space direction="vertical" style={{ padding: 24 }}>
      <Typography.Title level={2}>LivePage</Typography.Title>
      <Typography.Paragraph>实时演示同步工具（脚手架占位页）。</Typography.Paragraph>
      <Link to="/room/demo">进入示例房间 /room/demo</Link>
    </Space>
  );
}
