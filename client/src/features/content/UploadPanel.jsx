// Upload panel (content feature UI, host-only). Drag/drop or pick files (or a .zip);
// uploads as one bundle with a progress bar, then activates it so everyone reloads.
// Mounted in RoomView for hosts only. Reads the active bundle from the content slice.

import { useState } from 'react';
import { Upload, Button, Progress, Typography, Space, Tag, App as AntApp } from 'antd';
import { useApp } from '../../AppContext.jsx';
import { useSlice } from '../../core/store.js';
import { uploadContent, setContent } from './actions.js';

export default function UploadPanel() {
  const app = useApp();
  const { message } = AntApp.useApp();
  const content = useSlice(app.store, 'content');
  const [fileList, setFileList] = useState([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onUpload() {
    const files = fileList.map((f) => f.originFileObj || f);
    if (files.length === 0) {
      message.warning('请先选择要上传的文件');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const bundle = await uploadContent(app, { files, onProgress: setProgress });
      if (bundle.needsEntry) {
        // Ambiguous entry (no root index.html, multiple HTML): can't auto-activate.
        message.warning('上传成功，但未找到唯一入口页。请打包为含 index.html 的内容后重试');
      } else {
        await setContent(app, bundle.id);
        message.success('内容已上传并设为当前演示');
      }
      setFileList([]);
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const active = content?.active;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Upload.Dragger
        multiple
        fileList={fileList}
        beforeUpload={() => false} // intercept: we upload the whole set as one bundle
        onChange={(info) => setFileList(info.fileList)}
        disabled={busy}
      >
        <p style={{ fontSize: 16, margin: '8px 0' }}>点击或拖拽文件到此处</p>
        <Typography.Text type="secondary">
          支持多文件（保留目录结构）或单个 .zip，上限 50MB
        </Typography.Text>
      </Upload.Dragger>

      {busy && <Progress percent={progress} status="active" />}

      <Button type="primary" block loading={busy} disabled={fileList.length === 0} onClick={onUpload}>
        上传并设为当前演示
      </Button>

      {active && (
        <Typography.Text type="secondary">
          当前演示：<Tag color="green">{active.entryFile || active.id}</Tag>
        </Typography.Text>
      )}
    </Space>
  );
}
