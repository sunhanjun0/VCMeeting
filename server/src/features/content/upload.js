// Upload endpoint plumbing (TDD §8.1/§8.2). Parses multipart/form-data with multer
// (in-memory buffers), authorizes the host by session, then hands the files to the
// content-store which owns all the security validation (whitelist, size, zip slip).
//
// Two input shapes (§8.1): a single .zip (server extracts) or many files that keep
// their relative directory structure. The browser sends each file under the `files`
// field. multer (2.x) strips directory components from the multipart filename for
// safety, so relative paths ride in a parallel `paths` text field — a JSON array of
// relative paths aligned by index with the `files`. If absent, we fall back to the
// (basename-only) originalname. Either way content-store's safeResolveWithin is the
// authoritative zip-slip/traversal guard.

import multer from 'multer';
import { extOf, ContentError } from '../../services/content-store.js';

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

// Parse the optional `paths` JSON array (relative paths aligned with `files`).
// Returns an array of length `count`; entries are the client-supplied relative
// path or undefined (caller falls back to originalname). Malformed input is
// ignored — content-store still validates every resolved path.
function parsePaths(raw, count) {
  if (!isNonEmpty(raw)) return new Array(count);
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.slice(0, count).map((p) => (typeof p === 'string' ? p : undefined));
    }
  } catch {
    // fall through to empty mapping
  }
  return new Array(count);
}

// Per-file size cap and file-count cap for the multer layer. Total (cumulative,
// incl. zip decompression) is enforced authoritatively by the content-store; these
// are a first-line defense so a flood never fully buffers in memory.
const DEFAULT_MAX_ENTRIES = 2000;

// Build the async Express handler for POST /api/rooms/:roomId/content.
export function createUploadHandler({ rooms, content, maxBytes, maxEntries = DEFAULT_MAX_ENTRIES }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxEntries, fields: 10 }
  }).array('files');

  // Promisify the multer middleware so multipart errors surface as rejections.
  const runMulter = (req, res) =>
    new Promise((resolve, reject) => {
      upload(req, res, (err) => (err ? reject(err) : resolve()));
    });

  return async function handleUpload(req, res, next) {
    const { roomId } = req.params;
    const sessionId = req.get('x-session-id');

    // Host-session authorization (§8.1). A frozen room (host offline) has
    // hostSessionId=null and is therefore correctly rejected until reconnect.
    const room = rooms.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: { code: 'room_not_found', message: 'Room does not exist' } });
    }
    if (!isNonEmpty(sessionId) || room.hostSessionId !== sessionId) {
      return res.status(403).json({ error: { code: 'forbidden', message: 'Host session required' } });
    }

    try {
      await runMulter(req, res);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        const code = err.code === 'LIMIT_FILE_SIZE' ? 'too_large' : 'bad_upload';
        return res.status(400).json({ error: { code, message: err.message } });
      }
      return next(err);
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: { code: 'empty', message: 'No files uploaded' } });
    }

    try {
      let bundle;
      if (files.length === 1 && extOf(files[0].originalname) === 'zip') {
        bundle = await content.storeZip(files[0].buffer, { uploadedBy: sessionId });
      } else {
        const relPaths = parsePaths(req.body?.paths, files.length);
        bundle = await content.storeFiles(
          files.map((f, i) => ({ relativePath: relPaths[i] || f.originalname, buffer: f.buffer })),
          { uploadedBy: sessionId }
        );
      }
      rooms.touch(roomId);
      return res.status(201).json({ bundle });
    } catch (err) {
      if (err instanceof ContentError) {
        const status = err.code === 'too_large' ? 413 : 400;
        return res.status(status).json({ error: { code: err.code, message: err.message } });
      }
      return next(err);
    }
  };
}
