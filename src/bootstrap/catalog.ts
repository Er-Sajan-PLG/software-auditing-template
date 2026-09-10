import type { RuleClass, Severity } from '../types.js';

/**
 * Bootstrap knowledge: starter checks for languages USA detects but ships
 * no stack pack for. Every entry is a *proposal*, never a verdict — the
 * generator emits packs for human review, and nothing it writes is
 * registered or trusted until reviewed (see ADR-0012).
 *
 * Curation bar for inclusion here: the pattern must be dangerous wherever
 * it appears (not merely smelly), with a false-positive rate low enough
 * that a first run does not teach the user to ignore the tool. Presence
 * checks ("is X used?") are excluded on purpose — without applicability
 * facts they punish projects that simply have no passwords/sessions.
 */

export interface BootstrapCheck {
  id: string;
  title: string;
  severity: Severity;
  ruleClass: RuleClass;
  kind:
    'grep_wrong' | 'grep_absent' | 'grep_present' | 'grep_deprecated' | 'file_exists' | 'manual';
  pattern?: string;
  include?: string[];
  exclude?: string[];
  files?: string[];
  why: string;
  remediation: string;
  evidence?: string;
  references?: string[];
}

export interface BootstrapLang {
  /** e.g. 'php' — matches the `lang:` fact suffix. */
  lang: string;
  /** e.g. 'stacks/php' — the pack id the generated file will carry. */
  packId: string;
  title: string;
  description: string;
  /** Framework facts worth adding detectors for next (printed, not applied). */
  frameworkHints: string[];
  checks: BootstrapCheck[];
}

const TEST_EXCLUDES = ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**'];

/**
 * Graduated languages are REMOVED here, not left to rot: swift shipped as
 * stacks/swift.yaml (proven on vapor/vapor) and is covered below. A catalog
 * entry proposing what the registry already enforces would fork the truth.
 */
export const BOOTSTRAP_CATALOG: BootstrapLang[] = [
  {
    lang: 'php',
    packId: 'stacks/php',
    title: 'PHP',
    description:
      'Starter checks for PHP projects. Generated — review every pattern before trusting.',
    frameworkHints: [
      'laravel (composer.json: laravel/framework), symfony (symfony/http-kernel), wordpress (wp-load.php)',
    ],
    checks: [
      {
        id: 'PHP-001',
        title: 'No dynamic code execution',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: '(eval\\s*\\(|assert\\s*\\(\\s*["\']|create_function\\s*\\()',
        include: ['**/*.php'],
        exclude: [...TEST_EXCLUDES],
        why: 'eval() and string assert() execute arbitrary code; create_function() is removed in PHP 8 and fatal when called.',
        remediation:
          'Use closures or a dispatch table instead of eval; replace create_function with anonymous functions.',
        references: ['CWE-95'],
      },
      {
        id: 'PHP-002',
        title: 'No shell execution from application code',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: '(shell_exec\\s*\\(|passthru\\s*\\(|popen\\s*\\(|proc_open\\s*\\()',
        include: ['**/*.php'],
        exclude: [...TEST_EXCLUDES],
        why: 'Shelling out with composed strings is command injection waiting for input.',
        remediation:
          'Use PHP-native APIs (filesystem, process control with argument arrays). If unavoidable, escapeshellarg every argument.',
        references: ['CWE-78'],
      },
      {
        id: 'PHP-003',
        title: 'No unsafe unserialize()',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: 'unserialize\\s*\\(',
        include: ['**/*.php'],
        exclude: [...TEST_EXCLUDES],
        why: 'unserialize() on untrusted data is PHP object injection. Verify the source is never user-controlled.',
        remediation:
          'Prefer json_decode with assoc arrays; pass allowed_classes: false where unserialize is unavoidable.',
        references: ['CWE-502'],
      },
      {
        id: 'PHP-004',
        title: 'No extract() over superglobals',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: 'extract\\s*\\(\\s*\\$_(GET|POST|REQUEST|COOKIE)',
        include: ['**/*.php'],
        exclude: [...TEST_EXCLUDES],
        why: 'extract() over request data lets callers overwrite any in-scope variable, including guards.',
        remediation:
          'Read explicit keys from the superglobal instead of importing the whole array.',
        references: ['CWE-915'],
      },
      {
        id: 'PHP-005',
        title: 'Dependencies are locked',
        severity: 'MEDIUM',
        ruleClass: 'supply-chain',
        kind: 'file_exists',
        files: ['composer.lock'],
        why: 'An unlocked composer.json installs whatever is newest at deploy time — unreviewed code in production.',
        remediation: 'Commit composer.lock and install with --no-dev --optimize-autoloader in CI.',
        references: ['CWE-829'],
      },
      {
        id: 'PHP-006',
        title: 'Authentication and session handling reviewed',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'manual',
        why: 'No pattern can confirm passwords are hashed, sessions rotate, and cookies are HttpOnly + Secure + SameSite.',
        remediation:
          'Verify password_hash/password_verify, session_regenerate_id on login, and cookie flags.',
        evidence: 'Login handler file:line, hashing call, session cookie attributes.',
        references: ['ASVS-2.4.1', 'ASVS-3.2.2'],
      },
    ],
  },
  {
    lang: 'ruby',
    packId: 'stacks/ruby',
    title: 'Ruby',
    description:
      'Starter checks for Ruby projects. Generated — review every pattern before trusting.',
    frameworkHints: ['rails (Gemfile: rails, config/application.rb)', 'sinatra (sinatra gem)'],
    checks: [
      {
        id: 'RB-001',
        title: 'No dynamic code or shell execution',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: '(`|eval\\s*\\(|exec\\s*\\(|system\\s*\\()',
        include: ['**/*.rb'],
        exclude: [...TEST_EXCLUDES],
        why: 'Backticks, eval, exec, and system with composed strings are code and command injection.',
        remediation: 'Use Open3 with argument arrays; replace eval with data-driven dispatch.',
        references: ['CWE-95', 'CWE-78'],
      },
      {
        id: 'RB-002',
        title: 'No unsafe deserialization',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: '(YAML\\.load\\s*\\(|Marshal\\.load\\s*\\(|Oj\\.load\\s*\\()',
        include: ['**/*.rb'],
        exclude: [...TEST_EXCLUDES],
        why: 'YAML.load/Marshal.load instantiate arbitraryRuby objects. Verify trusted source or switch to safe_load with permitted classes.',
        remediation: 'Use YAML.safe_load (allowlisted classes) and Oj.strict / Oj.safe modes.',
        references: ['CWE-502'],
      },
      {
        id: 'RB-003',
        title: 'No interpolated SQL',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: '(execute\\s*\\(.*#\\{|find_by_sql\\s*\\(.*#\\{|where\\s*\\(["\'].*#\\{)',
        include: ['**/*.rb'],
        exclude: [...TEST_EXCLUDES, '**/db/migrate/**', '**/db/schema.rb'],
        why: '#{} inside a SQL string interpolates before the driver sees it — parameterisation never happens.',
        remediation:
          'Use bound parameters (where(id: x), exec_query with binds) or sanitized arrays.',
        references: ['CWE-89'],
      },
      {
        id: 'RB-004',
        title: 'Dependencies are locked',
        severity: 'MEDIUM',
        ruleClass: 'supply-chain',
        kind: 'file_exists',
        files: ['Gemfile.lock'],
        why: 'An unlocked Gemfile installs whatever is newest at deploy time.',
        remediation:
          'Commit Gemfile.lock and install with --deployment --without development test in CI.',
        references: ['CWE-829'],
      },
      {
        id: 'RB-005',
        title: 'Mass assignment and auth reviewed',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'manual',
        why: 'Strong parameters, auth scoping, and CSRF coverage cannot be confirmed by grep.',
        remediation:
          'Verify permit() lists, before_action scoping, and protect_from_forgery on state-changing endpoints.',
        evidence: 'Controller file:line of the permit list, auth filter, and CSRF configuration.',
        references: ['ASVS-4.2.1', 'ASVS-5.1.2'],
      },
    ],
  },
  {
    lang: 'cpp',
    packId: 'stacks/cpp',
    title: 'C / C++',
    description:
      'Starter checks for C and C++ projects. Generated — review every pattern before trusting.',
    frameworkHints: [
      'cmake (CMakeLists.txt), meson (meson.build), bazel (BUILD/WORKSPACE), autotools (configure.ac)',
    ],
    checks: [
      {
        id: 'CPP-001',
        title: 'No banned string/memory functions',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: '\\b(strcpy|strcat|sprintf|gets)\\s*\\(',
        include: ['**/*.{c,h,cc,cpp,cxx,hpp}'],
        exclude: [...TEST_EXCLUDES],
        why: 'Unbounded copies into fixed buffers are the classic overflow primitive; gets() cannot be used safely at all.',
        remediation:
          'Use strncpy/strncat/snprintf (C) or std::string/absl/span (C++); delete every gets call.',
        references: ['CWE-120', 'CWE-787'],
      },
      {
        id: 'CPP-002',
        title: 'No shell execution from application code',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: '\\b(system|popen)\\s*\\(',
        include: ['**/*.{c,h,cc,cpp,cxx,hpp}'],
        exclude: [...TEST_EXCLUDES],
        why: 'system()/popen() invoke a shell; composed commands are command injection.',
        remediation:
          'Use exec-family calls with argument vectors (fork+execve, posix_spawn) and no shell.',
        references: ['CWE-78'],
      },
      {
        id: 'CPP-003',
        title: 'No unbounded scanf input',
        severity: 'MEDIUM',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: 'scanf\\s*\\(\\s*"%s"',
        include: ['**/*.{c,h,cc,cpp,cxx,hpp}'],
        exclude: [...TEST_EXCLUDES],
        why: 'scanf("%s") writes unbounded input into the target buffer.',
        remediation:
          'Give every %s a field width ("%255s") or read lines with getline/fgets and parse.',
        references: ['CWE-120'],
      },
      {
        id: 'CPP-004',
        title: 'Build is described in a manifest',
        severity: 'MEDIUM',
        ruleClass: 'operations',
        kind: 'file_exists',
        files: [
          'CMakeLists.txt',
          'Makefile',
          'meson.build',
          'configure.ac',
          'BUILD',
          'BUILD.bazel',
        ],
        why: 'An undocumented build means flags, defines, and warnings differ per machine.',
        remediation:
          'Check in a manifest with warnings enabled (-Wall -Wextra -Werror where feasible) and sanitizer presets.',
      },
      {
        id: 'CPP-005',
        title: 'Memory ownership reviewed',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'manual',
        why: 'Use-after-free, double-free, and lifetime escapes need ownership reasoning no pattern provides.',
        remediation:
          'Prefer RAII/smart pointers; document ownership at every raw new/malloc boundary; run ASan+UBSan in CI.',
        evidence:
          'Ownership notes for new modules, sanitizer CI job, suppression-free sanitizer log.',
        references: ['CWE-416', 'CWE-415'],
      },
    ],
  },
  {
    lang: 'csharp',
    packId: 'stacks/csharp',
    title: 'C# / .NET',
    description:
      'Starter checks for C# projects. Generated — review every pattern before trusting.',
    frameworkHints: [
      'aspnet (*.csproj referencing Microsoft.AspNetCore), efcore (EntityFrameworkCore)',
    ],
    checks: [
      {
        id: 'CS-001',
        title: 'No insecure deserializers',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_deprecated',
        pattern: '(BinaryFormatter|LosFormatter|ObjectStateFormatter|SoapFormatter)',
        include: ['**/*.cs'],
        exclude: [...TEST_EXCLUDES],
        why: 'These deserializers execute attacker-controlled type graphs on.NET Framework and are discouraged everywhere.',
        remediation:
          'Use System.Text.Json or XmlSerializer with a restricted reader; treat any BinaryFormatter hit as a finding.',
        references: ['CWE-502'],
      },
      {
        id: 'CS-002',
        title: 'No concatenated process arguments',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'grep_wrong',
        pattern: 'Process\\.Start\\s*\\([^)]*\\+',
        include: ['**/*.cs'],
        exclude: [...TEST_EXCLUDES],
        why: 'A Process.Start argument string built with + passes through shell parsing on part of the input.',
        remediation:
          'Set ProcessStartInfo.ArgumentList entries individually with UseShellExecute = false.',
        references: ['CWE-78'],
      },
      {
        id: 'CS-003',
        title: 'Dependencies are locked',
        severity: 'MEDIUM',
        ruleClass: 'supply-chain',
        kind: 'file_exists',
        files: ['packages.lock.json'],
        why: 'Without lock files, restores float to newest compatible packages at build time.',
        remediation:
          'Enable lock files (RestorePackagesWithLockFile / Continuous) and commit them.',
        references: ['CWE-829'],
      },
      {
        id: 'CS-004',
        title: 'Hash algorithm choices inventoried',
        severity: 'MEDIUM',
        ruleClass: 'security',
        kind: 'manual',
        why: 'MD5/SHA1 appear legitimately for checksums and illegitimately for passwords — only a human can classify each use.',
        remediation:
          'List every hash call site; passwords go to PBKDF2/bcrypt/Argon2 via ASP.NET Identity or equivalent.',
        evidence: 'File:line per hash use with password-vs-checksum classification.',
        references: ['CWE-327', 'CWE-916'],
      },
      {
        id: 'CS-005',
        title: 'Authorization reviewed per endpoint',
        severity: 'HIGH',
        ruleClass: 'security',
        kind: 'manual',
        why: '[Authorize] placement and policy names cannot be verified by pattern.',
        remediation:
          'Default-deny with FallbackPolicy or explicit [Authorize] everywhere; verify resource-level checks, not just authentication.',
        evidence: 'Fallback policy or endpoint audit file:line, plus one ownership check.',
        references: ['ASVS-4.2.1'],
      },
    ],
  },
];
