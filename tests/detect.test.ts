import { describe, it, expect, afterEach } from 'vitest';
import { makeProject, detectAt } from './helpers.js';
import { detect, loadDetectorFile } from '../src/detect/index.js';
import { Project } from '../src/util/project.js';

const cleanups: (() => void)[] = [];
const build = (files: Record<string, string>) => {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  return p.root;
};
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('detection', () => {
  it('detects a Next.js + Prisma + Postgres project', () => {
    const root = build({
      'package.json': JSON.stringify({
        name: 'app',
        dependencies: { next: '^15.0.0', react: '^19.0.0' },
        devDependencies: { typescript: '^5.7.0' },
      }),
      'next.config.ts': 'export default {};',
      'prisma/schema.prisma': 'datasource db { provider = "postgresql" }',
      'src/app/page.tsx': 'export default function Page() { return null; }',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('lang:typescript');
    expect(d.facts.flags).toContain('fw:next');
    expect(d.facts.flags).toContain('orm:prisma');
    expect(d.facts.flags).toContain('platform:web');
    expect(d.facts.flags).toContain('has:database');
  });

  it('detects Python / FastAPI', () => {
    const root = build({
      'pyproject.toml': '[project]\nname = "api"\n\n[tool.ruff]\nline-length = 100\n',
      'requirements.txt': 'fastapi==0.115.0\nuvicorn==0.30.0\n',
      'main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('lang:python');
    expect(d.facts.flags).toContain('fw:fastapi');
    expect(d.facts.flags).toContain('pm:pip');
  });

  it('detects Go', () => {
    const root = build({
      'go.mod': 'module example.com/api\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.9.1\n',
      'main.go': 'package main\nfunc main() {}\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('lang:go');
    expect(d.facts.flags).toContain('fw:gin');
    expect(d.facts.flags).toContain('pm:go-mod');
  });

  it('detects Solidity / Foundry', () => {
    const root = build({
      'foundry.toml': '[profile.default]\nsrc = "src"\n',
      'src/Vault.sol': 'pragma solidity ^0.8.20;\ncontract Vault {}\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('lang:solidity');
    expect(d.facts.flags).toContain('platform:evm');
    expect(d.facts.flags).toContain('project:blockchain');
  });

  it('detects an LLM/agent project', () => {
    const root = build({
      'package.json': JSON.stringify({ dependencies: { openai: '^4.0.0' } }),
      'AGENTS.md': '# agent instructions',
      'src/agent.ts': 'import { openai } from "./client";',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('ai:llm-sdk');
    expect(d.facts.flags).toContain('ai:agents');
  });

  it('does NOT detect a database from a README that mentions Postgres', () => {
    const root = build({
      'README.md': 'This project will eventually use postgres and mysql.',
      'src/index.ts': 'console.log("hi");',
    });
    const d = detectAt(root);
    expect(d.facts.flags.has('db:postgres')).toBe(false);
    expect(d.facts.flags.has('db:mysql')).toBe(false);
  });

  it('accepts asserted facts from config', () => {
    const root = build({ 'src/index.ts': 'console.log("hi");' });
    const d = detectAt(root, ['has:database']);
    expect(d.facts.flags).toContain('has:database');
  });

  it('resolves implies chains regardless of declaration order', () => {
    const root = build({
      'src/Vault.sol': 'pragma solidity ^0.8.20;\ncontract Vault {}\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('platform:evm');
    expect(d.facts.flags).toContain('project:blockchain'); // derived via implies
  });
});

describe('maturity classification', () => {
  it('classifies an empty repo as prototype', () => {
    const root = build({ 'src/index.ts': 'console.log("hi");' });
    expect(detectAt(root).maturity).toBe('prototype');
  });

  it('classifies a tested, CI-backed, tagged repo as production', () => {
    const root = build({
      'src/index.ts': 'export const x = 1;',
      'src/index.test.ts': 'it("works", () => {});',
      'CHANGELOG.md': '# Changelog',
      'SECURITY.md': '# Security',
      'CONTRIBUTING.md': '# Contributing',
      Dockerfile: 'FROM node:20\n',
      '.github/workflows/ci.yml': 'name: CI\non: push\njobs: {}\n',
    });
    // Simulate a long history and release tags, which need real git objects.
    const d = detectAt(root);
    const project = new Project(root);
    const fakeGit = {
      commits: 240,
      contributors: 6,
      tags: 12,
      branches: 3,
      daysSinceLastCommit: 2,
      isRepo: true,
    };
    const full = detect(project, loadDetectorFile('rules'), fakeGit as any, []);
    expect(full.maturity).toBe('production');
    expect(d.maturity).not.toBe('production'); // without the git facts, it is younger
  });

  it('classifies an abandoned repo as legacy', () => {
    const root = build({ 'src/index.ts': 'x', 'src/index.test.ts': 'x' });
    const project = new Project(root);
    const full = detect(
      project,
      loadDetectorFile('rules'),
      {
        commits: 100,
        contributors: 2,
        tags: 1,
        branches: 1,
        daysSinceLastCommit: 700,
        isRepo: true,
      } as any,
      [],
    );
    expect(full.maturity).toBe('legacy');
  });
});
