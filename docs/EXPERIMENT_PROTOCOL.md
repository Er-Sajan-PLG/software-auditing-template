# USA Adaptive Audit Experiment Protocol

**Version:** 1.0  
**Status:** Mandatory for all capability‑stress experiments  
**Purpose:** Ensure every USA adaptation experiment follows the same reproducible, logged, and evidence‑driven process.

---

## 1. Scope

This protocol applies whenever USA is used to:

- Audit a repository substantially more complex than USA itself
- Discover capability gaps
- Research and implement new capabilities
- Test and permanently integrate those capabilities
- Re‑audit and measure progress

It is **not** a routine audit procedure; it is an **experimental evolution** protocol.

---

## 2. Mandatory Pre‑Experiment Baseline

Before any change is made, capture and record the following in the experiment log:

- USA repository URL, commit SHA, branch, working‑tree state
- Target repository URL, commit SHA, branch/ref, submodule state
- OS, architecture, runtime versions (Node, Python, etc.)
- USA configuration (`.usa.yaml`), rule packs version, capability registry version
- Model provider, exact model identifier, reasoning configuration
- Benchmark instructions (the exact prompt that initiated the experiment)
- Start timestamp (ISO‑8601, UTC)

**Store these in a `baseline.json` file** inside the experiment run directory.

---

## 3. Experiment Run Structure

Every experiment gets a persistent `run_id` of the form:

```
YYYYMMDDTHHMMSSZ-<target>-<short_commit>-r<number>
```

Example:

```
20260909T061600Z-vapor-2b2fa20-r001
```

Create a dedicated run directory:

```
experiments/
└── <run_id>/
    ├── baseline.json
    ├── manifest.json
    ├── agent.log
    ├── events.jsonl
    ├── tool-calls.jsonl
    ├── decisions.jsonl
    ├── errors.log
    ├── repository-state.json
    ├── usa-state-before.json
    ├── usa-state-after-iteration-0.json
    ├── usa-state-after-iteration-1.json
    ├── ...
    ├── iterations/
    │   ├── 0/
    │   │   ├── audit-report.md
    │   │   ├── capabilities-before.json
    │   │   ├── capabilities-after.json
    │   │   └── gaps.json
    │   ├── 1/
    │   │   └── ...
    └── reports/
        └── final-report.md
```

All tool calls, shell commands, file modifications, git operations, tests, and retries must be logged to `events.jsonl` with:

- `event` type
- `run_id`, `iteration`, `timestamp`
- relevant data (e.g., `capability`, `rule`, `test_result`)

---

## 4. Iteration Loop

Each iteration consists of:

1. **Audit** the target using the current USA state.
2. **Classify** every finding as:
   - `VERIFIED` (pass with evidence)
   - `PARTIALLY_VERIFIED`
   - `INFERRED`
   - `UNVERIFIABLE`
   - `UNSUPPORTED`
   - `FAILED`
   - `NOT_RUN`
3. **Identify capability gaps** from `UNSUPPORTED` and `FAILED` findings.
4. **For each gap**, research the state of the art (official docs, academic literature, open‑source tools) and record:
   - Research question
   - Candidate approaches (≥3 if available)
   - Evaluation criteria (accuracy, coverage, maturity, maintenance, licensing, integration complexity, performance, FP/FN risk)
   - Selected approach and justification
5. **Implement** the capability:
   - New detectors, rule packs, or engine enhancements
   - Must be a permanent part of USA (not a one‑off hack)
   - Must be tested (unit/integration)
   - Must be registered in the capability registry
6. **Test** the capability on both positive and negative fixtures.
7. **Run regression** to ensure existing functionality is intact (`npm test`).
8. **Permanently integrate** – commit the changes, update documentation, and record the new USA state.
9. **Re‑audit** the target to measure improvement.
10. **Log** the new completeness, capability count, and remaining gaps.

Repeat until either:

- All meaningful gaps are addressed, or
- Further improvement is infeasible (explain why).

---

## 5. Capability Metadata

Every new capability must be recorded with:

```json
{
  "id": "CAP-XXX",
  "name": "Swift test detection",
  "type": "detector|rule|engine|integration",
  "implementation": "path/to/file",
  "tests": ["test name"],
  "status": "active|experimental|deprecated",
  "version": "1.0",
  "date_added": "2026-09-09",
  "source": "SOTA research | custom"
}
```

This metadata is maintained in `capabilities/registry.json` (or a similar persistent location).

---

## 6. Evidence and Honest Classification

- Never mark a finding as `VERIFIED` without file/line evidence or tool output.
- Distinguish between:
  - `USA_CAPABILITY_GAP`
  - `MODEL_REASONING_FAILURE`
  - `AGENT_ORCHESTRATION_FAILURE`
  - `TOOL_FAILURE`
  - `ENVIRONMENT_FAILURE`
  - `REPOSITORY_COMPLEXITY`
  - `UNKNOWN`
- Log all failed attempts and retries – never hide them.

---

## 7. Generalization Validation

After the target repository is fully processed, repeat the audit on a **second, substantially larger repository** (e.g., Kubernetes, Rust, LLVM, PyTorch, CockroachDB) to validate that the added capabilities generalise.

Record:

- Whether the new capabilities applied
- Any new gaps discovered
- Whether the loop repeated successfully

---

## 8. Final Report

Produce a report containing at least:

1. Executive Summary
2. Initial USA Capability Baseline
3. Target Repository details
4. Initial Audit Result
5. Capability Gaps Discovered
6. State‑of‑the‑Art Research
7. Capabilities Implemented
8. Architectural Changes
9. Tests Added
10. Audit Iterations (score progression table)
11. Completeness Progression
12. Failures and Recovery
13. Generalization Results
14. Remaining Limitations
15. Model/Agent Limitations
16. USA Architectural Limitations
17. Verified vs Inferred vs Unverifiable counts
18. Reproducibility Information
19. Final Assessment (Grade A–E)

The report must be **brutally honest** – the grade is earned by evidence, not intent.

---

## 9. Reproducibility Checklist

Before closing an experiment, confirm:

- [ ] All commit SHAs are recorded (USA and target)
- [ ] All configuration files are captured
- [ ] All tool outputs and logs are preserved
- [ ] All capability metadata is updated
- [ ] All tests pass
- [ ] Generalization test is complete
- [ ] Final report is written

---

## 10. How to Use This Protocol

Future agents (including this one) **must** follow this protocol when performing a USA adaptive audit experiment.

**To start a new experiment:**

1. Create the run directory and baseline.
2. Perform the initial audit.
3. Follow the iteration loop.
4. Record everything.

**To resume an interrupted experiment:**

1. Restore the USA state from the last saved checkpoint.
2. Continue from the last incomplete iteration.

All state changes (USA modifications) must be committed incrementally and tagged with the experiment run ID.

---

**This protocol supersedes any conflicting ad‑hoc procedures.** When in doubt, refer to this document.
