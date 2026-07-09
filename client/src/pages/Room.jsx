import { useParams, useNavigate } from 'react-router-dom';
import { Result, Button } from 'antd';
import { useApp } from '../AppContext.jsx';
import { useSlice } from '../core/store.js';
import RoomView from '../features/room/RoomView.jsx';
import UploadPanel from '../features/content/UploadPanel.jsx';

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
  // App-layer composition: the host gets the content upload panel inside the room
  // shell. Cross-feature wiring lives here (assembly), not inside a feature (§13).
  return (
    <RoomView>
      {room.role === 'host' && <UploadPanel />}
    </RoomView>
  );
}
