// Archive the pinned rav1e Cargo.lock sources without executing Cargo/build.rs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');
const root = path.resolve(process.argv[2]);
const sourceName = 'rav1e-564ae3b0007ae2b06893fd7166bf88c5a84c5b63.tar.gz';
const source = path.join(root, sourceName);
const entries = execFileSync('tar.exe', ['-tf', source], { encoding: 'utf8' }).trim().split(/\r?\n/);
const member = entries.find(name => /^[^/]+\/Cargo.lock$/.test(name));
if (!member) throw Error('Pinned rav1e Cargo.lock missing');
const lock = execFileSync('tar.exe', ['-xOf', source, '--', member], { encoding: 'utf8' });
const output = path.join(root, 'rav1e-crates'); fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'Cargo.lock'), lock);
const packages = lock.split(/^\[\[package\]\]\s*$/m).slice(1).map(block => {
  const row = {};
  for (const match of block.matchAll(/^(name|version|source|checksum) = "([^"\r\n]*)"\s*$/gm)) row[match[1]] = match[2];
  return row;
});
const receipt = { schema: 'dopi-rav1e-cargo-sources/v1', generatedAt: new Date().toISOString(), sourceArchive: sourceName,
  sourceCommit: '564ae3b0007ae2b06893fd7166bf88c5a84c5b63', lockSha256: crypto.createHash('sha256').update(lock).digest('hex'),
  recipe: 'scripts.d/50-rav1e.sh at 8267213e26c1031621e6e1210fe3aa4867214f6a',
  limitation: 'The upstream recipe runs cargo update cc before cinstall. These are exact sources from the committed lockfile; the actual updated cc build-tool version in the published binary is not disclosed and is not claimed to match. Build scripts are not executed.',
  sources: [], pending: [], complete: false };
const save = () => fs.writeFileSync(path.join(root, 'rav1e-cargo-source-materials.json'), JSON.stringify(receipt, null, 2) + '\n');
async function hash(file) { const h = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) h.update(chunk); return h.digest('hex'); }
async function collect(item) {
  if (!/^[a-zA-Z0-9_-]+$/.test(item.name) || !/^[0-9][a-zA-Z0-9.+_-]*$/.test(item.version) || !/^[a-f0-9]{64}$/.test(item.checksum || '')) throw Error('Unexpected Cargo package identifier/checksum');
  const filename = `${item.name}-${item.version}.crate`, file = path.join(output, filename);
  const url = `https://static.crates.io/crates/${item.name}/${filename}`;
  if (!fs.existsSync(file) || await hash(file) !== item.checksum) {
    const temporary = file + '.partial'; let success = false, failure;
    for (let attempt = 0; attempt < 3; attempt++) {
      const args = ['-4', ...(attempt % 2 ? ['--proxy', 'http://127.0.0.1:10808', '--noproxy', ''] : ['--noproxy', '*']),
        '--proto', '=https', '--proto-redir', '=https', '--fail', '--location', '--silent', '--show-error', '--connect-timeout', '30',
        '--max-time', '300', '--max-filesize', String(100 * 1024 ** 2), '--output', temporary, url];
      const result = await new Promise(resolve => execFile('curl.exe', args, { windowsHide: true, maxBuffer: 1024 ** 2 },
        (error, stdout, stderr) => resolve({ error, stderr })));
      if (result.error) { failure = String(result.stderr || result.error.message).slice(0, 300); continue; }
      if (await hash(temporary) !== item.checksum) throw Error('Cargo.lock checksum mismatch');
      fs.renameSync(temporary, file); success = true; break;
    }
    if (!success) throw Error(failure || 'Crate download failed');
  }
  const names = execFileSync('tar.exe', ['-tf', file], { encoding: 'utf8', maxBuffer: 8 * 1024 ** 2 }).trim().split(/\r?\n/);
  return { name: item.name, version: item.version, filename: 'rav1e-crates/' + filename, url, sha256: item.checksum,
    size: fs.statSync(file).size, checksumVerifiedAgainstCargoLock: true,
    buildScriptFiles: names.filter(name => /(?:^|\/)build\.rs$/.test(name)), status: 'source-archived' };
}
async function main() {
  const registry = packages.filter(item => item.source === 'registry+https://github.com/rust-lang/crates.io-index');
  for (const item of packages.filter(item => item.source && item.source !== 'registry+https://github.com/rust-lang/crates.io-index')) receipt.pending.push({ ...item, reason: 'Non-crates.io dependency needs explicit source collection' });
  let next = 0;
  const worker = async () => { while (next < registry.length) { const item = registry[next++];
    try { receipt.sources.push(await collect(item)); console.log(`CRATE ${item.name} ${item.version}`); }
    catch (error) { receipt.pending.push({ ...item, reason: error.message }); console.log(`CRATE_PENDING ${item.name}`); } save();
  } };
  await Promise.all([worker(), worker()]);
  receipt.lockfileSourcesComplete = receipt.pending.length === 0;
  receipt.complete = false; // Floating upstream cargo update cc remains explicit.
  receipt.pendingBuildToolResolution = ['cc (upstream recipe cargo update cc)'];
  receipt.collectedBytes = receipt.sources.reduce((sum, row) => sum + row.size, 0); save();
  console.log(JSON.stringify({ sourceCount: receipt.sources.length, pending: receipt.pending.length, bytes: receipt.collectedBytes }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
