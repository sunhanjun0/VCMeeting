// Content store (TDD §8). Persists uploaded presentation bundles to disk and hosts
// them same-origin. Handles two inputs: multi-file uploads and a single .zip.
//
// Security is the whole point here (uploaded HTML is untrusted, §8.2):
//   - total size (incl. decompressed) capped at maxBytes — abort mid-extract (zip bomb)
//   - extension whitelist — non-whitelisted entries rejected
//   - zip slip — every entry path is resolved and MUST stay inside the bundle dir
//   - symlinks in zips are rejected (mode bits)
//   - entry-count cap guards against many-tiny-files bombs
// Entry identification (§8.2): root index.html, else require the host to pick.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { nanoid } from 'nanoid';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50MB
const DEFAULT_MAX_ENTRIES = 2000;
const META_FILE = '.bundle.json'; // dotfile: never served by express.static (dotfiles:'ignore')
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

// §8.2 type whitelist.
export const ALLOWED_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'json',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
  'woff', 'woff2', 'ttf', 'ico', 'txt', 'md'
]);

export function extOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isAllowedFile(name) {
  return ALLOWED_EXTENSIONS.has(extOf(name));
}

// Resolve an untrusted archive/relative path against baseDir, guaranteeing the
// result stays inside baseDir. Throws on traversal / absolute / drive paths.
export function safeResolveWithin(baseDir, entryName) {
  // Normalize separators; reject absolute paths and Windows drive/UNC forms.
  const normalized = entryName.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith('//')) {
    throw new ZipSlipError(entryName);
  }
  const target = path.resolve(baseDir, normalized);
  const rel = path.relative(baseDir, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ZipSlipError(entryName);
  }
  return target;
}

export class ContentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'ContentError';
  }
}
class ZipSlipError extends ContentError {
  constructor(entryName) {
    super('zip_slip', `Illegal path in bundle: ${entryName}`);
  }
}

export function createContentStore({
  dataDir = 'data',
  maxBytes = DEFAULT_MAX_BYTES,
  maxEntries = DEFAULT_MAX_ENTRIES,
  now = Date.now
} = {}) {
  const bundlesRoot = path.resolve(dataDir, 'bundles');

  function bundleDir(bundleId) {
    return path.join(bundlesRoot, bundleId);
  }

  // Identify the entry file (§8.2). Root index.html wins; otherwise the host
  // must choose from the html candidates.
  function identifyEntry(relPaths) {
    if (relPaths.includes('index.html')) return { entryFile: 'index.html', needsEntry: false, candidates: [] };
    const candidates = relPaths.filter((p) => ['html', 'htm'].includes(extOf(p)));
    if (candidates.length === 1) return { entryFile: candidates[0], needsEntry: false, candidates };
    return { entryFile: null, needsEntry: true, candidates };
  }

  function makeMeta(id, entry, sizeBytes, uploadedBy, roomId) {
    return {
      id,
      roomId: roomId ?? null,
      entryFile: entry.entryFile,
      needsEntry: entry.needsEntry,
      candidates: entry.candidates,
      sizeBytes,
      uploadedBy,
      createdAt: now()
    };
  }

  // Persist bundle metadata alongside the files so it survives the upload→content:set
  // gap (the server needs the full ContentBundle to broadcast content:changed and to
  // fill the join snapshot). Stored as a dotfile so it's never served statically.
  async function writeMeta(bundleId, meta) {
    await fsp.writeFile(path.join(bundleDir(bundleId), META_FILE), JSON.stringify(meta), 'utf8');
  }

  // Reject anything that isn't a plain bundle id (nanoid alphabet) so a hostile
  // bundleId can never escape the bundles root when reading meta.
  const isValidBundleId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

  // Read a stored ContentBundle by id. Returns null if unknown/unreadable.
  async function getBundle(bundleId) {
    if (!isValidBundleId(bundleId)) return null;
    try {
      const raw = await fsp.readFile(path.join(bundleDir(bundleId), META_FILE), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // Store a multi-file upload. files: [{ relativePath, buffer }].
  async function storeFiles(files, { uploadedBy = null, roomId = null } = {}) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new ContentError('empty', 'No files uploaded');
    }
    if (files.length > maxEntries) {
      throw new ContentError('too_many_entries', `Too many files (>${maxEntries})`);
    }
    const id = nanoid(12);
    const dir = bundleDir(id);
    let total = 0;
    const relPaths = [];
    try {
      await fsp.mkdir(dir, { recursive: true });
      for (const f of files) {
        if (!isAllowedFile(f.relativePath)) {
          throw new ContentError('bad_type', `Disallowed file type: ${f.relativePath}`);
        }
        total += f.buffer.length;
        if (total > maxBytes) throw new ContentError('too_large', `Bundle exceeds ${maxBytes} bytes`);
        const target = safeResolveWithin(dir, f.relativePath);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, f.buffer);
        relPaths.push(path.relative(dir, target).replace(/\\/g, '/'));
      }
      const meta = makeMeta(id, identifyEntry(relPaths), total, uploadedBy, roomId);
      await writeMeta(id, meta);
      return meta;
    } catch (err) {
      await fsp.rm(dir, { recursive: true, force: true });
      throw err;
    }
  }

  // Store a single .zip (buffer or path). Streams entries, enforcing all guards.
  async function storeZip(zipInput, { uploadedBy = null, roomId = null } = {}) {
    const id = nanoid(12);
    const dir = bundleDir(id);
    try {
      await fsp.mkdir(dir, { recursive: true });
      const relPaths = [];
      const total = await extractZip(zipInput, dir, { maxBytes, maxEntries, relPaths });
      if (relPaths.length === 0) throw new ContentError('empty', 'Zip contains no files');
      const meta = makeMeta(id, identifyEntry(relPaths), total, uploadedBy, roomId);
      await writeMeta(id, meta);
      return meta;
    } catch (err) {
      await fsp.rm(dir, { recursive: true, force: true });
      throw err;
    }
  }

  async function deleteBundle(bundleId) {
    await fsp.rm(bundleDir(bundleId), { recursive: true, force: true });
  }

  function resolveContentPath(bundleId, relPath) {
    // Reused by the static host (task 4.2) to serve files safely.
    return safeResolveWithin(bundleDir(bundleId), relPath);
  }

  return {
    storeFiles,
    storeZip,
    getBundle,
    deleteBundle,
    bundleDir,
    bundlesRoot,
    resolveContentPath,
    identifyEntry
  };
}

// --- yauzl extraction with streaming size/slip/symlink guards ---
function extractZip(zipInput, dir, { maxBytes, maxEntries, relPaths }) {
  const open = typeof zipInput === 'string'
    ? (cb) => yauzl.open(zipInput, { lazyEntries: true }, cb)
    : (cb) => yauzl.fromBuffer(zipInput, { lazyEntries: true }, cb);

  return new Promise((resolve, reject) => {
    open((err, zip) => {
      if (err) return reject(new ContentError('bad_zip', err.message));
      let total = 0;
      let count = 0;
      let settled = false;
      const done = (fn, arg) => { if (!settled) { settled = true; zip.close(); fn(arg); } };

      zip.on('error', (e) => done(reject, new ContentError('bad_zip', e.message)));
      zip.on('end', () => done(resolve, total));

      zip.readEntry();
      zip.on('entry', (entry) => {
        (async () => {
          const name = entry.fileName;
          // Directory entry — just advance.
          if (name.endsWith('/')) return zip.readEntry();

          if (++count > maxEntries) {
            return done(reject, new ContentError('too_many_entries', `Too many entries (>${maxEntries})`));
          }
          // Reject symlinks (unix mode bits in the high half of external attrs).
          const mode = (entry.externalFileAttributes >>> 16) & S_IFMT;
          if (mode === S_IFLNK) {
            return done(reject, new ContentError('symlink', `Symlink not allowed: ${name}`));
          }
          if (!isAllowedFile(name)) {
            return done(reject, new ContentError('bad_type', `Disallowed file type: ${name}`));
          }

          let target;
          try {
            target = safeResolveWithin(dir, name);
          } catch (e) {
            return done(reject, e);
          }

          zip.openReadStream(entry, async (e2, readStream) => {
            if (e2) return done(reject, new ContentError('bad_zip', e2.message));
            try {
              await fsp.mkdir(path.dirname(target), { recursive: true });
              // Count actual decompressed bytes; abort if the running total blows the cap.
              const counter = new SizeGuard(() => total, (n) => { total = n; }, maxBytes);
              await pipeline(readStream, counter, fs.createWriteStream(target));
              relPaths.push(path.relative(dir, target).replace(/\\/g, '/'));
              zip.readEntry();
            } catch (e3) {
              done(reject, e3 instanceof ContentError ? e3 : new ContentError('too_large', e3.message));
            }
          });
        })().catch((e) => done(reject, e));
      });
    });
  });
}

// Transform stream that tallies bytes against a shared running total and throws
// once the cumulative decompressed size exceeds maxBytes (zip-bomb guard).
import { Transform } from 'node:stream';
class SizeGuard extends Transform {
  constructor(getTotal, setTotal, maxBytes) {
    super();
    this._get = getTotal;
    this._set = setTotal;
    this._max = maxBytes;
  }
  _transform(chunk, _enc, cb) {
    const next = this._get() + chunk.length;
    if (next > this._max) {
      return cb(new ContentError('too_large', `Bundle exceeds ${this._max} bytes`));
    }
    this._set(next);
    cb(null, chunk);
  }
}
