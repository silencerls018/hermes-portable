const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');
const output = path.resolve(process.argv[2]);
const plan = [
  { component: 'pulseaudio', repo: 'https://gitlab.freedesktop.org/pulseaudio/pulseaudio', commit: '0cc36279ec993680bccad6b907ba15de97b55c4d',
    url: 'https://gitlab.freedesktop.org/pulseaudio/pulseaudio/-/archive/0cc36279ec993680bccad6b907ba15de97b55c4d/pulseaudio-0cc36279ec993680bccad6b907ba15de97b55c4d.tar.gz',
    evidence: 'Pinned official recipe. Binary buildconf disables libpulse on win64; source superset. Official GitLab archive preserves Unix filenames that git archive on Windows cannot encode; never extracted.' },
  { component: 'crosstool-ng', repo: 'https://github.com/crosstool-ng/crosstool-ng', commit: '185f3483e0e5028357b131fb97c4331551a70a1e',
    evidence: 'Published FFmpeg -version reports crosstool-NG 1.28.0.23_185f348; GitHub official commit endpoint resolves the short SHA.',
    limitation: 'Base container identity and exact system/tool versions are not attested by this source archive.' },
  { component: 'ffnvcodec-third', repo: 'https://github.com/FFmpeg/nv-codec-headers', commit: '833faee5f7b8d3f56444347c587f4aed11ee213f',
    evidence: 'scripts.d/50-ffnvcodec.sh SCRIPT_REPO3/COMMIT3 in pinned BtbN recipe; extra source superset, not selected by FFVER >= 900.' },
];
const receipt = { schema: 'dopi-ffmpeg-source-supplements/v1', generatedAt: new Date().toISOString(), sources: [], pending: [] };
const save = () => fs.writeFileSync(path.join(output, 'ffmpeg-source-supplements.json'), JSON.stringify(receipt, null, 2) + '\n');
async function hash(file) { const h = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) h.update(chunk); return h.digest('hex'); }
async function main() {
  for (const item of plan) {
    try {
      const filename = `${item.component}-${item.commit}.tar.gz`, file = path.join(output, filename);
      const url = item.url || item.repo.replace('https://github.com/', 'https://codeload.github.com/') + '/tar.gz/' + item.commit;
      if (!fs.existsSync(file)) {
        let done = false;
        for (const proxy of [false, true]) {
          const args = ['-4', ...(proxy ? ['--proxy', 'http://127.0.0.1:10808', '--noproxy', ''] : ['--noproxy', '*']),
            '--proto', '=https', '--proto-redir', '=https', '--fail', '--location', '--silent', '--show-error', '--connect-timeout', '30',
            '--max-time', '600', '--max-filesize', String(512 * 1024 ** 2), '--output', file + '.partial', url];
          const result = await new Promise(resolve => execFile('curl.exe', args, { windowsHide: true, maxBuffer: 1024 ** 2 },
            (error, stdout, stderr) => resolve({ error, stderr })));
          if (result.error) { if (proxy) throw Error(String(result.stderr || result.error.message).slice(0, 300)); continue; }
          fs.renameSync(file + '.partial', file); done = true; break;
        }
        if (!done) throw Error('Supplement download failed');
      }
      const entries = execFileSync('tar.exe', ['-tf', file], { encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 }).trim().split(/\r?\n/);
      if (!entries.length || entries.some(name => !name.split('/')[0].endsWith(item.commit))) throw Error('Source archive root does not match commit');
      receipt.sources.push({ ...item, filename, url, size: fs.statSync(file).size, sha256: await hash(file), status: 'source-archived' });
      console.log('SUPPLEMENT ' + item.component);
    } catch (error) { receipt.pending.push({ ...item, reason: error.message }); }
    save();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
