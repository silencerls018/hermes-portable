const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');
const output = path.resolve(process.argv[2]), svn = path.resolve(process.argv[3]);
const config = path.join(output, '.svn-config'); fs.mkdirSync(config, { recursive: true });
const cache = path.join(output, '.svn-export-cache'); fs.mkdirSync(cache, { recursive: true });
const sources = [
  { component: 'libmp3lame', repo: 'https://svn.code.sf.net/p/lame/svn/trunk/lame', revision: '6761', recipe: 'scripts.d/50-libmp3lame.sh' },
  { component: 'xvid', repo: 'https://svn.xvid.org/trunk/xvidcore', revision: '2204', recipe: 'scripts.d/50-xvid.sh' },
];
const receipt = { schema: 'dopi-ffmpeg-svn-source-materials/v1', generatedAt: new Date().toISOString(),
  tool: { source: 'https://www.visualsvn.com/files/Apache-Subversion-1.15.0-x64.zip', sha256: '98bb798dd6c70cc875b9bdacd600594351cf88f0a39a831a5055df061c871bb5',
    authenticode: 'Valid; VisualSVN Software Limited' }, sources: [], pending: [] };
function save() { fs.writeFileSync(path.join(output, 'ffmpeg-svn-source-materials.json'), JSON.stringify(receipt, null, 2)); }
function run(args, proxy) { return new Promise((resolve, reject) => execFile(svn,
  [...args, '--non-interactive', '--no-auth-cache', '--username', 'anonymous', '--password', '', '--config-dir', config,
    ...(proxy ? ['--config-option', 'servers:global:http-proxy-host=127.0.0.1', '--config-option', 'servers:global:http-proxy-port=10808'] : [])],
  { windowsHide: true, timeout: 300000, encoding: 'utf8', maxBuffer: 4 * 1024 ** 2 },
  (error, stdout, stderr) => error ? reject(Error(String(stderr || error.message).slice(0, 400))) : resolve(stdout))); }
async function hash(file) { const h = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) h.update(chunk); return h.digest('hex'); }
async function main() {
  for (const item of sources) {
    try {
      const filename = `${item.component}-svn-r${item.revision}.tar.gz`, file = path.join(output, filename);
      let externals = '';
      if (!fs.existsSync(file)) {
        let exported;
        for (const proxy of [false, true]) {
          const destination = path.join(cache, `${item.component}-r${item.revision}-${crypto.randomBytes(4).toString('hex')}`);
          try {
            await run(['export', '--quiet', '--ignore-externals', '--native-eol', 'LF', '-r', item.revision, `${item.repo}@${item.revision}`, destination], proxy);
            exported = destination;
            externals = await run(['propget', '--recursive', '--xml', '-r', item.revision, 'svn:externals', `${item.repo}@${item.revision}`], proxy);
            break;
          } catch (error) { if (proxy) throw error; }
        }
        execFileSync('tar.exe', ['-czf', file + '.partial', '-C', exported, '.'], { stdio: 'ignore', timeout: 180000 });
        fs.renameSync(file + '.partial', file);
        fs.writeFileSync(file + '.externals.xml', externals);
      } else externals = fs.readFileSync(file + '.externals.xml', 'utf8');
      const hasExternals = /<property\b/.test(externals);
      receipt.sources.push({ ...item, filename, size: fs.statSync(file).size, sha256: await hash(file),
        nativeEol: 'LF', externalDeclarations: hasExternals ? 'present-needs-separate-collection' : 'none', status: 'source-exported' });
      if (hasExternals) receipt.pending.push({ component: item.component, reason: 'SVN externals require separate exact-revision collection' });
      console.log(`SVN_SOURCE ${item.component}`);
    } catch (error) { receipt.pending.push({ ...item, reason: error.message }); console.log(`SVN_PENDING ${item.component}`); }
    save();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
