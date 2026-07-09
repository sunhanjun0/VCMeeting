// Iframe stage (sync feature UI, M1: render-only). Renders the room's active
// presentation bundle in a same-origin sandboxed iframe (§8.3, §7.2). Event capture
// (host) / apply (follower) land here in M2 — this task only loads + reloads.
//
// Active bundle source (read-only cross-slice, §13): the content feature owns the
// live bundle in content.active (fed by content:changed); a fresh joiner's initial
// bundle rides in the join snapshot at room.content (§5.3). We prefer the live one.

import { Empty, Typography } from 'antd';
import { useApp } from '../../AppContext.jsx';
import { useSlice } from '../../core/store.js';

// Build the same-origin content URL, encoding each path segment (entry files may be
// non-ASCII or live in a subdirectory) without escaping the separators.
function contentUrl(bundle) {
  const entry = String(bundle.entryFile || '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `/content/${encodeURIComponent(bundle.id)}/${entry}`;
}

export default function IframeStage() {
  const app = useApp();
  const content = useSlice(app.store, 'content');
  const room = useSlice(app.store, 'room');

  const bundle = content?.active ?? room?.content ?? null;

  const frame = { width: '100%', height: '70vh', border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' };

  if (!bundle) {
    return (
      <div style={{ ...frame, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="等待主持人上传演示内容" />
      </div>
    );
  }

  if (bundle.needsEntry || !bundle.entryFile) {
    return (
      <div style={{ ...frame, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography.Text type="warning">内容缺少唯一入口页（index.html），无法渲染</Typography.Text>
      </div>
    );
  }

  const src = contentUrl(bundle);
  return (
    <iframe
      // key forces a full remount when the bundle switches so everyone reloads (§5).
      key={`${bundle.id}/${bundle.entryFile}`}
      title="presentation"
      src={src}
      // §8.3: same-origin (parent injects listeners in M2) + scripts; NOT top-nav/popups.
      sandbox="allow-scripts allow-same-origin"
      style={{ ...frame, display: 'block' }}
    />
  );
}
