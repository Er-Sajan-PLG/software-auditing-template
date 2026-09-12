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
    expect(d.facts.flags).toContain('project:blockchain');
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
    expect(d.maturity).not.toBe('production');
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

describe('implies chains resolve regardless of order and length', () => {
  it('resolves a 4-link chain declared worst-first', () => {
    const root = build({ 'marker.txt': 'x\n' });
    const project = new Project(root);
    const chain = [
      { fact: 'base', category: 't', title: 'b', match: { any_file: ['marker.txt'] } },
      { fact: 'A', category: 't', title: 'a', implies: ['base'] },
      { fact: 'B', category: 't', title: 'b', implies: ['A'] },
      { fact: 'C', category: 't', title: 'c', implies: ['B'] },
      { fact: 'D', category: 't', title: 'd', implies: ['C'] },
    ];
    const out = detect(project, [...chain].reverse(), project.gitInfo(), []);
    for (const f of ['base', 'A', 'B', 'C', 'D']) {
      expect(out.facts.flags).toContain(f);
    }
  });
});

describe('manifest matching precision', () => {
  function matchedWith(detectors: never[], files: Record<string, string>, fact: string): boolean {
    const root = build(files);
    const project = new Project(root);
    const out = detect(project, detectors, project.gitInfo(), []);
    return out.facts.flags.has(fact);
  }

  it('does not match a leaf inside a longer word', () => {
    const detectors = [
      {
        fact: 'x:test',
        category: 't',
        title: 't',
        match: { manifest: { file: 'config.toml', key: 'tool.test', contains: 'x' } },
      },
    ];
    expect(
      matchedWith(detectors as never[], { 'config.toml': '[tool]\nlatest = "x"\n' }, 'x:test'),
    ).toBe(false);
    expect(
      matchedWith(detectors as never[], { 'config.toml': '[tool]\ntest = "x"\n' }, 'x:test'),
    ).toBe(true);
  });

  it('matches sections by full segment, case-insensitively', () => {
    const detectors = [
      {
        fact: 'x:deps',
        category: 't',
        title: 't',
        match: { manifest: { file: 'pyproject.toml', key: 'dependencies.django' } },
      },
    ];
    expect(
      matchedWith(
        detectors as never[],
        { 'pyproject.toml': '[dev-dependencies]\ndjango = "^5"\n' },
        'x:deps',
      ),
    ).toBe(false);
  });

  it('does not satisfy a dotted JSON key from a root-level coincidence', () => {
    const detectors = [
      {
        fact: 'x:thing',
        category: 't',
        title: 't',
        match: { manifest: { file: 'data.json', key: 'a.b.c' } },
      },
    ];
    expect(matchedWith(detectors as never[], { 'data.json': '{"c": true}' }, 'x:thing')).toBe(
      false,
    );
    expect(
      matchedWith(detectors as never[], { 'data.json': '{"a": {"b": {"c": true}}}' }, 'x:thing'),
    ).toBe(true);
  });
});

describe('framework facts imply their platform', () => {
  it('a bare Express app is a server (no Dockerfile needed)', () => {
    const root = build({
      'package.json': JSON.stringify({ dependencies: { express: '^4.0.0' } }),
      'index.js': 'const express = require("express");\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('fw:express');
    expect(d.facts.flags).toContain('platform:server');
  });

  it('a frontend-only app is not a server', () => {
    const root = build({
      'package.json': JSON.stringify({ dependencies: { react: '^19.0.0' } }),
      'src/app.jsx': 'export default function App() { return null; }\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('fw:react');
    expect(d.facts.flags).not.toContain('platform:server');
  });
});

describe('swift ecosystem detection (graduated from bootstrap proof)', () => {
  const vapidPkg = (extra: Record<string, string> = {}) => ({
    'Package.swift': [
      '// swift-tools-version: 5.9',
      'import PackageDescription',
      'let package = Package(',
      '    name: "vapor-test",',
      '    dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.0.0")],',
      ...Object.values(extra),
      ')',
    ].join('\n'),
  });

  it('detects vapor framework and server platform', () => {
    const root = build({
      ...vapidPkg(),
      'Sources/App/routes.swift': 'import Vapor\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('fw:vapor');
    expect(d.facts.flags).toContain('platform:server');
  });

  it('detects executable targets, absent in pure libraries', () => {
    const app = build({
      ...vapidPkg({ exe: '    targets: [.executableTarget(name: "App")],' }),
      'Sources/App/main.swift': 'print("hi")\n',
    });
    expect(detectAt(app).facts.flags).toContain('swift:executable');

    const lib = build({
      ...vapidPkg(),
      'Sources/Lib/lib.swift': 'public func f() {}\n',
    });
    expect(detectAt(lib).facts.flags).not.toContain('swift:executable');
  });

  it('detects swift-validation presence', () => {
    const root = build({
      'Sources/App/Models/User.swift':
        'import Vapor\nstruct User: Validatable {\n  static func validations(_ validations: inout Validations) {}\n}\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('has:swift-validation');
  });

  it('detects swift-security-headers presence', () => {
    const root = build({
      'Sources/App/Middleware.swift': 'import Vapor\napp.middleware.use(CORSMiddleware())\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).toContain('has:swift-security-headers');
  });

  it('does not detect swift-validation without Validatable', () => {
    const root = build({
      'Sources/App/Models/User.swift': 'struct User {\n  let name: String\n}\n',
    });
    const d = detectAt(root);
    expect(d.facts.flags).not.toContain('has:swift-validation');
  });
});
