import type { RulePack } from '../src/types.js';
import { capabilityFromPack } from '../src/evolution/capability.js';
import type { BenchmarkCase, Capability } from '../src/evolution/types.js';

/**
 * A realistic candidate capability for the demo language (Lua): a `data`
 * capability that detects dynamic code / shell execution — a class of bug USA
 * does not ship a pack for today (Lua is detected but has no stack pack).
 */
export function luaCandidatePack(): RulePack {
  return {
    id: 'stacks/lua',
    title: 'Lua',
    section: 'S15',
    sectionTitle: 'Platform-Specific',
    description: 'Candidate capability: detect unsafe dynamic/shell execution in Lua.',
    version: '0.1.0',
    skipWhen: { all: [{ fact: 'lang:lua', op: 'absent' }] },
    rules: [
      {
        id: 'LUA-001',
        title: 'No dynamic code or shell execution',
        section: 'S15',
        sectionTitle: 'Platform-Specific',
        severity: 'HIGH',
        ruleClass: 'security',
        check: {
          kind: 'grep_wrong',
          pattern: '(os\\.execute|loadstring|load)\\s*\\(',
          include: ['**/*.lua'],
        },
        why: 'os.execute/loadstring/load run attacker-controlled strings as code.',
        remediation: 'Restrict dynamic code to allow-listed, non-user-controlled inputs.',
        references: ['CWE-95', 'CWE-78'],
      },
    ],
  };
}

export function luaCandidate(): Capability {
  return capabilityFromPack(luaCandidatePack(), {
    version: '0.1.0',
    createdBy: 'test',
    languages: ['lua'],
  });
}

export function luaBenchmarkCases(): BenchmarkCase[] {
  return [
    {
      id: 'lua-positive',
      kind: 'known-positive',
      description: 'Lua file that executes a shell command from user input.',
      fixture: { 'app.lua': 'local r = os.execute("rm -rf " .. user_path)\n' },
      expected: [{ ruleId: 'LUA-001', status: 'WRONG' }],
    },
    {
      id: 'lua-negative',
      kind: 'known-negative',
      description: 'Clean Lua file with no dynamic execution.',
      fixture: { 'app.lua': 'print("hello world")\n' },
      expected: [{ ruleId: 'LUA-001', status: 'PASS' }],
    },
    {
      id: 'lua-regression',
      kind: 'regression',
      description: 'Clean Lua file — the candidate must not disturb existing rules.',
      fixture: { 'app.lua': 'local x = 1\nreturn x\n' },
      expected: [{ ruleId: 'LUA-001', status: 'PASS' }],
    },
  ];
}

/** A candidate whose rule matches nothing — guaranteed to miss the positive. */
export function brokenCandidate(): Capability {
  return capabilityFromPack(
    {
      id: 'stacks/lua',
      title: 'Lua',
      skipWhen: { all: [{ fact: 'lang:lua', op: 'absent' }] },
      rules: [
        {
          id: 'LUA-999',
          title: 'Matches nothing',
          section: 'S15',
          severity: 'HIGH',
          ruleClass: 'security',
          check: { kind: 'grep_wrong', pattern: 'zzzzzz_nomatch', include: ['**/*.lua'] },
        },
      ],
    },
    { version: '0.1.0', createdBy: 'test' },
  );
}
