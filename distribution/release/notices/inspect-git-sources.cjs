// Read-only inspection: archive metadata and recipes are read, never executed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sources = path.resolve(process.argv[2]);
const reportPath = path.resolve(process.argv[3]);
const receipt = JSON.parse(fs.readFileSync(path.join(sources, 'source-materials.json'), 'utf8'));
const inspections = [];
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
for (const item of receipt.downloads.filter(item => item.status === 'downloaded')) {
  const archive = path.join(sources, item.filename);
  try {
    const entries = execFileSync('tar.exe', ['-tf', archive], { encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 }).trim().split(/\r?\n/);
    const recipePath = entries.find(name => /(?:^|\/)PKGBUILD$/.test(name));
    const srcinfoPath = entries.find(name => /(?:^|\/)\.SRCINFO$/.test(name));
    const recipe = recipePath ? execFileSync('tar.exe', ['-xOf', archive, '--', recipePath], { encoding: 'utf8', maxBuffer: 2 * 1024 ** 2 }) : '';
    const srcinfo = srcinfoPath ? execFileSync('tar.exe', ['-xOf', archive, '--', srcinfoPath], { encoding: 'utf8', maxBuffer: 2 * 1024 ** 2 }) : '';
    const info = {};
    for (const line of srcinfo.split(/\r?\n/)) {
      const m = line.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) (info[m[1]] ||= []).push(m[2]);
    }
    // Archives inside the source package are evidence of source payload, not proof
    // that every dependency or generated file required to rebuild is present.
    const upstreamArchives = entries.filter(name => /\.(?:tar(?:\.(?:gz|xz|bz2|zst))?|tgz|zip|tbz2|txz)$/.test(name));
    const sourceFiles = entries.filter(name => /\.(?:c|h|cpp|cc|rs|go|py|pl|pm|sh|patch|diff)$/.test(name));
    const declaredSources = [...new Set(Object.entries(info).filter(([key]) => /^source(?:_|$)/.test(key)).flatMap(([, value]) => value))];
    const sourceChecks = declaredSources.map(source => {
      const pieces = source.split('::'), location = pieces.at(-1);
      const vcs = /^(?:git|hg|svn|bzr)\+/.test(location);
      let filename = pieces.length > 1 ? pieces[0] : location.split(/[?#]/)[0].split('/').at(-1);
      try { filename = decodeURIComponent(filename); } catch {}
      const embedded = entries.some(name => path.posix.basename(name.replace(/\/$/, '')) === filename);
      return { source, filename, vcs, embeddedByName: embedded };
    });
    // pacman VCS source archives can contain a bare Git object store instead of
    // a checkout. Read only pack/index objects; never load its config or hooks.
    const embeddedGitSources = [];
    for (const source of sourceChecks.filter(source => source.vcs && /#commit=[a-f0-9]{40}$/.test(source.source))) {
      const pin = source.source.match(/#commit=([a-f0-9]{40})$/)[1];
      const packs = entries.filter(name => name.includes('/' + source.filename + '/objects/pack/') && /\/pack-[a-f0-9]{40}\.(?:pack|idx)$/.test(name));
      if (!packs.length) continue;
      const bare = path.join(sources, '.source-object-inspection', sha256(item.filename).slice(0, 24) + '.git');
      fs.mkdirSync(path.join(bare, 'objects', 'pack'), { recursive: true });
      fs.mkdirSync(path.join(bare, 'refs'), { recursive: true });
      fs.writeFileSync(path.join(bare, 'HEAD'), 'ref: refs/heads/source-inspection\n');
      fs.writeFileSync(path.join(bare, 'config'), '[core]\n\tbare = true\n');
      for (const member of packs) fs.writeFileSync(path.join(bare, 'objects', 'pack', path.posix.basename(member)),
        execFileSync('tar.exe', ['-xOf', archive, '--', member], { maxBuffer: 64 * 1024 ** 2 }));
      const git = args => execFileSync('git', ['--git-dir', bare, '-c', 'core.hooksPath=', ...args], { encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_NO_REPLACE_OBJECTS: '1' }, maxBuffer: 8 * 1024 ** 2 }).trim();
      const commit = git(['rev-parse', '--verify', pin + '^{commit}']);
      const tree = git(['rev-parse', '--verify', pin + '^{tree}']);
      const files = git(['ls-tree', '-r', '--name-only', pin]).split(/\r?\n/).filter(Boolean);
      if (commit !== pin || !files.length) throw Error('Embedded Git source pin is unavailable');
      embeddedGitSources.push({ filename: source.filename, commit, tree, sourceFileCount: files.length, verifiedFromArchiveObjects: true });
    }
    const expectedPackages = receipt.packages.filter(row => row.source?.name === item.filename);
    const supportsMingw64 = /mingw_arch\s*=\s*\([^)]*['"]mingw64['"]/.test(recipe) && recipe.includes('MINGW_PACKAGE_PREFIX');
    const normalizeMingw = name => name.replace(/^mingw-w64-(?:ucrt-x86_64|clang-x86_64|clang-aarch64|i686)-/, 'mingw-w64-x86_64-');
    inspections.push({ filename: item.filename, size: item.size, sha256: item.sha256, upstreamDigestVerified: item.upstreamDigestVerified,
      url: item.url, entries: entries.length, recipePath: recipePath || null, recipeSha256: recipe ? sha256(recipe) : null,
      srcinfoPath: srcinfoPath || null, declaredPackages: info.pkgname || [], declaredVersion: info.pkgver?.[0] || null,
      declaredRelease: info.pkgrel?.[0] || null, declaredEpoch: info.epoch?.[0] || null, declaredLicenses: info.license || [],
      upstreamArchives, sourceOrPatchFileCount: sourceFiles.length, embeddedGitSources, declaredSources: sourceChecks,
      declaredSourcesNotFoundByName: sourceChecks.filter(source => !source.embeddedByName),
      expectedPackages: expectedPackages.map(row => ({ package: row.package, version: row.version,
        packageNameConfirmedBySrcinfo: (info.pkgname || []).includes(row.package),
        packageNameConfirmedByParametricMingwRecipe: supportsMingw64 && (info.pkgname || []).some(name => normalizeMingw(name) === row.package),
        packageVersionConfirmedBySrcinfo: info.pkgver?.[0] && info.pkgrel?.[0]
          ? row.version === `${info.epoch?.[0] ? info.epoch[0] + '~' : ''}${info.pkgver[0]}-${info.pkgrel[0]}` : false })),
      assessment: upstreamArchives.length || sourceFiles.length || embeddedGitSources.length ? 'contains-recipe-and-source-material-needs-correspondence-review' : 'recipe-only-or-unrecognized-payload-review-required' });
  } catch (error) { inspections.push({ filename: item.filename, status: 'inspection-failed', error: error.message.slice(0, 500) }); }
}
const report = { schema: 'dopi-portablegit-source-inspection/v1', inspectedAt: new Date().toISOString(),
  limitation: 'No package recipes were executed. Candidate sources and metadata were inspected; binary reproducibility and complete transitive-source coverage have not been established.',
  packageCount: receipt.packages.length, expectedSourceArchiveCount: new Set(receipt.packages.filter(r => r.source).map(r => r.source.name)).size,
  downloadedSourceArchiveCount: receipt.downloads.filter(r => r.status === 'downloaded').length,
  downloadFailures: receipt.downloads.filter(r => r.status !== 'downloaded'),
  missingExactPacmanSources: receipt.packages.filter(r => !r.source).map(({ package: name, version }) => ({ package: name, version })),
  inspections };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ inspected: inspections.length, failures: inspections.filter(r => r.status === 'inspection-failed').length,
  recipeOnlyOrUnknown: inspections.filter(r => r.assessment === 'recipe-only-or-unrecognized-payload-review-required').map(r => r.filename) }));
