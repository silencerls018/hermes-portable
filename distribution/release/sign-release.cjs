// Release keys stay outside the repository. Only the public key ships to clients.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function relativeFile(value) {
  return typeof value === 'string' && value.length > 0 && !/[\\:<>"|?*\x00-\x1f\x7f]/.test(value)
    && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part)
      && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part));
}
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function inventory(root) {
  const files = {}, folded = new Set(); let unpackedSize = 0;
  async function visit(directory, prefix = '') {
    for (const name of (await fs.promises.readdir(directory)).sort()) {
      const relative = prefix + name, full = path.join(directory, name);
      if (!relativeFile(relative)) throw Error('Unsafe payload path: ' + relative);
      if (folded.has(relative.toLowerCase())) throw Error('Ambiguous Windows payload path: ' + relative);
      folded.add(relative.toLowerCase());
      if (['.env', '.git', '.hermes'].includes(name) || /^(?:id_rsa|id_ed25519)$/.test(name)) throw Error('Private state in payload: ' + relative);
      const info = await fs.promises.lstat(full);
      if (info.isSymbolicLink()) throw Error('Payload links are not supported: ' + relative);
      if (info.isDirectory()) { await visit(full, relative + '/'); continue; }
      if (!info.isFile()) throw Error('Unsupported payload member: ' + relative);
      files[relative] = { size: info.size, sha256: await digest(full) };
      unpackedSize += info.size;
    }
  }
  await visit(root);
  return { files, unpackedSize };
}
async function buildEnvelope(options) {
  const root = path.resolve(options.root), archive = path.resolve(options.archive);
  const official = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const url = new URL(options.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('Expected public HTTPS archive URL');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,100}$/.test(options.releaseId)) throw Error('Invalid release identifier');
  if (!Number.isSafeInteger(options.sequence) || options.sequence < 1) throw Error('Invalid release sequence');
  const measured = await inventory(root);
  const runtime = options.runtime;
  const fields = { python: 'storePython', bootstrap: 'pythonBootstrap', repo: 'repoDir', sitePackages: 'sitePackages' };
  if (official.schema !== 1 || official.target !== 'win32-x64' || official.ref !== options.sha
    || official.runtime?.commands?.hermes !== runtime.worker
    || Object.entries(fields).some(([signed, original]) => runtime[signed] !== official.runtime?.[original])) {
    throw Error('Official runtime manifest mismatch');
  }
  for (const field of ['python', 'bootstrap', 'worker']) {
    if (!relativeFile(runtime[field]) || !measured.files[runtime[field]]) throw Error('Missing runtime file: ' + field);
  }
  for (const field of ['repo', 'sitePackages', 'desktop']) {
    if (!relativeFile(runtime[field]) || !fs.statSync(path.join(root, runtime[field])).isDirectory()) throw Error('Missing runtime directory: ' + field);
  }
  if (!measured.files[runtime.desktop + '/index.html'] || !measured.files[runtime.desktop + '/oxlyc-build.json']) throw Error('Matching desktop build required');
  const stamp = JSON.parse(fs.readFileSync(path.join(root, runtime.desktop, 'oxlyc-build.json'), 'utf8'));
  if (stamp.sha !== options.sha || stamp.version !== options.version) throw Error('Desktop version mismatch');
  if (!/^[a-f0-9]{40}$/.test(options.sha)) throw Error('Invalid upstream commit');
  const value = {
    schema: 'dopi-hermes-release/v1', releaseId: options.releaseId, sequence: options.sequence,
    hermes: { version: options.version, sha: options.sha }, platform: 'win32', arch: 'x64',
    minimumAppVersion: options.minimumAppVersion, createdAt: new Date().toISOString(),
    archive: { url: url.href, format: 'tar.gz', size: fs.statSync(archive).size, sha256: await digest(archive), unpackedSize: measured.unpackedSize },
    runtime, files: measured.files,
  };
  if (!/^\d+\.\d+\.\d+$/.test(value.minimumAppVersion)) throw Error('Invalid minimum app version');
  const privateKey = crypto.createPrivateKey(fs.readFileSync(options.privateKey));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw Error('Expected Ed25519 signing key');
  const publicKey = crypto.createPublicKey(privateKey);
  const keyId = crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
  const payload = Buffer.from(JSON.stringify(value));
  const signature = crypto.sign(null, payload, privateKey);
  if (!crypto.verify(null, payload, publicKey, signature)) throw Error('Signing self-check failed');
  return { envelope: { keyId, payload: payload.toString('base64'), signature: signature.toString('base64') },
    summary: { releaseId: value.releaseId, keyId, size: value.archive.size, unpackedSize: measured.unpackedSize, files: Object.keys(measured.files).length } };
}
if (require.main === module) {
  const options = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  buildEnvelope(options).then(({ envelope, summary }) => {
    fs.writeFileSync(options.output, JSON.stringify(envelope) + '\n');
    console.log(JSON.stringify(summary));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { buildEnvelope, inventory, relativeFile };
