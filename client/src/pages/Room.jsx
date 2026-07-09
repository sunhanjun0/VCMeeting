import { useParams, useNavigate } from 'react-router-dom';
import { Result, Button, Space } from 'antd';
import { useApp } from '../AppContext.jsx';
import { useSlice } from '../core/store.js';
import RoomView from '../features/room/RoomView.jsx';
import UploadPanel from '../features/content/UploadPanel.jsx';
import IframeStage from '../features/sync/IframeStage.jsx';

// Assembly only. If there's no active session for this room (e.g. a hard refresh),
// prompt the user back to Home. Auto-reconnect via share token is task 5.2.
export default function Room() {
  const { id } = useParams();
  const navigate = useNavigate();
  const app = useApp();
  const room = useSlice(app.store, 'room');

  const active = room.status === 'joined' && room.roomId === id;
  if (!active) {
    return (
      <Result
        status="info"
        title="尚未加入该房间"
        subTitle="请从首页创建或加入房间。"
        extra={<Button type="primary" onClick={() => navigate('/')}>回到首页</Button>}
      />
    );
  }
  // App-layer composition: everyone sees the presentation stage; the host also gets
  // the upload panel above it. Cross-feature wiring lives here (assembly), not inside
  // a feature (§13).
  return (
    <RoomView>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {room.role === 'host' && <UploadPanel />}
        <IframeStage />
      </Space>
    </RoomView>
  );
}
