// Build a separate source attachment from an explicit, hashed allowlist.
// No runtime files, credentials, .partial downloads, or mirror indexes are added.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sources = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
if (fs.existsSync(output)) throw Error('Refusing to overwrite an existing source attachment');
function hash(file) { return new Promise((resolve, reject) => {
  const digest = crypto.createHash('sha256'), input = fs.createReadStream(file);
  input.on('data', chunk => digest.update(chunk)); input.on('error', reject);
  input.on('end', () => resolve(digest.digest('hex')));
}); }
async function main() {
  const receipt = JSON.parse(fs.readFileSync(path.join(sources, 'source-materials.json'), 'utf8'));
  const inspection = JSON.parse(fs.readFileSync(path.join(sources, 'source-inspection.json'), 'utf8'));
  const supplement = JSON.parse(fs.readFileSync(path.join(sources, 'source-supplement-gcm.json'), 'utf8'));
  const names = [...new Set(receipt.packages.filter(row => row.source).map(row => row.source.name))];
  const sums = [];
  for (const name of names) {
    if (name !== path.basename(name) || !/^[\w.+~-]+\.src\.tar\.(gz|xz|zst)$/.test(name)) throw Error('Unsafe source filename');
    const download = receipt.downloads.find(item => item.filename === name && item.status === 'downloaded');
    const inspected = inspection.inspections.find(item => item.filename === name && !item.status);
    if (!download || !inspected || !inspected.recipePath) throw Error(`Missing downloaded and inspected source: ${name}`);
    const file = path.join(sources, name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size !== download.size || await hash(file) !== download.sha256) throw Error(`Source integrity mismatch: ${name}`);
    sums.push(`${download.sha256}  ${name}`);
  }
  const supplementFile = path.join(sources, supplement.filename);
  if (supplement.filename !== path.basename(supplement.filename) || fs.statSync(supplementFile).size !== supplement.size || await hash(supplementFile) !== supplement.sha256) throw Error('GCM source integrity mismatch');
  names.push(supplement.filename); sums.push(`${supplement.sha256}  ${supplement.filename}`);
  const metadata = ['source-materials.json', 'source-inspection.json', 'source-supplement-gcm.json', 'bundled-package-versions.txt', 'package-versions-2.53.0.3.txt'];
  for (const name of metadata) { if (!fs.statSync(path.join(sources, name)).isFile()) throw Error(`Missing metadata ${name}`); names.push(name); }
  fs.copyFileSync(path.join(__dirname, 'THIRD-PARTY-NOTICES.txt'), path.join(sources, 'THIRD-PARTY-NOTICES.txt'));
  fs.writeFileSync(path.join(sources, 'SOURCE-SHA256SUMS.txt'), sums.sort().join('\n') + '\n');
  names.push('THIRD-PARTY-NOTICES.txt', 'SOURCE-SHA256SUMS.txt');
  const list = path.join(sources, 'source-attachment-files.txt'); fs.writeFileSync(list, names.sort().join('\n') + '\n');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync('tar.exe', ['-cf', output, '-C', sources, '-T', list], { stdio: 'inherit' });
  const result = { filename: path.basename(output), size: fs.statSync(output).size, sha256: await hash(output), members: names.length,
    sourceArchives: sums.length, limitation: inspection.limitation };
  fs.writeFileSync(output + '.receipt.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
