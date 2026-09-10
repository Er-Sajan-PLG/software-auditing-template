#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditReport, Depth, Maturity, Rule, Severity } from './types.js';
import { runAudit } from './engine/audit.js';
import { loadRulePacks } from './engine/loader.js';
import { loadDetectorFile } from './detect/index.js';
import { Project } from './util/project.js';
import { detect } from './detect/index.js';
import { renderMarkdown, parseTrailer } from './report/markdown.js';
import { diffReports } from './engine/diff.js';
import { bootstrapPacks, writeBootstrapPacks } from './bootstrap/index.js';
import { EXAMPLE_CONFIG, loadConfig } from './config.js';
import { evaluateGate } from './engine/gate.js';
import { learnFromReport, renderSuggestions, type LearnOptions } from './learn/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RULES_DIR = path.resolve(HERE, '..', 'rules');
const VERSION = readVersion();

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FUTURE'];
const DEPTHS: Depth[] = ['quick', 'standard', 'deep'];
const MATURITIES: Maturity[] = ['prototype', 'mvp', 'beta', 'production', 'legacy'];

/* ------------------------------------------------------------------- args -- */

interface Args {
  _: string[];
  [k: string]: string | boolean | string[] | undefined;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (!tok.startsWith('--')) {
      args._.push(tok);
      continue;
    }
    const body = tok.slice(2);
    if (body.includes('=')) {
      const [k, ...rest] = body.split('=');
      args[k!] = rest.join('=');
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[body] = true;
    } else {
      args[body] = next;
      i++;
    }
  }
  return args;
}

function str(args: Args, key: string, fallback?: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : fallback;
}
function bool(args: Args, key: string): boolean {
  return args[key] === true || args[key] === 'true';
}
function list(args: Args, key: string): string[] {
  const v = args[key];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string')
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

/* -------------------------------------------------------------------- main -- */

const COMMANDS: Record<string, (args: Args) => number> = {
  audit: cmdAudit,
  detect: cmdDetect,
  rules: cmdRules,
  explain: cmdExplain,
  diff: cmdDiff,
  init: cmdInit,
  bootstrap: cmdBootstrap,
  learn: cmdLearn,
};

export function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (bool(args, 'help')) {
    console.log(HELP);
    return 0;
  }
  if (bool(args, 'version')) {
    console.log(`usa ${VERSION}`);
    return 0;
  }
  const cmd = (args._[0] ?? 'audit') as string;

  const run = COMMANDS[cmd];
  if (run) return run(args);
  switch (cmd) {
    case 'version':
    case '--version':
      console.log(`usa ${VERSION}`);
      return 0;
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.error(HELP);
      return 2;
  }
}

/* ------------------------------------------------------------------ audit -- */

interface AuditCliOptions {
  target: string;
  rulesDir: string;
  depth: Depth;
  profileArg: string;
  out: string;
  failOn: string;
  quiet: boolean;
  maxFiles?: number;
  maxBytes?: number;
}

function parseCountFlag(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function readAuditOptions(args: Args): AuditCliOptions {
  return {
    target: (args._[1] as string | undefined) ?? '.',
    rulesDir: path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR),
    depth: (str(args, 'depth', 'standard') as Depth) ?? 'standard',
    profileArg: str(args, 'profile', 'auto') ?? 'auto',
    out: str(args, 'out', 'AUDIT.md') ?? 'AUDIT.md',
    failOn: (str(args, 'fail-on', 'none') ?? 'none').toLowerCase(),
    quiet: bool(args, 'quiet'),
    maxFiles: parseCountFlag(str(args, 'max-files')),
    maxBytes: parseCountFlag(str(args, 'max-bytes')),
  };
}

function validateAuditOptions(o: AuditCliOptions): string | null {
  if (!DEPTHS.includes(o.depth)) return `--depth must be one of ${DEPTHS.join('|')}`;
  if (o.profileArg !== 'auto' && !MATURITIES.includes(o.profileArg as Maturity)) {
    return `--profile must be auto or one of ${MATURITIES.join('|')}`;
  }
  if (o.maxFiles !== undefined && !(o.maxFiles > 0)) return '--max-files must be a positive number';
  if (o.maxBytes !== undefined && !(o.maxBytes > 0)) return '--max-bytes must be a positive number';
  return null;
}

function cmdAudit(args: Args): number {
  const o = readAuditOptions(args);
  const invalid = validateAuditOptions(o);
  if (invalid) {
    console.error(invalid);
    return 2;
  }

  if (!fs.existsSync(o.target)) {
    console.error(`Target path does not exist: ${o.target}`);
    return 2;
  }

  let config;
  try {
    config = loadConfig(o.target, str(args, 'config'));
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  if (config.facts) config.facts = [...config.facts, ...list(args, 'fact')];

  const { report, warnings, profile } = runAudit({
    target: o.target,
    rulesDir: o.rulesDir,
    depth: o.depth,
    profile: o.profileArg as Maturity | 'auto',
    config,
    allowCommands: bool(args, 'allow-commands'),
    usaVersion: VERSION,
    includePacks: list(args, 'include'),
    excludePacks: list(args, 'exclude'),
    maxFiles: o.maxFiles,
    maxBytes: o.maxBytes,
  });

  for (const w of warnings) console.error(`warning: ${w}`);

  const markdown = renderMarkdown(report, profile);
  fs.writeFileSync(o.out, markdown, 'utf8');

  if (!o.quiet) {
    console.log(summaryLine(report));
    console.log(`  report → ${o.out}`);
  }

  return evaluateGate(report, o.failOn, o.quiet);
}

function summaryLine(report: AuditReport): string {
  const s = report.score.severityCounts;
  const parts = SEVERITY_ORDER.filter((k) => s[k] > 0)
    .map((k) => `${k.toLowerCase()} ${s[k]}`)
    .join(' · ');
  return (
    `usa ${report.score.overall}/100 (${report.detection.maturity}) — ` +
    `${report.score.counts.PASS} passed, ` +
    (parts ? `open: ${parts}` : 'no open findings') +
    `, ${report.score.counts.UNKNOWN} to review` +
    ` (${report.score.automationCoverage}% verified automatically)`
  );
}

/* ----------------------------------------------------------------- detect -- */

function cmdDetect(args: Args): number {
  const target = (args._[1] as string | undefined) ?? '.';
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const config = loadConfig(target, str(args, 'config'));
  const project = new Project(target, config.ignore ?? []);
  const git = project.gitInfo();
  const detection = detect(project, loadDetectorFile(rulesDir), git, [
    ...list(args, 'fact'),
    ...(config.facts ?? []),
  ]);
  const grouped = groupFlagsByNamespace(detection.facts.flags);
  console.log(`# Detection: ${path.resolve(target)}`);
  console.log();
  console.log(`maturity: ${detection.maturity}`);
  for (const [ns, values] of [...grouped.entries()].sort()) {
    console.log(`${ns}: ${[...new Set(values)].sort().join(', ')}`);
  }
  console.log();
  console.log('metrics:');
  for (const [k, v] of Object.entries(detection.facts.metrics)) console.log(`  ${k}: ${v}`);
  console.log();
  console.log('maturity signals:');
  for (const s of detection.maturitySignals) console.log(`  ${s}`);
  return 0;
}

function groupFlagsByNamespace(flags: Iterable<string>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const f of flags) {
    const [ns, value] = f.split(':');
    const key = value === undefined ? 'other' : ns!;
    const list2 = grouped.get(key) ?? [];
    list2.push(value === undefined ? f : value);
    grouped.set(key, list2);
  }
  return grouped;
}

/* ------------------------------------------------------------------ rules -- */

function cmdRules(args: Args): number {
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const { packs } = loadRulePacks(rulesDir);
  const filter = str(args, 'section');
  let total = 0;
  for (const pack of packs) {
    const rules = filter ? pack.rules.filter((r) => r.section === filter) : pack.rules;
    if (filter && rules.length === 0) continue;
    console.log(`\n## ${pack.id} — ${pack.title} (${rules.length} rules)`);
    if (pack.description) console.log(`   ${pack.description}`);
    for (const r of rules) {
      total++;
      console.log(
        `   ${r.id.padEnd(10)} ${r.severity.padEnd(8)} ${r.ruleClass.padEnd(16)} ${r.title}`,
      );
    }
  }
  console.log(`\n${total} rule(s) across ${packs.length} pack(s).`);
  return 0;
}

/* ---------------------------------------------------------------- explain -- */

function cmdExplain(args: Args): number {
  const id = args._[1] as string | undefined;
  if (!id) {
    console.error('Usage: usa explain <RULE-ID>');
    return 2;
  }
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const { packs } = loadRulePacks(rulesDir);
  for (const pack of packs) {
    const rule = pack.rules.find((r) => r.id.toLowerCase() === id.toLowerCase());
    if (!rule) continue;
    printRuleDetail(pack.id, rule);
    return 0;
  }
  console.error(`Rule not found: ${id}`);
  return 1;
}

function printRuleDetail(packId: string, rule: Rule): void {
  console.log(`# ${rule.id} — ${rule.title}`);
  console.log();
  console.log(`pack      : ${packId}`);
  console.log(`section   : ${rule.section} ${rule.sectionTitle ?? ''}`);
  console.log(`severity  : ${rule.severity} (when violated)`);
  console.log(`class     : ${rule.ruleClass}`);
  console.log(`weight    : ${rule.weight ?? 'default'}`);
  console.log(`depths    : ${rule.depths?.join(', ') ?? 'all'}`);
  console.log(`check     : ${JSON.stringify(rule.check)}`);
  printRuleOptional(rule);
}

function printRuleOptional(rule: Rule): void {
  if (rule.appliesWhen) console.log(`applies   : ${JSON.stringify(rule.appliesWhen)}`);
  if (rule.why) console.log(`\nwhy:\n  ${rule.why}`);
  if (rule.evidence) console.log(`\nevidence:\n  ${rule.evidence}`);
  if (rule.remediation) console.log(`\nfix:\n  ${rule.remediation}`);
  if (rule.references?.length) console.log(`\nreferences:\n  ${rule.references.join('\n  ')}`);
}

/* ------------------------------------------------------------------- diff -- */

function cmdDiff(args: Args): number {
  const beforePath = args._[1] as string | undefined;
  const afterPath = args._[2] as string | undefined;
  if (!beforePath || !afterPath) {
    console.error('Usage: usa diff <before.md> <after.md> [--out DIFF.md]');
    return 2;
  }
  const readTrailer = (file: string) => {
    const text = fs.readFileSync(file, 'utf8');
    return parseTrailer(text) ?? text; // tolerate a raw YAML trailer file
  };
  try {
    const md = diffReports(readTrailer(beforePath), readTrailer(afterPath));
    const out = str(args, 'out');
    if (out) fs.writeFileSync(out, md, 'utf8');
    console.log(md);
    return 0;
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
}

/* -------------------------------------------------------------- bootstrap -- */

function cmdBootstrap(args: Args): number {
  const target = (args._[1] as string | undefined) ?? '.';
  const rulesDir = path.resolve(str(args, 'rules-dir', DEFAULT_RULES_DIR) ?? DEFAULT_RULES_DIR);
  const config = loadConfig(target, str(args, 'config'));
  const project = new Project(target, config.ignore ?? []);
  const git = project.gitInfo();
  const detection = detect(project, loadDetectorFile(rulesDir), git, [
    ...list(args, 'fact'),
    ...(config.facts ?? []),
  ]);
  const outcome = bootstrapPacks(detection.facts);
  if (outcome.packs.length === 0) {
    console.log('No uncovered stacks: every detected language already has a pack.');
    return 0;
  }
  const out = str(args, 'out');
  if (!out) {
    printBootstrap(outcome);
    return 0;
  }
  try {
    writeBootstrapPacks(outcome, out);
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  console.log(`wrote ${outcome.packs.length} pack(s) to ${out}`);
  for (const note of outcome.notes) console.log(`- ${note}`);
  return 0;
}

function printBootstrap(outcome: ReturnType<typeof bootstrapPacks>): void {
  for (const pack of outcome.packs) {
    console.log(`--- ${pack.filename} ---`);
    console.log(pack.yaml);
  }
  for (const note of outcome.notes) console.log(`- ${note}`);
}

/* ------------------------------------------------------------------- init -- */

function cmdInit(args: Args): number {
  const target = (args._[1] as string | undefined) ?? '.';
  fs.mkdirSync(target, { recursive: true });
  const configPath = path.join(target, '.usa.yaml');
  if (fs.existsSync(configPath)) {
    console.error(`${configPath} already exists — leaving it alone.`);
  } else {
    fs.writeFileSync(configPath, EXAMPLE_CONFIG, 'utf8');
    console.log(`created ${configPath}`);
  }
  const workflowDir = path.join(target, '.github', 'workflows');
  const workflowPath = path.join(workflowDir, 'usa.yml');
  if (fs.existsSync(workflowPath)) {
    console.error(`${workflowPath} already exists — leaving it alone.`);
  } else {
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(workflowPath, WORKFLOW_TEMPLATE, 'utf8');
    console.log(`created ${workflowPath}`);
  }
  console.log('\nNext: run `npx usa audit .` or `usa audit . --depth standard`.');
  return 0;
}

/* ------------------------------------------------------------------ learn -- */

function cmdLearn(args: Args): number {
  const reportPath = args._[1] as string | undefined;
  if (!reportPath) {
    console.error('Usage: usa learn <report.md> [--out <file>] [--min-severity MEDIUM]');
    return 2;
  }
  if (!fs.existsSync(reportPath)) {
    console.error(`Report file not found: ${reportPath}`);
    return 2;
  }
  const outFile = str(args, 'out', 'learn-suggestions.yaml') ?? 'learn-suggestions.yaml';
  const minSeverity = (str(args, 'min-severity', 'MEDIUM') ?? 'MEDIUM').toUpperCase() as
    'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'FUTURE';
  const allowed = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FUTURE'];
  if (!allowed.includes(minSeverity)) {
    console.error(`--min-severity must be one of: ${allowed.join(', ')}`);
    return 2;
  }
  const options: LearnOptions = { reportPath, out: outFile, minSeverity };
  try {
    const suggestions = learnFromReport(options);
    if (suggestions.length === 0) {
      console.log(`No actionable suggestions found in ${reportPath}.`);
      return 0;
    }
    const yaml = renderSuggestions(suggestions);
    fs.writeFileSync(outFile, yaml, 'utf8');
    console.log(`Wrote ${suggestions.length} suggestion(s) to ${outFile}`);
    console.log('  Review the rules, test them, then register in rules/index.yaml.');
    return 0;
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
}

/* ------------------------------------------------------------------ utils -- */

function readVersion(): string {
  const candidates = [
    path.resolve(HERE, '..', 'package.json'),
    path.resolve(HERE, '..', '..', 'package.json'),
  ];
  for (const c of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(c, 'utf8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      /* fall through */
    }
  }
  return '0.0.0';
}

const HELP = `
usa — Universal Software Auditor

  usa audit [path]              Audit a project and write a Markdown report
  usa detect [path]             Print the auto-detected facts and maturity
  usa rules [--section S2]      List all loaded rule packs and rules
  usa explain <RULE-ID>         Show everything about one rule
  usa diff <before> <after>     Compare two previously generated reports
  usa init [path]               Scaffold .usa.yaml + a GitHub Actions workflow
  usa bootstrap [path]          Propose rule packs for stacks USA cannot audit yet
  usa learn <report.md>         Generate suggested rules from audit findings

learn options
  --out <file>        Output YAML file (default learn-suggestions.yaml)
  --min-severity <s>  Minimum severity to consider (CRITICAL|HIGH|MEDIUM|LOW|FUTURE, default MEDIUM)

audit options
  --out <file>        Report path (default AUDIT.md)
  --depth <level>     quick | standard | deep          (default standard)
  --profile <stage>   auto | prototype | mvp | beta | production | legacy
  --rules-dir <dir>   Rule pack directory             (default bundled rules/)
  --config <file>     Explicit .usa.yaml location
  --include <packs>   Force these packs on (comma separated)
  --exclude <packs>   Force these packs off
  --fact <ns:value>   Assert a fact detection missed, e.g. --fact has:database
  --allow-commands    Run \`command:\` checks (shells out; off by default)
  --fail-on <sev>     Exit 1 on findings >= sev: critical|high|medium|low|none
  --quiet             Only errors
  --max-files <n>     Index at most n files (overrides config; default 60000)
  --max-bytes <n>     Skip files larger than n bytes (overrides config; default 2 MiB)

bootstrap options
  --out <file|dir>    Write pack files instead of printing (default: print)

examples
  usa audit . --depth deep
  usa bootstrap ~/code/legacy-php-app --out /tmp/packs
  usa audit ../api --profile production --fail-on high
  usa audit . --out reports/audit-$(date +%F).md
  usa learn AUDIT.md --out swift-suggestions.yaml
`.trim();

const WORKFLOW_TEMPLATE = `# USA — Universal Software Auditor
# Runs on every PR and pushes a Markdown summary you can read in the Actions UI.
name: USA Audit

on:
  pull_request:
  push:
    branches: [master]
  workflow_dispatch:
    inputs:
      depth:
        description: Audit depth
        required: false
        default: standard
        type: choice
        options: [quick, standard, deep]

permissions:
  contents: read
`;

// ---- main entry point ----
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
