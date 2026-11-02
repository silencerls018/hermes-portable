const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildEnvelope, relativeFile } = require('./sign-release.cjs');

async function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dopi-release-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'payload');
  const runtime = { python: 'tools/python/python.exe', bootstrap: 'runtime/python.py', worker: 'bin/hermes.exe',
    repo: 'repo', sitePackages: 'venv/Lib/site-packages', desktop: 'desktop' };
  for (const name of Object.values(runtime)) fs.mkdirSync(path.join(root, name.includes('.') ? path.dirname(name) : name), { recursive: true });
  for (const name of [runtime.python, runtime.bootstrap, runtime.worker, 'desktop/index.html']) fs.writeFileSync(path.join(root, name), 'fixture');
  const sha = 'a'.repeat(40), version = '0.22.5';
  fs.writeFileSync(path.join(root, 'desktop/oxlyc-build.json'), JSON.stringify({ version, sha }));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ schema: 1, target: 'win32-x64', ref: sha,
    runtime: { storePython: runtime.python, pythonBootstrap: runtime.bootstrap, repoDir: runtime.repo, sitePackages: runtime.sitePackages, commands: { hermes: runtime.worker } } }));
  const pair = crypto.generateKeyPairSync('ed25519'), key = path.join(base, 'private.pem');
  fs.writeFileSync(key, pair.privateKey.export({ format: 'pem', type: 'pkcs8' }));
  const archive = path.join(base, 'runtime.tar.gz'); fs.writeFileSync(archive, 'archive fixture');
  return { options: { root, archive, url: 'https://example.org/runtime.tar.gz', runtime, sha, version,
    releaseId: '0.22.5-dopi.1-win32-x64', sequence: 1, minimumAppVersion: '0.19.11', privateKey: key }, publicKey: pair.publicKey };
}
test('release covers the exact bytes and verifies with its pinned key', async t => {
  const { options, publicKey } = await fixture(t);
  const { envelope, summary } = await buildEnvelope(options);
  const bytes = Buffer.from(envelope.payload, 'base64');
  assert.equal(crypto.verify(null, bytes, publicKey, Buffer.from(envelope.signature, 'base64')), true);
  const value = JSON.parse(bytes);
  assert.equal(value.files['tools/python/python.exe'].sha256, crypto.createHash('sha256').update('fixture').digest('hex'));
  assert.equal(value.archive.size, fs.statSync(options.archive).size);
  assert.equal(summary.files, Object.keys(value.files).length);
  bytes[0] ^= 1;
  assert.equal(crypto.verify(null, bytes, publicKey, Buffer.from(envelope.signature, 'base64')), false);
});
test('rejects unsafe Windows and archive paths', () => {
  for (const value of ['../x', 'a/../x', '/x', 'C:/x', 'a\\x', 'a//x', 'a/x.', 'a/x ', 'a\0b', 'a/?b', 'a/COM¹.txt', 'a/<x>']) assert.equal(relativeFile(value), false, value);
});
test('rejects a mismatched desktop build before signing', async t => {
  const { options } = await fixture(t);
  fs.writeFileSync(path.join(options.root, 'desktop/oxlyc-build.json'), JSON.stringify({ version: '0.22.4', sha: options.sha }));
  await assert.rejects(buildEnvelope(options), /Desktop version mismatch/);
});
test('rejects private state in a payload', async t => {
  const { options } = await fixture(t);
  fs.writeFileSync(path.join(options.root, '.env'), 'private fixture');
  await assert.rejects(buildEnvelope(options), /Private state/);
});
test('rejects missing Python and insecure download destinations', async t => {
  const { options } = await fixture(t);
  await assert.rejects(buildEnvelope({ ...options, url: 'http://example.org/runtime.tar.gz' }), /HTTPS/);
  fs.unlinkSync(path.join(options.root, options.runtime.python));
  await assert.rejects(buildEnvelope(options), /Missing runtime file/);
});
test('refuses to sign runtime paths that disagree with the official assembly manifest', async t => {
  const { options } = await fixture(t);
  const file = path.join(options.root, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(file));
  manifest.runtime.commands.hermes = 'bin/other.exe'; fs.writeFileSync(file, JSON.stringify(manifest));
  await assert.rejects(buildEnvelope(options), /Official runtime manifest mismatch/);
});
