# pai-thin — Strategy & Fork Plan

**Date:** 2026-05-27 (scope locked 2026-05-28)
**Status:** SCOPE LOCKED — P0 committed, v0.1 = audit only
**Author:** Austin (with Jeff)
**Successor to:** This session's PAI-vs-CC audit (in conversation transcript)
**Base:** upstream HEAD `2fde1bb` (2026-05-20), verified fresh 2026-05-28

---

## v0.1 Definition of Done (LOCKED 2026-05-28)

> Four scope decisions, answered directly. These supersede any conflicting detail
> below — in particular the "Target structure" and P2–P8 phases describe work that
> is **post-v0.1**, not part of v0.1.

1. **Artifact: the repo is the deliverable.** pai-thin v0.1 is a curated, public-safe
   thin package living in this repo. The live `~/.claude` is **not touched** in v0.1 —
   in-place refactor of the daily driver is a separate, later effort.
2. **v0.1 = audit only.** The single v0.1 deliverable is a trustworthy, committed
   `MANIFEST.yaml` classifying every meaningful unit of the fresh upstream tree as
   KEEP / REBUILD / DELETE / ADD / FIX, each with rationale + citation to STRATEGY/DIVERGENCE.
   **No files in the tree are modified.** Decisions are captured; execution is deferred.
3. **Prior audit discarded.** The earlier gitignored `MANIFEST.yaml` (a Ralph P1 that ran
   ahead of scope agreement) is discarded. Regenerate clean against the fresh tree.
4. **Executor: Ralph / `codex exec`** (no Forge agent), per the validated job-crm pattern.

**Audit decomposition (size-bound, not per-file across 12.4K files):**

| Surface | Files | Unit | Method |
|---|---|---|---|
| `Releases/` | 10,488 | 1 bulk verdict | Frozen historical snapshots (v2.3→v5.0.0) — single decision, not per-file |
| `Packs/` | 1,850 in **54 packs** | 1 verdict per pack (+ notable per-file exceptions) | Ralph loop: one `codex exec` per pack, fresh context, append fragment |
| Top-level + `Tools/` + `.github/` + `images/` | ~50 | direct | Audit in-session (small, no loop needed) |

**Manifest contract (every entry):** `path`, `unit` (file|pack|tree), `verdict`
(KEEP|REBUILD|DELETE|ADD|FIX), `rationale` (why, grounded in CC-native equivalence),
`cite` (STRATEGY.md/DIVERGENCE.md section), `confidence` (HIGH|MED|LOW).

**v0.1 ships when:** every unit above has a verdict, `MANIFEST.yaml` is tracked + committed,
and a distribution summary (counts per verdict) is at the top of the file.

---

## What pai-thin is

A **minimal layer on top of native Claude Code** that keeps only the PAI ideas Claude Code does not natively provide, and rebuilds the rest on CC's first-class primitives.

**Differentiation from sibling projects:**

| Project | Substrate | Audience | Status |
|---|---|---|---|
| `danielmiessler/Personal_AI_Infrastructure` (upstream) | Claude Code (pre-2026 features assumed) | Daniel + general users | 14.4K stars, canonical |
| `eccentricnode/pai-lite` | **pi.dev** coding agent | Austin (UHC laptop, restricted env) | v0.1 shipped 2026-05-26, 6 skills |
| **`eccentricnode/pai-thin` (this project)** | **Claude Code 2026 (native features)** | Austin (personal box) + anyone with modern CC | NEW |

The substrate matters. pai-lite exists because pi.dev doesn't have CC's hook system, auto-memory, skill auto-activation, or 25 hook events. pai-thin exists because **CC now has all of those**, and the canonical PAI repo grew up before they shipped — so it scaffolds around features that are now native.

---

## The diagnosis (verified this session)

Two empirical findings drive the design.

### 1. Startup context is ~22.7K tokens, split across four streams

```
Stream                              Tokens    % of startup
─────────────────────────────────────────────────────────
CLAUDE.md + 5 @-imports             10,897    48%   (PAI-owned)
CC auto-memory (capped at 25KB)      6,170    27%   (CC native)
PAI_SYSTEM_PROMPT.md                 5,213    23%   (PAI-owned, --append-system-prompt-file)
LoadContext.hook.ts output             430     2%   (PAI-owned, only stream with no overlap)
─────────────────────────────────────────────────────────
                                    22,710   ~11% of 200K window
```

**MEMORY.md exceeds the CC 200-line cap** (it's 262 lines / 30.9KB) — ~6.3KB of content is silently dropped every session. Self-warning at the bottom of the file is correct.

### 2. The CC feature surface doubled since PAI 5.0

Verified via fetched docs at code.claude.com on 2026-05-27:

| Surface | PAI uses | CC now exposes |
|---|---|---|
| Hook events | 9 (`SessionStart`, `UserPromptSubmit`, `Pre/PostToolUse` + `Failure`, `Stop`, `SubagentStop`, `PreCompact`, `SessionEnd`) | **~25** (+ `InstructionsLoaded`, `PostToolBatch`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate/Remove`, `PermissionRequest/Denied`, `TaskCreated/Completed`, `MessageDisplay`, `Elicitation*`, `PostCompact`, `Notification`, `Setup`) |
| Hook handler types | 1 (`type: command` spawning `bun`) | **5** (`command`, `http`, `prompt`, `mcp_tool`, `agent`) |
| Memory | Custom `MEMORY/WORK\|KNOWLEDGE\|LEARNING` + custom retrieval | **Native auto-memory** at `~/.claude/projects/<proj>/memory/MEMORY.md`, index + topic-file pattern, first 200 lines auto-loaded |
| Skills | Custom format, but already aligned | Native, same `SKILL.md` format, same auto-activation, **custom commands merged into skills** |
| Subagents | `~/.claude/agents/*` already aligned | Native + **per-subagent persistent memory** |
| Constitutional rules | `PAI_SYSTEM_PROMPT.md` via flag | Native `--append-system-prompt-file` |
| Path-scoped rules | None | **`.claude/rules/*.md` with `paths:` frontmatter** — context-gated loading |
| Permissions / security | Custom inspector pipeline | Native `permissions.{allow,ask,deny}` + `autoMode.{soft_deny,hard_deny}` + managed settings |
| Observability | Custom JSONL + Pulse | Native `CLAUDE_CODE_ENABLE_TELEMETRY=1` + OTLP exporter + auto-logging every hook |
| Session resume | Custom state files | Native `awaySummaryEnabled` + per-project session history |

---

## Design principles

1. **CC first.** If CC does it natively, pai-thin uses the native version. Wrapping native features is anti-value.
2. **Constitutional > Contextual > Conditional.** Constitutional rules → system prompt. Contextual identity → top of CLAUDE.md. Conditional procedures → `.claude/rules/` path-scoped OR `.claude/skills/` on-demand.
3. **One stream per concern.** Today PAI has four parallel content streams at SessionStart. pai-thin targets two: system prompt (constitution) + LoadContext (dynamic signals). CLAUDE.md trims to <100 lines; MEMORY.md becomes a true index.
4. **Hooks pay rent.** Every hook must justify its place against the equivalent native CC mechanism. Default action on review: delete.
5. **No parallel implementations of native features.** This is the load-bearing rule. Failure of this rule is why PAI 5.0 has the "more tool errors than ever" pattern Austin logged in `project_pai-tool-error-remediation.md`.

---

## The keep / native-rebuild / delete sheet

### KEEP (unique PAI value, no native equivalent)

- **`PAI_SYSTEM_PROMPT.md`** — constitutional rules, survives compaction. ~5.2K tok well-spent.
- **`Algorithm/`** — the v6.3.0 doctrine (OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN), ISC quality system, tier completeness gate. **Refactored as a skill, not a mode** — see pai-lite `project_pai-right-ideas-wrong-implementation.md`.
- **`skills/ISA/`** — twelve-section ISA, ID-stability rule, Skill workflows. Unique methodology.
- **`LoadContext.hook.ts`** — only PAI hook that earns its 430-token cost (relationship + learning + performance signals not derivable from any native CC surface).
- **`Fabric` skill** — pattern library wrapper, no native equivalent.
- **Mode classifier** (`PromptProcessing.hook.ts`) — only surface that gives per-prompt tier judgment. **But:** known reliability problem (25s timeouts → fail-safe E3). Keep, but spec a fix.
- **PAI-specific skills**: `Interceptor` (browser verification), `Council`, `RedTeam`, `Ideate`, `Evals`, `BitterPillEngineering`, `ContextSearch`, `Interview`.

### REBUILD-ON-NATIVE (CC now provides; rewrite using native primitives)

- **Memory system** → CC auto-memory. Restructure `MEMORY.md` as index + topic files (CC's documented pattern). Delete `MEMORY/WORK|KNOWLEDGE|LEARNING` parallel store; migrate load-bearing content into topic files.
- **`Pulse :31337` as hook substrate** → CC `type: http` hook handlers. Keep Pulse only as the voice/notification service (its actual unique job).
- **All `type: command` hooks that spawn `bun`** → either delete (if redundant with native), convert to `type: http` against Pulse, or convert to pure bash (the InstructionsLoaded hook in this session is the pattern).
- **`SecurityPipeline.hook.ts` + inspectors** → CC `permissions.{allow,ask,deny}` + `autoMode.{hard_deny}`. The auto-mode classifier already blocked two self-modification attempts in this session — proof CC's native security works.
- **Custom observability JSONL** → `CLAUDE_CODE_ENABLE_TELEMETRY=1` + OTLP exporter. Keep PAI-specific events (mode-classifier, ISA-sync) only.
- **`/e1`–`/e5` slash commands** → align with CC's native `effortLevel` setting + per-message override. Keep 5 tiers but route through native primitive.
- **`@`-imports for PROJECTS / TELOS** → migrate to `.claude/rules/*.md` with `paths:` frontmatter so they only load when working in matching directories. Reclaims ~3-4K tok from default startup.

### DELETE (redundant with native; pure scaffolding overhead)

- **`WorkCompletionLearning.hook.ts`** — CC auto-memory does this natively when Claude decides it's worth remembering.
- **`SatisfactionCapture.hook.ts`** — same.
- **`RelationshipMemory.hook.ts`** — same.
- **`KnowledgeHarvester.ts`, `SessionHarvester.ts`** — auto-memory makes the harvest pattern obsolete.
- **`MemoryRetriever.ts` (BM25)** — CC reads topic files on demand using its standard file tools; explicit retrieval is unnecessary.
- **`~/.claude/commands/*` (3 files)** — CC merged commands into skills; the `.claude/commands/X.md` form still works but is the legacy path. Migrate to skill form.
- **Doc integrity hook + auto-generated `ARCHITECTURE_SUMMARY.md`** — re-evaluate; if no consumer pays attention, drop.

---

## Target structure

```
~/.claude/                          # native CC root (unchanged ownership)
  CLAUDE.md                         # ~60 lines: identity + two @-imports + mode rules
  PAI_SYSTEM_PROMPT.md              # constitutional, loaded via --append-system-prompt-file
  settings.json                     # native CC settings (hooks reduced ~70%)
  rules/                            # NEW: path-scoped rules (CC native)
    projects.md                     # was @-imported PROJECTS.md, now loads only for ~/Work/**
    telos.md                        # was @-imported PRINCIPAL_TELOS.md, loads contextually
  skills/                           # CC native skills, mostly unchanged
    Algorithm/                      # was a mode, now a skill (invoke explicitly)
    ISA/                            # unchanged
    Interceptor/                    # unchanged
    [other pai-specific skills]
  agents/                           # CC native subagents, unchanged
  hooks/                            # ~5-7 hooks max (was 25+)
    LoadContext.sh                  # converted to bash, no bun spawn
    InstructionsLoadedLog.sh        # observability (pattern from this session)
    [mode classifier — keep with timeout fix]
  projects/-home-ajohnson-Work/memory/
    MEMORY.md                       # ~150-line INDEX only
    projects.md                     # topic file (active builds)
    huntley-ralph.md                # topic file (research notes)
    [other topic files — load on demand]
```

**Diff vs current:**
- Hooks: 25+ → ~5-7 (-72%)
- Hook spawn cost: bun-per-event → pure bash + native `type: http`
- Startup context: ~22.7K tok → target ~12-14K tok (-40%)
- @-imports at CLAUDE.md root: 5 → 2
- Parallel storage systems: 2 (MEMORY/* + auto-memory) → 1 (auto-memory only)

---

## Fork & first-commit plan

### Sequence

1. `gh repo fork danielmiessler/Personal_AI_Infrastructure --org eccentricnode --fork-name pai-thin --clone=false`
2. `gh repo edit eccentricnode/pai-thin --description "Thin PAI for modern Claude Code. Keeps unique PAI ideas, drops what CC now does natively. Sister project to pai-lite (pi.dev substrate)."`
3. Clone to `~/Work/active/pai-thin`
4. **First commit** — meta only, no code yet:
   - This strategy doc (copy to repo root as `STRATEGY.md`)
   - A new `README.md` differentiating pai-thin from upstream PAI and from pai-lite
   - A `DIVERGENCE.md` cataloguing every meaningful divergence from upstream and why
   - `.github/UPSTREAM_SYNC.md` — how to pull canonical PAI updates and triage them
5. **Push to `main`** of the fork.
6. **Open one issue** on the fork (`#1: Roadmap: thin-PAI implementation phases`) with the implementation plan from this doc.

### Upstream PR strategy (deferred until v0.1 lands)

Some pai-thin changes might be valuable to upstream:
- The `InstructionsLoaded` hook pattern (5-line bash, observability win)
- The audit-driven hook-pruning approach
- The `.claude/rules/` migration recipe

These become candidate PRs against `danielmiessler/Personal_AI_Infrastructure` *after* pai-thin v0.1 proves the pattern in practice. Don't push speculative PRs upstream until empirically validated.

---

## Implementation phases

| Phase | Goal | Success criterion | Estimate |
|---|---|---|---|
| **P0 — Fork + meta** | Repo exists with strategy + README + divergence catalog | Push to main, issue #1 open | This session |
| **P1 — Audit catalog** | Every PAI file in upstream classified KEEP / REBUILD / DELETE in a machine-readable manifest | `MANIFEST.yaml` at repo root, every path categorized | Ralph mission, 1-2 hours |
| **P2 — Delete pass** | Remove all DELETE-class files; verify nothing breaks | `claude --version` works; one normal session boots clean | Ralph mission, 1-2 hours |
| **P3 — Native rebuild** | Convert REBUILD-class to native CC primitives (hooks, rules, auto-memory) | Hook count ≤ 7; startup context ≤ 14K tok measured | Ralph mission, 4-6 hours |
| **P4 — CLAUDE.md surgery** | Trim CLAUDE.md to <100 lines; move PROJECTS/TELOS to path-scoped rules | `wc -l ~/.claude/CLAUDE.md` ≤ 100 | 1 session |
| **P5 — MEMORY.md restructure** | Split MEMORY.md into index + topic files following CC pattern | `wc -l MEMORY.md` ≤ 150; no content past 200-line cap silently dropped | 1 session |
| **P6 — Mode classifier reliability** | Fix the 25s timeout failure mode | <2% fail-safe rate in mode-classifier.jsonl over 1 week | 1 session |
| **P7 — Dogfood** | Use pai-thin as Austin's daily driver for 1 week, log issues | Issue tracker has zero P0/P1 bugs after 7 days of use | 1 week observation |
| **P8 — v0.1 release** | Tag, write release notes, publish | `gh release create v0.1` | 1 session |

---

## Ralph mission shape

Per `feedback_codex-ralph-loop-default-fresh.md` and the validated job-crm pattern:

- **Orchestrator** reads STRATEGY.md + MANIFEST.yaml, picks the next phase, decomposes into worker tasks.
- **Workers** run via `codex exec` (per `feedback_no-forge-use-codex-exec-directly.md` — no Forge agent). Fresh context per retry by default.
- **Per-task verifier** confirms the change against the phase's success criterion before commit.
- **Backpressure dataset** captures every worker iteration as JSONL — this becomes the empirical proof point for "thin PAI works."
- **Checkpoint cadence**: per-ISC commit (CheckpointPerISC pattern from current PAI Algorithm).

Phase P1 (Audit catalog) is the best first Ralph mission because:
- High parallelism (every file is independent)
- Clear success criterion (every path in manifest)
- Low blast radius (read-only)
- Outputs become input for every subsequent phase

---

## Open questions / decisions deferred

1. **Mode classifier rewrite?** The 25s timeout pattern (seen twice in this session) suggests the Sonnet-via-subprocess approach is fragile. Alternatives: (a) faster Haiku classifier with simpler ruleset, (b) regex pre-pass that only invokes the model on ambiguous cases, (c) accept fail-safe E3 as the default and remove the model call entirely. **Defer to P6 — needs telemetry first.**

2. **Pulse retention?** Pulse's voice + dashboard are real value. Pulse-as-hook-substrate is obsolete. Two options: (a) shrink Pulse to voice-service only, (b) leave Pulse as-is but stop registering hooks against it. **Defer to P3.**

3. **Path-scoped rule design.** `.claude/rules/projects.md` with `paths: ~/Work/**` works for the personal box but not portably. Need a design that handles both Austin's personal layout and a hypothetical other user. **Defer to P4.**

4. **Sync with pai-lite?** Several skills (Algorithm, ISA) will exist in both. Strategy: pai-thin is canonical for skills; pai-lite consumes via `pi install`. Need to verify pi.dev can install from a CC-shaped repo. **Defer to P2/P3.**

5. **Upstream-pull mechanism.** `reference_pai-no-upstream-pull-mechanism.md` documents that PAI has no built-in upstream-pull. pai-thin needs one because it's an active fork. Build into `.github/UPSTREAM_SYNC.md`. **P0 deliverable.**

---

## Anti-scope (what pai-thin is NOT)

- **Not** a competitor to upstream PAI. It's a thinner variant for a different substrate-generation.
- **Not** a productized release for general users. It's Austin's daily driver, dogfooded in public.
- **Not** a port to a new platform. It IS Claude Code; pai-lite already handles non-CC substrates.
- **Not** a complete rewrite. ~70% of upstream PAI files survive the audit (KEEP or REBUILD); only ~30% delete.
- **Not** the place to land speculative PAI ideas. New ideas land in upstream PAI or in a separate experiment repo.

---

## Success criterion for this strategy doc

If a future Austin (or Ralph, or a new contributor) reads this doc cold and can answer all of the following without further conversation, the doc has done its job:

- [ ] Why does pai-thin exist? (audit-driven thin layer on modern CC)
- [ ] How is it different from upstream PAI and from pai-lite? (substrate generation, not platform)
- [ ] What gets deleted, what gets rebuilt, what gets kept? (the three lists above)
- [ ] What's the first commit? (this doc + README + DIVERGENCE + UPSTREAM_SYNC)
- [ ] What's the implementation order? (P0 → P8)
- [ ] What's the first Ralph mission? (P1 Audit catalog)
- [ ] Where are the unresolved decisions parked? (Open Questions section)

---

## Next action (this session, after Austin reviews this doc)

1. Fork upstream → `eccentricnode/pai-thin`
2. Clone to `~/Work/active/pai-thin`
3. Drop this doc + README + DIVERGENCE + UPSTREAM_SYNC into the fork
4. Push to main
5. Open issue #1 with the implementation roadmap
6. Hand to Austin for review before P1 Ralph mission spins up

Estimated time for steps 1-5: ~15-20 min.
