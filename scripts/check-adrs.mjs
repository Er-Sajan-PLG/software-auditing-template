/**
 * ADR hygiene gate (see ADR-0001 and docs/adr/README.md).
 *
 * Fails when:
 * - ADR filenames are not sequential `NNNN-slug.md` from 0001 (no gaps),
 * - a file's `# N. Title` number does not match its filename,
 * - a file lacks `- **Date:**` or `- **Status:**`,
 * - the README index misses a file, or links one that does not exist.
 *
 * Usage: `node scripts/check-adrs.mjs` (exit 1 on any violation).
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.cwd(), 'docs/adr');
const failures = [];

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .sort();

const nums = files.map((f) => {
  const m = /^(\d{4})-.+\.md$/.exec(f);
  if (!m) failures.push(`${f}: filename must be NNNN-slug.md`);
  return m ? Number(m[1]) : NaN;
});
nums.forEach((n, i) => {
  if (Number.isNaN(n)) return;
  if (n !== i + 1)
    failures.push(
      `${files[i]}: expected number ${String(i + 1).padStart(4, '0')} (gap or misorder)`,
    );
});

for (const f of files) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  const num = /^(\d{4})-/.exec(f)?.[1];
  const title = /^#\s+(\d+)\.\s+.+/m.exec(text)?.[1];
  if (title !== undefined && num !== undefined && title.padStart(4, '0') !== num) {
    failures.push(`${f}: title number ${title} does not match filename ${num}`);
  }
  if (!/^- \*\*Date:\*\*/m.test(text)) failures.push(`${f}: missing "- **Date:**"`);
  if (!/^- \*\*Status:\*\*/m.test(text)) failures.push(`${f}: missing "- **Status:**"`);
}

const index = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
for (const f of files) {
  const num = f.slice(0, 4);
  if (!index.includes(num)) failures.push(`README.md index is missing ADR ${num} (${f})`);
}
for (const m of index.matchAll(/\[ADR-(\d{4})\]\((\d{4})-[^)]+\)/g)) {
  if (m[1] !== m[2]) failures.push(`README.md index link text/label mismatch: ${m[0]}`);
  if (!files.includes(`${m[2]}-`) && !files.some((f) => f.startsWith(`${m[2]}-`))) {
    failures.push(`README.md index links missing file for ADR ${m[2]}`);
  }
}

if (failures.length > 0) {
  console.error(`ADR hygiene: ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`ADR hygiene: OK (${files.length} records, index complete)`);
