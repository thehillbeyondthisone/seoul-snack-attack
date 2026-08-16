import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const EXTENSIONS = new Set(['.js', '.mjs', '.json', '.html', '.md', '.css']);
const SKIP = new Set(['node_modules', 'dist', '.git', '.claude']);
const MOJIBAKE = /(?:Ã.|Â.|â(?:€|™|œ|ž|€“|€”|†|‡|€¦)|ì[\x80-\xBF]|ë[\x80-\xBF]|ê[\x80-\xBF]|í[\x80-\xBF]|�)/u;
const failures = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      if (entry.name === 'encoding-check.mjs') continue;
      const text = fs.readFileSync(file, 'utf8');
      if (MOJIBAKE.test(text)) failures.push(path.relative(ROOT, file));
    }
  }
}

visit(ROOT);
if (failures.length) {
  console.error(`FAIL  probable UTF-8 mojibake in:\n${failures.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('PASS  documentation and UI text are valid UTF-8 without common mojibake');
