import { useParams, Link } from 'react-router-dom';
import { Typography, Space } from 'antd';

// Assembly placeholder. IframeStage + feature modules mount here in later tasks.
export default function Room() {
  const { id } = useParams();
  return (
    <Space direction="vertical" style={{ padding: 24 }}>
      <Typography.Title level={3}>房间 {id}</Typography.Title>
      <Typography.Paragraph>房间装配页（脚手架占位）。</Typography.Paragraph>
      <Link to="/">返回首页</Link>
    </Space>
  );
}
