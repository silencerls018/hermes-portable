const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2]);
async function hash(file) { const h = crypto.createHash('sha256'); for await (const bytes of fs.createReadStream(file)) h.update(bytes); return h.digest('hex'); }
async function main() {
  const names = ['hermes-0.22.5-portablegit-sources.tar', 'hermes-0.22.5-ffmpeg-sources.tar'];
  const files = [];
  for (const name of names) {
    const receipt = JSON.parse(fs.readFileSync(path.join(root, name + '.receipt.json'), 'utf8'));
    if (receipt.filename !== name || fs.statSync(path.join(root, name)).size !== receipt.size || await hash(path.join(root, name)) !== receipt.sha256) throw Error('Attachment receipt mismatch: ' + name);
    files.push({ name, size: receipt.size, sha256: receipt.sha256, sourceArchives: receipt.sourceArchives, receipt: name + '.receipt.json' });
  }
  const result = { schema: 'dopi-portable-source-attachments/v1', generatedAt: new Date().toISOString(), files,
    totalBytes: files.reduce((sum, row) => sum + row.size, 0), published: false,
    intendedPublicRepository: 'https://github.com/silencerls018/hermes-portable',
    note: 'These are source/notice materials, not executable runtime downloads. Read each attachment manifest for source coverage and reproducibility limitations.' };
  fs.writeFileSync(path.join(root, 'hermes-0.22.5-source-attachments.json'), JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'hermes-0.22.5-source-attachments.sha256'), files.map(row => `${row.sha256}  ${row.name}`).join('\n') + '\n');
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
