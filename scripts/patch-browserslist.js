/**
 * Patches the hardcoded baseline-browser-mapping warning in Next.js's
 * bundled browserslist module. The warning has no env-var guard and fires
 * on every worker during build when the bundled data is >2 months old.
 *
 * Run automatically via the "postinstall" script in package.json.
 */
const fs = require('fs');
const path = require('path');

const pnpmDir = path.join(__dirname, '..', 'node_modules', '.pnpm');

let files = [];
try {
  const entries = fs.readdirSync(pnpmDir);
  for (const entry of entries) {
    if (entry.startsWith('next@')) {
      const candidate = path.join(
        pnpmDir,
        entry,
        'node_modules',
        'next',
        'dist',
        'compiled',
        'browserslist',
        'index.js'
      );
      if (fs.existsSync(candidate)) {
        files.push(candidate);
      }
    }
  }
} catch {
  // node_modules not yet populated
  process.exit(0);
}

if (files.length === 0) {
  process.exit(0);
}

const re =
  /\d{13}<\(new Date\)\.setMonth\(\(new Date\)\.getMonth\(\)-2\)&&console\.warn\("[^"]*baseline-browser-mapping[^"]*"\)/g;

let patched = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (re.test(content)) {
    re.lastIndex = 0;
    content = content.replace(re, '!1');
    fs.writeFileSync(file, content);
    patched++;
  }
}

if (patched > 0) {
  console.log(
    `[patch-browserslist] Suppressed baseline-browser-mapping warning in ${patched} file(s).`
  );
}
