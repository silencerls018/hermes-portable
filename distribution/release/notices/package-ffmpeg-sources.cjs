// Package only explicitly receipted source files; never include caches/partials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
if (fs.existsSync(output)) throw Error('Refusing to overwrite existing attachment');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const sha256 = async file => { const h = crypto.createHash('sha256'); for await (const bytes of fs.createReadStream(file)) h.update(bytes); return h.digest('hex'); };
async function main() {
  const base = read('ffmpeg-source-materials.json'), svn = read('ffmpeg-svn-source-materials.json');
  const extra = read('ffmpeg-source-supplements.json'), cargo = read('rav1e-cargo-source-materials.json'), toolchain = read('ffmpeg-toolchain-source-materials.json');
  if (svn.pending.length || extra.pending.length || cargo.pending.length || toolchain.pending.length || !cargo.lockfileSourcesComplete) throw Error('Supplementary source download gaps remain');
  const gitSources = [...base.sources, ...extra.sources];
  const svnSources = svn.sources;
  const submoduleCoverage = [];
  for (const row of base.sources.filter(source => source.submodulesRequiredByRecipe)) {
    const mapping = base.recipeMappings.find(item => item.component === row.component);
    const required = row.gitlinks.filter(link => !mapping?.submoduleFilter || mapping.submoduleFilter.includes(link.path));
    for (const link of required) {
      const resolved = row.resolvedSubmodules.find(item => item.path === link.path && item.commit === link.commit);
      if (!resolved || !gitSources.some(source => source.filename === resolved.filename && source.commit === link.commit)) throw Error('Missing required submodule: ' + row.component + '/' + link.path);
    }
    submoduleCoverage.push({ component: row.component, required: required.length, collected: required.length,
      excludedByRecipe: row.gitlinks.filter(link => !required.includes(link)).map(link => link.path) });
  }
  const unresolved = base.pending.filter(item => !gitSources.some(source => source.component === item.component && source.commit === item.ref)
    && !svnSources.some(source => source.component === item.component && source.revision === item.ref));
  if (unresolved.length) throw Error('Unresolved main source gaps: ' + unresolved.map(row => row.component).join(', '));
  for (const mapping of base.recipeMappings) {
    const match = mapping.type === 'svn' ? svnSources.some(row => row.component === mapping.component && row.revision === mapping.ref)
      : gitSources.some(row => (row.repo?.replace(/\.git$/, '') === mapping.repo?.replace(/\.git$/, '') || row.component === mapping.component)
        && (row.requestedRef === mapping.ref || row.commit === mapping.ref));
    if (!match) throw Error('Uncovered recipe source ref: ' + mapping.component);
  }
  const files = new Map();
  for (const row of [...gitSources, ...svnSources, ...cargo.sources, ...toolchain.sources]) {
    if (!/^[a-zA-Z0-9_./+~-]+$/.test(row.filename) || row.filename.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Unsafe source filename');
    const file = path.resolve(root, row.filename);
    if (!file.startsWith(root + path.sep)) throw Error('Source path escapes root');
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size !== row.size || await sha256(file) !== row.sha256) throw Error('Source integrity mismatch: ' + row.filename);
    if (files.has(row.filename) && files.get(row.filename).sha256 !== row.sha256) throw Error('Duplicate source name with differing hashes');
    files.set(row.filename, { filename: row.filename, size: row.size, sha256: row.sha256, component: row.component || row.name, provenance: row.repo || row.url });
  }
  const inventory = [];
  for (const row of files.values()) {
    const file = path.join(root, row.filename);
    const entries = execFileSync('tar.exe', ['-tf', file], { encoding: 'utf8', maxBuffer: 32 * 1024 ** 2 }).trim().split(/\r?\n/);
    const attributes = entries.filter(name => /(?:^|\/)\.gitattributes$/.test(name));
    const lfs = [];
    for (const member of attributes) {
      const content = execFileSync('tar.exe', ['-xOf', file, '--', member], { encoding: 'utf8', maxBuffer: 1024 ** 2 });
      if (/filter\s*=\s*lfs/.test(content)) lfs.push(member);
    }
    inventory.push({ ...row, archiveMembers: entries.length,
      noticeFiles: entries.filter(name => /(?:^|\/)(?:licen[cs]e(?:[-._].*)?|copying(?:[-._].*)?|notice(?:[-._].*)?|copyright(?:[-._].*)?|unlicense)$/i.test(name)),
      gitLfsAttributeFiles: lfs });
  }
  const recipe = base.recipeArchive;
  const recipeFile = path.join(path.dirname(root), recipe.filename);
  if (fs.statSync(recipeFile).size !== recipe.size || await sha256(recipeFile) !== recipe.sha256) throw Error('Recipe archive integrity mismatch');
  const recipeTarget = path.join(root, recipe.filename); fs.copyFileSync(recipeFile, recipeTarget);
  files.set(recipe.filename, { filename: recipe.filename, size: recipe.size, sha256: recipe.sha256, component: 'BtbN build recipes and patches' });
  fs.copyFileSync(path.join(path.dirname(root), 'ffmpeg-pinned-buildconf.txt'), path.join(root, 'ffmpeg-pinned-buildconf.txt'));
  for (const name of ['FFMPEG-SOURCE-NOTICE.txt', 'ffmpeg-LICENSE.txt']) fs.copyFileSync(path.join(__dirname, name), path.join(root, name));
  const final = { schema: 'dopi-ffmpeg-source-attachment/v1', generatedAt: new Date().toISOString(), binary: base.binary,
    recipeCommit: base.recipeCommit, ffmpegCommit: base.ffmpegCommit, declaredRecipeRefsCollected: true,
    sourceArchives: inventory.length + 1, sourceBytes: [...files.values()].reduce((n, row) => n + row.size, 0),
    originalCollectorPendingResolvedBySupplements: base.pending,
    limitations: [...base.limitations, cargo.limitation, toolchain.limitation],
    pendingBuildToolResolution: cargo.pendingBuildToolResolution || [],
    gitLfsReview: inventory.filter(row => row.gitLfsAttributeFiles.length),
    binaryReproducibilityEstablished: false, submoduleCoverage, inventory };
  fs.writeFileSync(path.join(root, 'ffmpeg-source-attachment-manifest.json'), JSON.stringify(final, null, 2) + '\n');
  const metadata = ['ffmpeg-source-materials.json', 'ffmpeg-svn-source-materials.json', 'ffmpeg-source-supplements.json',
    'rav1e-cargo-source-materials.json', 'ffmpeg-toolchain-source-materials.json', 'ffmpeg-source-attachment-manifest.json',
    'ffmpeg-pinned-buildconf.txt', 'rav1e-crates/Cargo.lock', 'FFMPEG-SOURCE-NOTICE.txt', 'ffmpeg-LICENSE.txt'];
  const names = [...files.keys(), ...metadata];
  const sums = [];
  for (const name of names) sums.push(`${await sha256(path.join(root, name))}  ${name}`);
  fs.writeFileSync(path.join(root, 'SOURCE-SHA256SUMS.txt'), sums.sort().join('\n') + '\n'); names.push('SOURCE-SHA256SUMS.txt');
  const list = path.join(root, 'ffmpeg-source-attachment-files.txt'); fs.writeFileSync(list, names.sort().join('\n') + '\n');
  execFileSync('tar.exe', ['-cf', output, '-C', root, '-T', list], { stdio: 'inherit' });
  const result = { filename: path.basename(output), size: fs.statSync(output).size, sha256: await sha256(output), members: names.length,
    sourceArchives: final.sourceArchives, gitLfsReviewCount: final.gitLfsReview.length, binaryReproducibilityEstablished: false };
  fs.writeFileSync(output + '.receipt.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
