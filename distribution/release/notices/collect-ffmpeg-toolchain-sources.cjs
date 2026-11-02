const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile, execFileSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const output = path.resolve(process.argv[2]);
const recipeRoot = path.dirname(output);
const rows = [
  { component: 'gcc-runtime-sources', filename: 'gcc-15.2.0.tar.xz', sha256: '438fd996826b0c82485a29da03a72d71d6e3541a83ec702df4271f6fe025d24e',
    url: 'https://ftp.gnu.org/gnu/gcc/gcc-15.2.0/gcc-15.2.0.tar.xz',
    container: 'mingw-w64-gcc-15.2.0-11.src.tar.zst', member: 'mingw-w64-gcc/gcc-15.2.0.tar.xz',
    evidence: 'Published compiler version + base-win64 ct-ng-config + crosstool-ng 185f348 packages/gcc/15.2.0/chksum; includes libgcc/libstdc++/libgomp and runtime exception.' },
  { component: 'mingw-w64-toolchain-runtime', filename: 'mingw-w64-v13.0.0.tar.bz2', sha256: '5afe822af5c4edbf67daaf45eec61d538f49eef6b19524de64897c6b95828caf',
    url: 'https://downloads.sourceforge.net/project/mingw-w64/mingw-w64/mingw-w64-release/mingw-w64-v13.0.0.tar.bz2',
    evidence: 'Pinned BtbN base-win64 ct-ng-config + crosstool-ng 185f348 packages/mingw-w64/v13.0.0/chksum; includes winpthreads.' },
];
async function hash(file) { const h = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) h.update(chunk); return h.digest('hex'); }
const receipt = { schema: 'dopi-ffmpeg-toolchain-source-materials/v1', generatedAt: new Date().toISOString(),
  limitation: 'Source archive checksums match the identified crosstool-ng commit and BtbN config. The original base-image digest is not published here, so this is not binary reproducibility proof.', sources: [], pending: [] };
async function main() {
  for (const row of rows) {
    try {
      const file = path.join(output, row.filename);
      if (!fs.existsSync(file)) {
        if (row.container) {
          const proc = spawn('tar.exe', ['-xOf', path.join(recipeRoot, row.container), '--', row.member], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
          const finished = new Promise((resolve, reject) => { proc.once('error', reject); proc.once('close', code => code === 0 ? resolve() : reject(Error('Source member extraction failed'))); });
          await Promise.all([pipeline(proc.stdout, fs.createWriteStream(file + '.partial')), finished]);
        } else {
          let done = false;
          for (const proxy of [false, true]) {
            const args = ['-4', ...(proxy ? ['--proxy', 'http://127.0.0.1:10808', '--noproxy', ''] : ['--noproxy', '*']),
              '--proto', '=https', '--proto-redir', '=https', '--fail', '--location', '--silent', '--show-error', '--connect-timeout', '30',
              '--max-time', '900', '--max-filesize', String(256 * 1024 ** 2), '--output', file + '.partial', row.url];
            const result = await new Promise(resolve => execFile('curl.exe', args, { windowsHide: true, maxBuffer: 1024 ** 2 }, (error, stdout, stderr) => resolve({ error, stderr })));
            if (result.error) { if (proxy) throw Error(String(result.stderr || result.error.message).slice(0, 300)); continue; }
            done = true; break;
          }
          if (!done) throw Error('Toolchain source transfer failed');
        }
        if (await hash(file + '.partial') !== row.sha256) throw Error('Toolchain source checksum mismatch');
        fs.renameSync(file + '.partial', file);
      }
      if (await hash(file) !== row.sha256) throw Error('Toolchain source checksum mismatch');
      execFileSync('tar.exe', ['-tf', file], { stdio: 'ignore', timeout: 120000 });
      receipt.sources.push({ ...row, size: fs.statSync(file).size, checksumVerifiedAgainstCrosstoolNG: true, status: 'source-archived' });
      console.log('TOOLCHAIN_SOURCE ' + row.component);
    } catch (error) { receipt.pending.push({ component: row.component, reason: error.message }); }
    fs.writeFileSync(path.join(output, 'ffmpeg-toolchain-source-materials.json'), JSON.stringify(receipt, null, 2) + '\n');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
