// Content actions (client) — upload a bundle over HTTP (multipart) with progress,
// then activate it via the content:set network event. UI calls these; they never
// touch the socket directly (net.request bridges that).
//
// Upload uses XMLHttpRequest, not fetch: only XHR reports upload progress, which
// task 4.4 requires. roomId + host sessionId are read from the room slice (a
// sanctioned cross-slice READ — we never import the room feature, §13).

// Derive per-file relative paths for the multipart `paths` field (multer strips
// directory components from the filename, so paths ride alongside). Browsers expose
// folder structure via webkitRelativePath ("picked/assets/app.js"); when every file
// shares one top-level directory we strip it so an inner index.html lands at the
// bundle root (otherwise entry detection would miss it).
export function computePaths(files) {
  const raw = files.map((f) => f.webkitRelativePath || f.name);
  const segs = raw.map((p) => p.split('/'));
  const nested = segs.some((s) => s.length > 1);
  if (nested) {
    const top = segs[0][0];
    const shareTop = segs.every((s) => s.length > 1 && s[0] === top);
    if (shareTop) return segs.map((s) => s.slice(1).join('/'));
  }
  return raw;
}

// POST the files to the room's content endpoint. Resolves the ContentBundle on 201,
// rejects with a readable message otherwise. onProgress(pct) fires 0..100.
export function uploadContent(app, { files, onProgress }) {
  const room = app.store.getSlice('room') || {};
  const { roomId, sessionId } = room;
  const paths = computePaths(files);

  const form = new FormData();
  form.append('paths', JSON.stringify(paths));
  for (const f of files) form.append('files', f, f.name);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/rooms/${encodeURIComponent(roomId)}/content`);
    if (sessionId) xhr.setRequestHeader('X-Session-Id', sessionId);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status === 201 && body?.bundle) resolve(body.bundle);
      else reject(new Error(body?.error?.message || `上传失败（${xhr.status}）`));
    };
    xhr.onerror = () => reject(new Error('网络错误，上传失败'));
    xhr.send(form);
  });
}

// Activate a previously-uploaded bundle as the room's live content (host-only,
// enforced server-side). The server broadcasts content:changed back to everyone.
export async function setContent(app, bundleId) {
  const res = await app.net.request('content:set', { bundleId });
  if (!res.ok) throw new Error(res.error?.message || '内容切换失败');
  return res.data;
}
