// Collect source candidates from official Git for Windows / MSYS2 archives.
// This records evidence; it is not a legal certification or a reproducible-build claim.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');

const output = path.resolve(process.argv[2]);
const gitRoot = path.resolve(process.argv[3]);
const recipes = { msys: 'https://github.com/git-for-windows/MSYS2-packages', mingw: 'https://github.com/git-for-windows/MINGW-packages' };
const aliases = { 'gcc-libs': 'gcc', 'heimdal-libs': 'heimdal', libbz2: 'bzip2', libcurl: 'curl', libexpat: 'expat', libgnutls: 'gnutls',
  libhogweed: 'nettle', libnettle: 'nettle', libintl: 'gettext', liblz4: 'lz4', liblzma: 'xz', libnghttp2: 'nghttp2', libnpth: 'npth',
  libopenssl: 'openssl', 'libp11-kit': 'p11-kit', libpcre: 'pcre', libpcre2_8: 'pcre2', libpcre2posix: 'pcre2', libreadline: 'readline',
  libsasl: 'cyrus-sasl', libserf: 'serf', libsqlite: 'sqlite', 'libutil-linux': 'util-linux', libzstd: 'zstd' };
const mingwAliases = { 'gcc-libs': 'gcc', 'curl-winssl': 'curl', 'curl-openssl-alternate': 'curl', 'libssh2-wincng': 'libssh2',
  'gettext-runtime': 'gettext', libwinpthread: 'winpthreads' };
function sourceBase(name, version) {
  if (name.startsWith('mingw-w64-x86_64-')) {
    let base = name.slice('mingw-w64-x86_64-'.length);
    if (version === '2.53.0.3-1' && /^(?:git(?:-|$)|gitk$|gitweb$)/.test(base)) base = 'git';
    return { base: 'mingw-w64-' + (mingwAliases[base] || base), flavor: 'mingw', recipe: recipes.mingw };
  }
  return { base: aliases[name] || name, flavor: 'msys', recipe: recipes.msys };
}
function digest(file) { return new Promise((resolve, reject) => { const hash = crypto.createHash('sha256'); const stream = fs.createReadStream(file);
  stream.on('data', chunk => hash.update(chunk)); stream.on('error', reject); stream.on('end', () => resolve(hash.digest('hex'))); }); }
async function text(url) { const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw Error(`HTTP ${r.status} ${url}`); return r.text(); }
async function index(flavor) {
  const file = path.join(output, `msys2-${flavor}-sources.html`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, await text(`https://repo.msys2.org/${flavor}/sources/`));
  const result = new Map();
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/href="([^"]+\.src\.tar\.(?:gz|xz|zst))"/g)) {
    const name = decodeURIComponent(m[1]); if (name.includes('/')) continue;
    result.set(name, { name, url: `https://repo.msys2.org/${flavor}/sources/${m[1]}`, origin: 'msys2-source-mirror', digest: null });
  }
  return result;
}
async function download(asset) {
  const final = path.join(output, asset.name), temp = final + '.partial';
  const expected = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : null;
  if (fs.existsSync(final) && fs.statSync(final).size > 0 && (!asset.size || fs.statSync(final).size === asset.size)) {
    const hash = await digest(final); if (!expected || hash === expected) return { filename: asset.name, size: fs.statSync(final).size, sha256: hash, upstreamDigestVerified: Boolean(expected) };
  }
  if (!['repo.msys2.org', 'github.com'].includes(new URL(asset.url).hostname) || !asset.url.startsWith('https://')) throw Error('Unexpected official source origin');
  // All partials here belong to the exact, version-pinned public source URL.
  // curl validates Content-Range; unsupported resume uses a different new file.
  const previousRetry = final + '.retry.partial';
  if (fs.existsSync(previousRetry) && fs.statSync(previousRetry).size > (fs.existsSync(temp) ? fs.statSync(temp).size : 0)) fs.copyFileSync(previousRetry, temp);
  const resumedFromBytes = fs.existsSync(temp) ? fs.statSync(temp).size : 0;
  let target = temp, useRange = true, lastError = '';
  const deadline = Date.now() + 2 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 4 && Date.now() < deadline; attempt++) {
    const headers = temp + '.headers';
    const route = attempt % 2 ? ['--proxy', 'http://127.0.0.1:10808', '--noproxy', ''] : ['--noproxy', '*'];
    const args = ['-4', ...route, '--proto', '=https', '--proto-redir', '=https', '--fail', '--location', '--silent', '--show-error',
      '--connect-timeout', '30', '--max-time', String(Math.max(1, Math.floor((deadline - Date.now()) / 1000))),
      '--speed-limit', '1024', '--speed-time', '120', '--max-filesize', String(500 * 1024 ** 2), '--dump-header', headers,
      ...(useRange ? ['--continue-at', '-'] : []), '--output', target, asset.url];
    const result = await new Promise(resolve => execFile('curl.exe', args, { windowsHide: true, maxBuffer: 1024 ** 2 }, (error, stdout, stderr) => resolve({ code: error?.code || 0, stderr })));
    const headerText = fs.existsSync(headers) ? fs.readFileSync(headers, 'utf8') : '';
    const totalMatch = [...headerText.matchAll(/^content-range:\s*bytes\s+(?:\d+-\d+|\*)\/(\d+)\s*$/gmi)].at(-1);
    const lengthMatch = [...headerText.matchAll(/^content-length:\s*(\d+)\s*$/gmi)].at(-1);
    const total = asset.size || (totalMatch ? Number(totalMatch[1]) : !useRange || !resumedFromBytes ? Number(lengthMatch?.[1]) || null : null);
    const bytes = fs.existsSync(target) ? fs.statSync(target).size : 0;
    const completeRange = result.code === 22 && /HTTP\/[^\r\n]* 416\b/.test(headerText) && totalMatch && bytes === Number(totalMatch[1]);
    if (result.code === 33) { target = temp + '.fresh'; useRange = false; continue; }
    if (result.code !== 0 && !completeRange) { lastError = String(result.stderr || `curl exit ${result.code}`).replace(/https?:\/\/\S+/g, '<source-url>').slice(0, 240); continue; }
    const sha256 = await digest(target);
    if (!bytes || total && bytes !== total || expected && expected !== sha256) throw Error('Source archive size/digest mismatch');
    execFileSync('tar.exe', ['-tf', target], { stdio: 'ignore', timeout: 120000 });
    fs.renameSync(target, final);
    return { filename: asset.name, size: bytes, sha256, upstreamDigestVerified: Boolean(expected), resumedFromBytes,
      transferPolicy: 'HTTPS IPv4 direct with local proxy fallback; range resume; two-hour total deadline; 120-second low-speed timeout; full-file hash and archive-read check' };
  }
  throw Error(lastError || 'Source transfer deadline exceeded');
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const versions = fs.readFileSync(path.join(gitRoot, 'etc/package-versions.txt'), 'utf8');
  fs.writeFileSync(path.join(output, 'bundled-package-versions.txt'), versions);
  const msys = await index('msys'), mingw = await index('mingw');
  const gfw = new Map();
  for (const file of fs.readdirSync(output).filter(name => /^pacman-releases-page\d+\.jsonl$/.test(name))) {
    for (const line of fs.readFileSync(path.join(output, file), 'utf8').trim().split(/\r?\n/)) {
      if (!line) continue; const release = JSON.parse(line);
      for (const asset of release.assets) if (!gfw.has(asset.name)) gfw.set(asset.name, { ...asset, origin: 'git-for-windows-pacman-release', release: release.tag });
    }
  }
  const release = JSON.parse(execFileSync('gh', ['api', 'repos/git-for-windows/git/releases/tags/v2.53.0.windows.3'], { encoding: 'utf8', maxBuffer: 4 * 1024 ** 2 }));
  for (const asset of release.assets.filter(a => a.name.endsWith('.src.tar.gz'))) gfw.set(asset.name, { name: asset.name, url: asset.browser_download_url, size: asset.size, digest: asset.digest, origin: 'git-for-windows-git-release', release: release.tag_name });
  const rows = [];
  for (const line of [...new Set(versions.trim().split(/\r?\n/))]) {
    const [name, version] = line.split(/\s+/), source = sourceBase(name, version), v = version.replace(/^\d+~/, '');
    // MSYS2 retains the epoch as '~'; GfW replaces it with '.' in release asset filenames.
    const stems = [...new Set([version, v, version.replace('~', '.')])].map(value => `${source.base}-${value}.src.tar.`);
    const matches = a => stems.some(stem => a.name.startsWith(stem));
    const candidate = [...gfw.values()].find(matches) || [...(source.flavor === 'msys' ? msys : mingw).values()].find(matches);
    rows.push({ package: name, version, sourceBase: source.base, sourceMapping: name.includes(source.base) ? 'name-match' : 'split-package-candidate-needs-recipe-check',
      recipeRepository: candidate?.origin === 'msys2-source-mirror'
        ? `https://github.com/msys2/${source.flavor === 'mingw' ? 'MINGW-packages' : 'MSYS2-packages'}` : source.recipe,
      source: candidate || null, status: candidate ? 'candidate-located-not-yet-verified' : 'missing-exact-source-candidate' });
  }
  const assets = [...new Map(rows.filter(row => row.source).map(row => [row.source.name, row.source])).values()];
  const receipt = { schema: 'dopi-portablegit-source-materials/v1', gitVersion: '2.53.0+3', gitRelease: 'https://github.com/git-for-windows/git/releases/tag/v2.53.0.windows.3',
    collectedAt: new Date().toISOString(), limitation: 'Exact version candidates are not a proof of binary correspondence. Split-package recipes and upstream sources within archives must be inspected. Missing sources remain a release gap.', packages: rows, downloads: [] };
  fs.writeFileSync(path.join(output, 'source-materials.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ packages: rows.length, candidates: assets.length, missing: rows.filter(r => !r.source).map(r => `${r.package} ${r.version}`) }));
  let next = 0;
  async function worker() {
    while (next < assets.length) {
      const asset = assets[next++];
      try { const result = await download(asset); receipt.downloads.push({ ...result, url: asset.url, status: 'downloaded' }); console.log(`SOURCE ${asset.name} ${result.size}`); }
      catch (error) { receipt.downloads.push({ filename: asset.name, url: asset.url, status: 'download-failed', error: error.message }); console.log(`FAILED ${asset.name}: ${error.message}`); }
      fs.writeFileSync(path.join(output, 'source-materials.json'), JSON.stringify(receipt, null, 2));
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  const completed = receipt.downloads.filter(item => item.status === 'downloaded');
  console.log(JSON.stringify({ complete: completed.length === assets.length, sourceArchives: assets.length,
    downloaded: completed.length, bytes: completed.reduce((sum, item) => sum + item.size, 0),
    failed: receipt.downloads.filter(item => item.status !== 'downloaded').map(item => item.filename) }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
