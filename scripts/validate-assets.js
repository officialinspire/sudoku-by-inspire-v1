/**
 * validate-assets — a dependency-free static check that every file the
 * app references actually ships, and ships the way a static host will
 * serve it. Run `npm run validate:assets`; exits 1 on any error.
 *
 * Why it exists: GitHub Pages is case-sensitive and picks each file's
 * Content-Type from its extension, while a macOS/Windows dev machine is
 * neither. A `./Logo.png` typo, a JPEG saved as `.png`, or an import
 * missing its `.js` all work locally and break only once deployed — this
 * catches them before that.
 *
 * Starting from index.html it follows: src/href attributes, social-card
 * meta images, CSS url()/@import, the full ES-module import graph, asset
 * string literals in that graph ('./Sudoku Zen.mp3'), the service
 * worker's precache lists, and the web app manifest. For each reference:
 *   - the file exists with exactly matching case;
 *   - no root-absolute "/x" path (breaks repo-subpath hosting) and no
 *     remote or bare-specifier import (no CDN, no bundler);
 *   - the bytes match the extension, i.e. the MIME type a host will send;
 *   - declared sizes/types (img/video width+height, manifest icon sizes,
 *     og:image:*) match the real file.
 * It also lists what downloads before the Start tap, so new startup
 * weight is visible in review.
 *
 * Deliberately regex-based rather than a real HTML/JS parser: this repo
 * has no dependencies, and its own files are regular enough that a
 * handful of anchored patterns cover them. Import statements must start
 * their line (the codebase's style), which keeps imports mentioned in
 * comments from counting.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// What a static host (GitHub Pages included) sends as Content-Type.
const MIME_BY_EXTENSION = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

const BINARY_EXTENSIONS = new Set(
  Object.keys(MIME_BY_EXTENSION).filter((ext) => /^(image|video|audio)\//.test(MIME_BY_EXTENSION[ext]) && ext !== '.svg')
);

// A './something.ext' string in app JS that the browser will fetch at
// runtime (resolved against the page, not the module). Single/double
// quotes only: this codebase's comments use backticks for file names.
const RUNTIME_ASSET_PATTERN = /(['"])(\.{1,2}\/[^'"\n]*?\.(?:png|jpe?g|gif|webp|svg|ico|mp4|webm|mp3|ogg|wav|m4a|json|webmanifest))\1/g;

const IMPORT_PATTERNS = [
  /^\s*import\s+(?:[^'";]*?\s+from\s+)?(['"])([^'"]+)\1/gm, // import x from '…' / import '…'
  /^\s*export\s+[^'";]*?\s+from\s+(['"])([^'"]+)\1/gm, // export { x } from '…'
  /\bimport\(\s*(['"])([^'"]+)\1\s*\)/g, // import('…')
];

// ---------------------------------------------------------------- bytes

function sniffMime(bytes) {
  if (bytes.length < 12) return null;
  const ascii = (start, end) => bytes.toString('latin1', start, end);
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (ascii(4, 8) === 'ftyp') return ascii(8, 11) === 'M4A' ? 'audio/mp4' : 'video/mp4';
  if (bytes.readUInt32BE(0) === 0x1a45dfa3) return 'video/webm';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (bytes.readUInt32BE(0) === 0x00000100) return 'image/x-icon';
  return null;
}

function readPngSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readJpegSize(bytes) {
  let offset = 2; // past the SOI marker
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff || bytes[offset + 1] === 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    // SOF0–SOF15 hold the frame size; C4/C8/CC share that range but are
    // other segment types.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return null;
}

// The first track with a picture: tkhd's last two fields are its display
// width/height in 16.16 fixed point (an audio track's are zero).
function readMp4Size(bytes, start = 0, end = bytes.length) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    if (size === 1) size = Number(bytes.readBigUInt64BE(offset + 8));
    if (size === 0) size = end - offset;
    if (size < 8) return null;
    const boxEnd = Math.min(offset + size, end);
    if (type === 'moov' || type === 'trak') {
      const found = readMp4Size(bytes, offset + 8, boxEnd);
      if (found) return found;
    } else if (type === 'tkhd') {
      const width = bytes.readUInt32BE(boxEnd - 8) / 65536;
      const height = bytes.readUInt32BE(boxEnd - 4) / 65536;
      if (width > 0 && height > 0) return { width, height };
    }
    offset += size;
  }
  return null;
}

function readMediaSize(file) {
  const bytes = readFileSync(file);
  const mime = sniffMime(bytes);
  if (mime === 'image/png') return readPngSize(bytes);
  if (mime === 'image/jpeg') return readJpegSize(bytes);
  if (mime === 'video/mp4') return readMp4Size(bytes);
  return null;
}

// ---------------------------------------------------------------- paths

/**
 * Resolves `reference` from `fromDir` one path segment at a time against
 * real directory listings — existsSync() alone would say yes to
 * "./Logo.png" on a case-insensitive disk even though GitHub Pages 404s.
 */
function createResolver(rootDir) {
  const listings = new Map();
  const listDir = (dir) => {
    if (!listings.has(dir)) listings.set(dir, existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir) : null);
    return listings.get(dir);
  };

  return function resolveExact(fromDir, reference) {
    let cleaned;
    try {
      cleaned = decodeURI(reference.split(/[?#]/)[0]);
    } catch {
      return { problem: 'malformed URL encoding' };
    }
    const relative = path.relative(rootDir, path.resolve(fromDir, cleaned));
    if (relative.startsWith('..') || path.isAbsolute(relative)) return { problem: 'points outside the repo' };

    let current = rootDir;
    for (const segment of relative === '' ? [] : relative.split(path.sep)) {
      const entries = listDir(current) ?? [];
      if (entries.includes(segment)) {
        current = path.join(current, segment);
        continue;
      }
      const caseVariant = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
      if (caseVariant) {
        const onDisk = path.relative(rootDir, path.join(current, caseVariant));
        return { problem: `case mismatch: on disk it's "${onDisk}" (works locally on macOS/Windows, 404s on GitHub Pages)` };
      }
      return { problem: 'file not found' };
    }
    if (statSync(current).isDirectory()) return resolveExact(current, 'index.html');
    return { file: current };
  };
}

function classifyReference(reference, siteUrl) {
  const value = reference.trim();
  if (value === '' || value.startsWith('#') || /^(data|blob|mailto|tel|javascript|about):/i.test(value)) return { kind: 'skip' };
  if (siteUrl && value.startsWith(siteUrl)) return { kind: 'local', path: `./${value.slice(siteUrl.length)}` };
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return { kind: 'remote' };
  if (value.startsWith('/')) return { kind: 'root-absolute' };
  return { kind: 'local', path: value };
}

function parseAttributes(source) {
  const attributes = {};
  for (const [, name, doubleQuoted, singleQuoted, bare] of source.matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes[name.toLowerCase()] = doubleQuoted ?? singleQuoted ?? bare ?? '';
  }
  return attributes;
}

function listFiles(dir, skip = new Set(['.git', 'node_modules'])) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skip.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, skip) : [full];
  });
}

// --------------------------------------------------------------- checks

export function validateAssets(rootDir) {
  const report = { errors: [], warnings: [], notes: [], startup: [], afterLoad: [] };
  const resolveExact = createResolver(rootDir);
  const rel = (file) => path.relative(rootDir, file) || '.';
  const referenced = new Set();
  const contentChecked = new Set();
  const startupFiles = new Set();
  const modules = new Set();

  const indexPath = path.join(rootDir, 'index.html');
  if (!existsSync(indexPath)) {
    report.errors.push('index.html not found at the repo root');
    return report;
  }

  function checkContent(file) {
    if (contentChecked.has(file)) return;
    contentChecked.add(file);
    const ext = path.extname(file).toLowerCase();
    const expected = MIME_BY_EXTENSION[ext];
    if (!expected) {
      report.warnings.push(`${rel(file)}: "${ext || '(none)'}" has no standard MIME type; static hosts may serve it as application/octet-stream`);
    } else if (BINARY_EXTENSIONS.has(ext)) {
      const actual = sniffMime(readFileSync(file));
      if (actual && actual !== expected) {
        report.errors.push(`${rel(file)}: content is ${actual} but the ${ext} extension is served as ${expected}`);
      } else if (!actual) {
        report.warnings.push(`${rel(file)}: couldn't recognize the file's format from its bytes`);
      }
    } else if (ext === '.json' || ext === '.webmanifest') {
      try {
        JSON.parse(readFileSync(file, 'utf8'));
      } catch (error) {
        report.errors.push(`${rel(file)}: invalid JSON (${error.message})`);
      }
    }
  }

  /** Records any problem with one reference; returns the resolved file or null. */
  function checkReference(where, reference, baseDir, { siteUrl = null, missingIsError = true, allowRemote = false } = {}) {
    const target = classifyReference(reference, siteUrl);
    if (target.kind === 'skip') return null;
    if (target.kind === 'remote') {
      if (!allowRemote) report.errors.push(`${where}: "${reference}" is a remote URL — the app must run offline with no CDN`);
      return null;
    }
    if (target.kind === 'root-absolute') {
      report.errors.push(`${where}: "${reference}" is root-absolute — use "./…" so GitHub Pages repo-subpath hosting works`);
      return null;
    }
    const { file, problem } = resolveExact(baseDir, target.path);
    if (problem) {
      (missingIsError ? report.errors : report.warnings).push(`${where}: "${reference}" — ${problem}`);
      return null;
    }
    referenced.add(file);
    checkContent(file);
    return file;
  }

  function checkDeclaredSize(where, file, declared, { exact = false } = {}) {
    const actual = readMediaSize(file);
    if (!actual) return;
    const real = `${actual.width}x${actual.height}`;
    if (!declared.width || !declared.height) {
      report.warnings.push(`${where}: no width/height attributes, so the layout shifts when ${rel(file)} (${real}) arrives`);
      return;
    }
    const declaredRatio = declared.width / declared.height;
    const realRatio = actual.width / actual.height;
    const matches = exact
      ? declared.width === actual.width && declared.height === actual.height
      : Math.abs(declaredRatio - realRatio) / realRatio < 0.01;
    if (!matches) report.errors.push(`${where}: declared ${declared.width}x${declared.height} but ${rel(file)} is really ${real}`);
  }

  function walkModule(file) {
    if (modules.has(file)) return;
    modules.add(file);
    startupFiles.add(file);
    const source = readFileSync(file, 'utf8');
    const where = rel(file);

    for (const pattern of IMPORT_PATTERNS) {
      for (const [, , specifier] of source.matchAll(pattern)) {
        if (!/^(\.{1,2}\/|\/|[a-z][a-z0-9+.-]*:)/i.test(specifier)) {
          report.errors.push(`${where}: bare import "${specifier}" needs a bundler or import map — use a relative "./…js" path`);
          continue;
        }
        if (!/\.m?js$/.test(specifier.split(/[?#]/)[0]) && !/^[a-z]+:/i.test(specifier)) {
          report.errors.push(`${where}: import "${specifier}" needs its .js extension (browsers don't guess, and only .js/.mjs is served as JavaScript)`);
          continue;
        }
        const target = checkReference(where, specifier, path.dirname(file));
        if (target) walkModule(target);
      }
    }

    // Runtime fetches from JS resolve against the page, not the module.
    for (const [, , assetPath] of source.matchAll(RUNTIME_ASSET_PATTERN)) {
      checkReference(where, assetPath, rootDir);
    }
    for (const [, , swPath] of source.matchAll(/\.register\(\s*(['"])([^'"]+)\1/g)) {
      const swFile = checkReference(where, swPath, rootDir);
      if (swFile) checkServiceWorker(swFile);
    }
  }

  function checkServiceWorker(swFile) {
    const source = readFileSync(swFile, 'utf8');
    for (const [, listName, body] of source.matchAll(/const\s+(\w+)\s*=\s*\[([\s\S]*?)\];/g)) {
      const isOptional = /OPTIONAL/.test(listName);
      for (const [, , entry] of body.matchAll(/(['"])([^'"]*)\1/g)) {
        const file = checkReference(`${rel(swFile)} ${listName}`, entry, path.dirname(swFile), { missingIsError: !isOptional });
        if (file) report.afterLoad.push(file);
      }
    }
  }

  function checkStylesheet(file) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const patterns = [/url\(\s*(['"]?)(.*?)\1\s*\)/g, /@import\s+(['"])(.*?)\1/g];
    for (const pattern of patterns) {
      for (const [, , reference] of css.matchAll(pattern)) {
        const target = checkReference(rel(file), reference, path.dirname(file));
        if (target) startupFiles.add(target);
      }
    }
  }

  function checkManifest(file) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return; // already reported by checkContent
    }
    const where = rel(file);
    for (const key of ['id', 'scope', 'start_url']) {
      if (typeof manifest[key] !== 'string') continue;
      const kind = classifyReference(manifest[key]).kind;
      if (kind === 'root-absolute' || kind === 'remote') report.errors.push(`${where}: ${key} "${manifest[key]}" must be relative ("./…") for subpath hosting`);
    }
    if (typeof manifest.start_url === 'string') checkReference(`${where} start_url`, manifest.start_url, path.dirname(file));
    for (const icon of manifest.icons ?? []) {
      const iconFile = checkReference(`${where} icon`, icon.src ?? '', path.dirname(file));
      if (!iconFile) continue;
      const actualType = sniffMime(readFileSync(iconFile));
      if (icon.type && actualType && icon.type !== actualType) {
        report.errors.push(`${where}: icon ${icon.src} declares type ${icon.type} but is ${actualType}`);
      }
      const size = readMediaSize(iconFile);
      const declaredSizes = String(icon.sizes ?? '').split(/\s+/);
      if (size && !declaredSizes.includes('any') && !declaredSizes.includes(`${size.width}x${size.height}`)) {
        report.errors.push(`${where}: icon ${icon.src} declares sizes "${icon.sizes}" but is ${size.width}x${size.height}`);
      }
    }
  }

  // ------------------------------------------------------- index.html

  startupFiles.add(indexPath);
  referenced.add(indexPath);
  const html = readFileSync(indexPath, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
  const tags = [...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map(([, name, attrs]) => ({
    name: name.toLowerCase(),
    attrs: parseAttributes(attrs),
  }));

  const metaContent = (key) => tags.find((t) => t.name === 'meta' && (t.attrs.property === key || t.attrs.name === key))?.attrs.content;
  const ogUrl = metaContent('og:url');
  const siteUrl = ogUrl ? ogUrl.replace(/\/?$/, '/') : null;

  for (const { name, attrs } of tags) {
    const where = `index.html <${name}${attrs.id ? `#${attrs.id}` : ''}>`;

    if (name === 'script' && attrs.src) {
      const file = checkReference(where, attrs.src, rootDir);
      if (file && attrs.type === 'module') walkModule(file);
      else if (file) startupFiles.add(file);
    } else if (name === 'link' && attrs.href) {
      const file = checkReference(where, attrs.href, rootDir);
      if (!file) continue;
      startupFiles.add(file);
      const linkRel = (attrs.rel ?? '').toLowerCase();
      if (linkRel === 'stylesheet') checkStylesheet(file);
      if (linkRel === 'manifest') checkManifest(file);
      const actualType = sniffMime(readFileSync(file));
      if (attrs.type && actualType && attrs.type !== actualType) report.errors.push(`${where}: type="${attrs.type}" but ${rel(file)} is ${actualType}`);
    } else if (['img', 'video', 'audio', 'source', 'track'].includes(name) && attrs.src) {
      const file = checkReference(where, attrs.src, rootDir);
      if (!file) continue;
      if (name === 'img' || name === 'video') {
        checkDeclaredSize(where, file, { width: Number(attrs.width) || 0, height: Number(attrs.height) || 0 });
      }
      if (name === 'img' && attrs.loading !== 'lazy') startupFiles.add(file);
      if (name === 'video' || name === 'audio') {
        if (attrs.preload === undefined) {
          report.warnings.push(`${where}: no preload attribute — browsers default to fetching some or all of ${rel(file)} at page load`);
        }
        if (attrs.preload !== 'none') startupFiles.add(file);
      }
    } else if (name === 'a' && attrs.href) {
      checkReference(where, attrs.href, rootDir, { allowRemote: true });
    } else if (name === 'meta' && attrs.content && /^(og:image|twitter:image)$/.test(attrs.property ?? attrs.name ?? '')) {
      // Social crawlers need absolute URLs; map the site's own ones back
      // to repo files so a renamed/missing share image still gets caught.
      const file = checkReference(where, attrs.content, rootDir, { siteUrl, allowRemote: true });
      if (file && (attrs.property ?? attrs.name) === 'og:image') {
        const declaredType = metaContent('og:image:type');
        const actualType = sniffMime(readFileSync(file));
        if (declaredType && actualType && declaredType !== actualType) report.errors.push(`${where}: og:image:type is ${declaredType} but ${rel(file)} is ${actualType}`);
        const width = Number(metaContent('og:image:width')) || 0;
        const height = Number(metaContent('og:image:height')) || 0;
        if (width || height) checkDeclaredSize(`${where} og:image:width/height`, file, { width, height }, { exact: true });
      }
    }
  }

  // --------------------------------------------------------- summary

  const jsDir = path.join(rootDir, 'js');
  const appModules = existsSync(jsDir) ? listFiles(jsDir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js')) : [];
  for (const file of appModules) {
    if (!modules.has(file)) report.notes.push(`${rel(file)} isn't imported anywhere from index.js`);
  }
  for (const file of listFiles(rootDir)) {
    if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase()) && !referenced.has(file)) {
      const kb = Math.round(statSync(file).size / 1024);
      report.notes.push(`${rel(file)} (${kb} KB) isn't referenced by the app, so players never download it`);
    }
  }
  report.startup = [...startupFiles].map((file) => ({ file: rel(file), bytes: statSync(file).size }));
  report.afterLoad = [...new Set(report.afterLoad)]
    .filter((file) => !startupFiles.has(file))
    .map((file) => ({ file: rel(file), bytes: statSync(file).size }));
  return report;
}

// ------------------------------------------------------------------ CLI

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function printReport(report) {
  const sum = (list) => list.reduce((total, entry) => total + entry.bytes, 0);
  const media = report.startup.filter((entry) => BINARY_EXTENSIONS.has(path.extname(entry.file).toLowerCase()));

  console.log(`Startup (before the Start tap): ${report.startup.length} files, ${formatKb(sum(report.startup))}`);
  for (const entry of media) console.log(`  media: ${entry.file} (${formatKb(entry.bytes)})`);
  console.log(`After page load (service worker precache, first visit only): ${formatKb(sum(report.afterLoad))}`);
  for (const entry of report.afterLoad) console.log(`  ${entry.file} (${formatKb(entry.bytes)})`);
  for (const note of report.notes) console.log(`note: ${note}`);
  for (const warning of report.warnings) console.log(`WARNING: ${warning}`);
  for (const error of report.errors) console.log(`ERROR: ${error}`);
  console.log(`\n${report.errors.length} error(s), ${report.warnings.length} warning(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const report = validateAssets(rootDir);
  printReport(report);
  process.exitCode = report.errors.length > 0 ? 1 : 0;
}
