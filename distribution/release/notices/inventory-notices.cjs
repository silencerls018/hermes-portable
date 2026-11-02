const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const runtime = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const lock = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../pm/lock.json'), 'utf8'));
const supplementalPath = path.join(__dirname, 'python', 'python-notice-sources.json');
const supplemental = fs.existsSync(supplementalPath) ? JSON.parse(fs.readFileSync(supplementalPath, 'utf8')).entries : [];
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    const file = path.join(dir, item.name); if (item.isSymbolicLink()) return [];
    return item.isDirectory() ? walk(file) : item.isFile() ? [file] : [];
  });
}
function record(file) { return { path: path.relative(runtime, file).split(path.sep).join('/'), size: fs.statSync(file).size, sha256: hash(file) }; }
function licenseName(file) { return /^(?:unlicense|licen[cs]e(?:[-._].*)?|copying(?:[-._].*)?|notice(?:[-._].*)?|copyright(?:[-._].*)?|license\.terms)$/i.test(path.basename(file)); }
const toolNames = ['python', 'uv', 'node', 'npm', 'git', 'ripgrep', 'ffmpeg'];
const tools = toolNames.filter(name => name !== 'ffmpeg' || fs.existsSync(path.join(runtime, 'tools', `ffmpeg-${lock.packages.ffmpeg.version}-win32-x64`))).map(name => {
  const entry = lock.packages[name]; const folder = path.join(runtime, 'tools', `${name}-${entry.version}-win32-x64`);
  return { name, version: entry.version, artifact: entry.artifacts['win32-x64'] || entry.artifacts.any,
    rootPresent: fs.existsSync(folder), licenseFiles: walk(folder).filter(licenseName).map(record),
    extraNoticeFiles: (name === 'uv' ? ['uv-LICENSE-APACHE.txt', 'uv-LICENSE-MIT.txt']
      : name === 'ffmpeg' ? ['FFMPEG-SOURCE-NOTICE.txt', 'ffmpeg-LICENSE.txt'] : [])
      .map(file => ({ path: `notices/${file}`, sha256: hash(path.join(__dirname, file)), presentAtRuntime: fs.existsSync(path.join(runtime, 'notices', file)) })) };
});
const site = path.join(runtime, 'venv', 'Lib', 'site-packages');
const wheels = fs.existsSync(site) ? fs.readdirSync(site).filter(name => name.endsWith('.dist-info')).map(name => {
  const root = path.join(site, name), metadataPath = path.join(root, 'METADATA');
  const metadata = fs.existsSync(metadataPath) ? fs.readFileSync(metadataPath, 'utf8') : '';
  function header(key) { return metadata.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1]?.trim() || null; }
  const licenses = walk(root).filter(file => licenseName(file) || /[\\/]licenses[\\/]/i.test(file));
  const extra = supplemental.find(entry => entry.distribution.toLowerCase() === String(header('Name')).toLowerCase() && entry.version === header('Version'));
  const extraNoticeFiles = (extra?.noticeFiles || []).map(file => ({ path: `notices/python/${file.name}`, size: file.size, sha256: file.sha256,
    presentAtRuntime: fs.existsSync(path.join(runtime, 'notices', 'python', file.name)) }));
  return { distribution: header('Name') || name, version: header('Version'), declaredLicenseExpression: header('License-Expression'),
    declaredLicense: header('License'), licenseFileHeaders: [...metadata.matchAll(/^License-File: (.*)$/gm)].map(m => m[1].trim()),
    licenseClassifiers: [...metadata.matchAll(/^Classifier: (License :: .*)$/gm)].map(m => m[1].trim()),
    licenseFiles: licenses.map(record), extraNoticeFiles, supplementalNoticeStatus: extra?.status || null,
    upstreamNoticeGap: extra?.upstreamGap || null,
    noticeReview: licenses.length ? 'embedded-license-material-present' : extraNoticeFiles.length && extraNoticeFiles.every(file => file.presentAtRuntime)
      ? 'supplemental-notice-material-present' : 'no-license-file-detected-review-metadata-and-upstream' };
}) : [];
const inventory = { schema: 'dopi-portable-runtime-notice-inventory/v1', generatedAt: new Date().toISOString(),
  limitation: 'This records shipped notices and declared metadata. It is not a complete license classification or binary/source correspondence determination.',
  tools, pythonDistributions: wheels };
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify({ tools: tools.length, toolNoticeFiles: tools.reduce((n, r) => n + r.licenseFiles.length, 0),
  pythonDistributions: wheels.length, pythonWithoutDetectedNoticeFile: wheels.filter(r => r.noticeReview === 'no-license-file-detected-review-metadata-and-upstream').map(r => r.distribution) }));
