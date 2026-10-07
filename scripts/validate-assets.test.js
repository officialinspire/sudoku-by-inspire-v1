import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAssets } from './validate-assets.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Just enough of each format's header for the validator's sniffing and
// size reading — not real, decodable images.
function fakePng(width, height) {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'latin1');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function fakeJpeg(width, height) {
  // SOI, then a SOF0 segment: marker, length, precision, height, width.
  const header = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff];
  return Buffer.from([...header, ...new Array(14).fill(0)]);
}

function writeFixture(dir, files) {
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), contents);
  }
}

describe('validate-assets on this repo', () => {
  test('finds no errors or warnings', () => {
    const report = validateAssets(repoRoot);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
  });

  test('the intro video is not a startup download', () => {
    const startupFiles = validateAssets(repoRoot).startup.map((entry) => entry.file);
    assert.ok(startupFiles.includes('index.js'));
    assert.ok(!startupFiles.includes('inspiresoftwareintro.mp4'));
  });
});

describe('validate-assets checks the service worker precache against the module graph', () => {
  test('a runtime module missing from the required precache, or a precached test file, is an error', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-sw-'));
    try {
      writeFixture(dir, {
        'index.html': '<script type="module" src="./main.js"></script>',
        'main.js': "import './util.js';\nnavigator.serviceWorker.register('./sw.js');",
        'util.js': 'export {};',
        'util.test.js': '',
        'sw.js': "const MODULE_ASSETS = ['./main.js', './util.test.js'];\nconst OPTIONAL_ASSETS = ['./util.js'];",
      });
      const { errors, modules } = validateAssets(dir);
      assert.deepEqual(modules.sort(), ['main.js', 'util.js']);
      assert.ok(errors.some((e) => e.includes("runtime module util.js isn't in the required precache")), errors.join('\n'));
      assert.ok(errors.some((e) => e.includes('precaches test file util.test.js')), errors.join('\n'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('validate-assets catches broken references', () => {
  let dir;
  let report;

  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'validate-assets-'));
    writeFixture(dir, {
      'index.html': `<!doctype html>
        <link rel="stylesheet" href="./style.css">
        <link rel="manifest" href="./app.webmanifest">
        <img src="./Logo.png" width="10" height="10">
        <img src="./photo.png" width="4" height="2">
        <img src="./wide.png" width="10" height="10">
        <img src="/abs.png">
        <video src="./clip.mp4" width="4" height="2"></video>
        <script type="module" src="./main.js"></script>`,
      'logo.png': fakePng(10, 10),
      'photo.png': fakeJpeg(4, 2),
      'wide.png': fakePng(20, 10),
      'clip.mp4': Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftypisom'), Buffer.alloc(4)]),
      'bg.png': fakePng(1, 1),
      'icon.png': fakePng(48, 48),
      'style.css': `.a { background: url("./bg.png"); } .b { background: url('/root.png'); }`,
      'app.webmanifest': JSON.stringify({ start_url: '/', icons: [{ src: './icon.png', sizes: '192x192', type: 'image/png' }] }),
      'main.js': [
        "import { a } from './Util.js';",
        "import _ from 'lodash';",
        "import { b } from './helper';",
        "import c from 'https://cdn.example.com/c.js';",
        "const music = new Audio('./missing.mp3');",
      ].join('\n'),
      'util.js': 'export const a = 1;',
    });
    report = validateAssets(dir);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  const expectError = (fragment) => {
    assert.ok(
      report.errors.some((error) => error.includes(fragment)),
      `expected an error containing "${fragment}" in:\n${report.errors.join('\n')}`
    );
  };

  test('case mismatches (which only fail once deployed)', () => {
    expectError('"./Logo.png" — case mismatch');
    expectError('"./Util.js" — case mismatch');
  });

  test('root-absolute paths in HTML, CSS, and the manifest', () => {
    expectError('"/abs.png" is root-absolute');
    expectError('"/root.png" is root-absolute');
    expectError('start_url "/" must be relative');
  });

  test('imports a browser cannot load without a build step or network', () => {
    expectError('bare import "lodash"');
    expectError('import "./helper" needs its .js extension');
    expectError('"https://cdn.example.com/c.js" is a remote URL');
  });

  test('content that does not match its extension/MIME type', () => {
    expectError('photo.png: content is image/jpeg');
  });

  test('declared sizes that do not match the real file', () => {
    expectError('declared 10x10 but wide.png is really 20x10');
    expectError('declares sizes "192x192" but is 48x48');
  });

  test('missing runtime assets referenced from JS', () => {
    expectError('"./missing.mp3" — file not found');
  });

  test('media without an explicit preload is flagged as a startup download', () => {
    assert.ok(report.warnings.some((warning) => warning.includes('no preload attribute')));
    assert.ok(report.startup.some((entry) => entry.file === 'clip.mp4'));
  });

  test('valid references produce no errors of their own', () => {
    assert.ok(!report.errors.some((error) => error.includes('bg.png') || error.includes('"./logo.png"')));
  });
});
