// Collect exact source refs declared by the pinned official BtbN recipes.
// Recipes are read, never executed. Binary reproducibility is not asserted.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');
const output = path.resolve(process.argv[2]);
const recipeArchive = path.resolve(process.argv[3]);
const recipeCommit = '8267213e26c1031621e6e1210fe3aa4867214f6a';
const ffmpegCommit = 'e47273f4d9227152dcbf543cebaf9e2430ddbcc4';
fs.mkdirSync(output, { recursive: true });
const cache = path.join(output, '.git-source-cache'); fs.mkdirSync(cache, { recursive: true });
const emptyConfig = path.join(cache, 'empty.gitconfig'); fs.writeFileSync(emptyConfig, '');
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig,
  GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'https', GIT_LFS_SKIP_SMUDGE: '1' };
delete env.GIT_SSL_NO_VERIFY;
function git(args, timeout = 180000, proxy = false) {
  return new Promise((resolve, reject) => execFile('git', ['-c', 'credential.helper=', '-c', `http.proxy=${proxy ? 'http://127.0.0.1:10808' : ''}`, '-c', 'http.sslVerify=true',
    '-c', 'core.hooksPath=', ...args], { env, windowsHide: true, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 ** 2 },
  (error, stdout, stderr) => error ? reject(Error(`git ${args[0]}: ${String(stderr || error.message).replace(/https?:\/\/\S+/g, '<source-url>').slice(0, 240)}`)) : resolve(stdout)));
}
function readRecipe(member) { return execFileSync('tar.exe', ['-xOf', recipeArchive, '--', member], { encoding: 'utf8', maxBuffer: 4 * 1024 ** 2 }); }
function sha256(file) { return new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256'), input = fs.createReadStream(file);
  input.on('data', bytes => h.update(bytes)); input.on('error', reject); input.on('end', () => resolve(h.digest('hex')));
}); }
function httpsRepo(raw, parent) {
  let value = raw;
  if (value.startsWith('git@github.com:')) value = 'https://github.com/' + value.slice('git@github.com:'.length);
  if (/^\.\.?\//.test(value) && parent) value = new URL(value, parent.replace(/\/$/, '') + '/').href;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || /^(?:localhost|127\.|10\.|192\.168\.|\[)/i.test(url.hostname)) throw Error('Only public HTTPS source repos are allowed');
  return url.href.replace(/\/$/, '');
}
const names = execFileSync('tar.exe', ['-tf', recipeArchive], { encoding: 'utf8' }).trim().split(/\r?\n/);
const plan = [];
for (const member of names.filter(name => /\/scripts\.d\/.*\.sh$/.test(name))) {
  const text = readRecipe(member), vars = {};
  for (const match of text.matchAll(/^([A-Z][A-Z_0-9]*)=['"]([^'"\r\n]*)['"]\s*$/gm)) vars[match[1]] = match[2];
  if (!vars.SCRIPT_REPO) continue;
  const recipe = member.split('/').slice(1).join('/');
  const slug = path.posix.basename(recipe, '.sh').replace(/^\d+-/, '').replace(/[^a-zA-Z0-9_.-]/g, '-');
  plan.push({ component: slug, recipe, repo: vars.SCRIPT_REPO, ref: vars.SCRIPT_COMMIT || vars.SCRIPT_REV,
    type: vars.SCRIPT_REV ? 'svn' : 'git', submodules: /git submodule update/.test(text),
    submoduleFilter: /third_party\/highway/.test(text) ? ['third_party/highway'] : null,
    transitivePackageManagerReview: /\bcargo\b|\bnpm\b|\bpip\b|\bmeson wrap\b/.test(text) });
  if (vars.SCRIPT_REPO2 && vars.SCRIPT_COMMIT2) plan.push({ component: slug + '-secondary', recipe,
    repo: vars.SCRIPT_MIRROR2?.startsWith('https:') ? vars.SCRIPT_MIRROR2 : vars.SCRIPT_REPO2, ref: vars.SCRIPT_COMMIT2,
    type: 'git', submodules: false, nestedSourcePath: 'gnulib' });
}
plan.unshift({ component: 'ffmpeg', repo: 'https://github.com/FFmpeg/FFmpeg.git', ref: ffmpegCommit, type: 'git', submodules: false,
  recipe: 'build.sh + addins/9.0.sh; resolved from published binary version, not current release/9.0 HEAD' });
const unique = [...new Map(plan.map(item => [item.repo + '\n' + item.ref, item])).values()];
const receipt = { schema: 'dopi-ffmpeg-source-materials/v1', generatedAt: new Date().toISOString(), recipeCommit, ffmpegCommit,
  binary: { name: 'ffmpeg-n9.0.1-11-ge47273f4d9-win64-gpl-9.0.zip', size: 169202846, sha256: 'ec9db2cda1f5894ab95446076ad8bf49379db4b53c02e778ad3b49adf91fec83' },
  limitations: ['Recipe source refs are collected as a superset; not every recipe is enabled on win64-gpl.',
    'BtbN build.sh uses a floating release branch and base container :latest; the published FFmpeg commit is explicitly pinned here. Bit-for-bit reproduction is not asserted.',
    'SVN export, Git submodule coverage, Git LFS, and package-manager transitive sources remain explicit review fields. No Docker or recipe code is executed.'],
  recipeMappings: plan, sources: [], pending: [], complete: false };
function save() { const file = path.join(output, 'ffmpeg-source-materials.json'); fs.writeFileSync(file + '.tmp', JSON.stringify(receipt, null, 2)); fs.renameSync(file + '.tmp', file); }
const visited = new Map();
function gitmodules(text) {
  const result = []; let entry;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[submodule /.test(line)) { entry = {}; result.push(entry); }
    else { const m = line.match(/^\s*(path|url)\s*=\s*(.*?)\s*$/); if (m && entry) entry[m[1]] = m[2]; }
  }
  return result.filter(item => item.path && item.url);
}
async function collect(item, parent = null, depth = 0) {
  if (depth > 8) throw Error('Submodule depth limit');
  const repo = httpsRepo(item.repo, parent?.repo), identity = repo + '\n' + item.ref;
  if (visited.has(identity)) return visited.get(identity);
  if (!/^[a-zA-Z0-9_./+-]+$/.test(item.ref || '') || item.ref.startsWith('-')) throw Error('Unsafe or missing source ref');
  const id = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24);
  const bare = path.join(cache, id + '.git');
  if (!fs.existsSync(bare)) await git(['init', '--bare', bare]);
  let commit;
  try { commit = (await git(['--git-dir', bare, 'rev-parse', '--verify', item.ref + '^{commit}'])).trim(); } catch {}
  if (!commit || !/^[a-f0-9]{40}$/.test(commit)) {
    const fetchArgs = ['--git-dir', bare, 'fetch', '-4', '--depth=1', '--no-tags', repo, item.ref];
    try { await git(fetchArgs, 90000); } catch { await git(fetchArgs, 180000, true); }
    commit = (await git(['--git-dir', bare, 'rev-parse', 'FETCH_HEAD^{commit}'])).trim();
  }
  if (/^[a-f0-9]{40}$/.test(item.ref) && item.ref !== commit) throw Error('Fetched source commit differs from pin');
  const filename = `${item.component.replace(/[^a-zA-Z0-9_.-]/g, '-')}-${commit}.tar.gz`;
  const file = path.join(output, filename);
  if (!fs.existsSync(file)) { await git(['--git-dir', bare, 'archive', '--format=tar.gz', `--prefix=${item.component}-${commit}/`, '--output', file + '.partial', commit], 180000); fs.renameSync(file + '.partial', file); }
  const tree = (await git(['--git-dir', bare, 'ls-tree', '-r', commit])).split(/\r?\n/);
  const links = tree.filter(line => line.startsWith('160000 ')).map(line => { const m = line.match(/^160000 commit ([a-f0-9]{40})\t(.+)$/); return m && { commit: m[1], path: m[2] }; }).filter(Boolean);
  let modules = []; if (links.length) { try { modules = gitmodules(await git(['--git-dir', bare, 'show', commit + ':.gitmodules'])); } catch {} }
  const row = { component: item.component, recipe: item.recipe, repo, requestedRef: item.ref, commit, filename, size: fs.statSync(file).size,
    sha256: await sha256(file), submodulesRequiredByRecipe: Boolean(item.submodules), gitlinks: links, resolvedSubmodules: [],
    transitivePackageManagerReview: Boolean(item.transitivePackageManagerReview), status: 'source-archived' };
  visited.set(identity, row); receipt.sources.push(row); save();
  if (item.submodules) for (const link of links.filter(link => !item.submoduleFilter || item.submoduleFilter.includes(link.path))) {
    const module = modules.find(module => module.path === link.path);
    if (!module) { receipt.pending.push({ component: item.component, path: link.path, reason: 'No corresponding .gitmodules URL' }); continue; }
    try {
      const child = await collect({ component: item.component + '--' + link.path.replace(/[^a-zA-Z0-9_.-]/g, '-'), repo: module.url, ref: link.commit,
        type: 'git', submodules: true, recipe: item.recipe }, { repo }, depth + 1);
      row.resolvedSubmodules.push({ path: link.path, filename: child.filename, commit: child.commit });
    } catch (error) { receipt.pending.push({ component: item.component, path: link.path, ref: link.commit, reason: error.message }); }
  }
  console.log(`FFMPEG_SOURCE ${item.component} ${row.size}`); save(); return row;
}
async function main() {
  receipt.recipeArchive = { filename: path.basename(recipeArchive), size: fs.statSync(recipeArchive).size, sha256: await sha256(recipeArchive) }; save();
  // One source transfer at a time: the separate Git-for-Windows collector uses three.
  for (const item of unique.sort((a, b) => Number(!a.repo.includes('github.com')) - Number(!b.repo.includes('github.com')))) {
    if (item.type === 'svn') { receipt.pending.push({ ...item, reason: 'Exact SVN revision needs export; no SVN client available in the build environment.' }); save(); continue; }
    try { await collect(item); } catch (error) { receipt.pending.push({ component: item.component, repo: item.repo, ref: item.ref, reason: error.message }); save(); console.log(`FFMPEG_PENDING ${item.component}`); }
  }
  receipt.declaredRefsComplete = receipt.pending.length === 0;
  // Even a complete declared-ref collection needs review of Cargo/etc. sources.
  receipt.complete = receipt.declaredRefsComplete && !receipt.sources.some(source => source.transitivePackageManagerReview);
  receipt.collectedBytes = receipt.sources.reduce((sum, item) => sum + item.size, 0); save();
  console.log(JSON.stringify({ complete: receipt.complete, archives: receipt.sources.length, bytes: receipt.collectedBytes, pending: receipt.pending.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
