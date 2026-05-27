# Divergence from upstream PAI

> A catalog of every meaningful divergence between `pai-thin` and [`danielmiessler/Personal_AI_Infrastructure`](https://github.com/danielmiessler/Personal_AI_Infrastructure). Updated on every change that diverges from upstream.

**Last upstream sync:** commit `11b75a0` (Revise funding model details in FUNDING.yml)
**Last reviewed:** 2026-05-27

---

## Why a divergence catalog?

Two reasons:

1. **Triage upstream changes.** When upstream ships a new feature, this catalog tells us whether we already replaced that surface (so we ignore the upstream change), still match upstream (so we pull it), or made an intentional break (so we judge case-by-case).
2. **Candidate PRs.** Some divergences may be valuable upstream — this catalog is the source list for upstreamable PRs once pai-thin v0.1 ships.

---

## Divergence categories

| Tag | Meaning |
|---|---|
| **KEEP** | Same as upstream, no change planned |
| **REBUILD** | Functionality preserved, implementation re-grounded on a native CC primitive |
| **DELETE** | Functionality removed because CC now does it natively without our wrapper |
| **ADD** | New in pai-thin, not in upstream |
| **FIX** | Bug fix or reliability improvement vs upstream behavior |

---

## Planned divergences (pre-implementation)

> These are the divergences specified by STRATEGY.md. Each will be implemented in a subsequent phase and moved into the implemented section below.

### Memory (P3, P5)

- **DELETE** `~/.claude/PAI/MEMORY/{WORK,KNOWLEDGE,LEARNING}/` parallel store
- **DELETE** `TOOLS/KnowledgeHarvester.ts`, `TOOLS/SessionHarvester.ts`, `TOOLS/MemoryRetriever.ts`
- **DELETE** `hooks/WorkCompletionLearning.hook.ts`, `hooks/SatisfactionCapture.hook.ts`, `hooks/RelationshipMemory.hook.ts`
- **REBUILD** Memory → CC native auto-memory at `~/.claude/projects/<proj>/memory/MEMORY.md`, index + topic file pattern
  - *Upstream rationale (when it was built):* CC had no persistent memory
  - *Why we diverge:* CC shipped auto-memory in v2.1.59 (Nov 2025); the wrapper is now overhead

### Hooks (P3)

- **REBUILD** All `type: command` hooks that spawn `bun` → `type: http` against Pulse OR pure bash
  - *Upstream rationale:* CC only had `type: command` when PAI 5.0 was designed
  - *Why we diverge:* CC now exposes `http`, `prompt`, `mcp_tool`, `agent` handler types
- **DELETE** `hooks/SecurityPipeline.hook.ts` + 5 inspector files
  - *Why:* CC native `permissions.{allow,ask,deny}` + `autoMode.{hard_deny}` covers the same surface and runs at a lower level
- **ADD** `InstructionsLoaded` hook (5-line bash) for context-load observability
  - Pattern validated 2026-05-27 in conversation transcript
- **KEEP** `LoadContext.hook.ts` — only PAI hook with no CC-native equivalent (relationship + learning + performance signals)
- **KEEP** Mode classifier (`PromptProcessing.hook.ts`) — no CC equivalent, but flagged for P6 reliability fix

### CLAUDE.md surgery (P4)

- **REBUILD** `~/.claude/CLAUDE.md`: 5 `@`-imports → 2 (`PRINCIPAL_IDENTITY.md`, `DA_IDENTITY.md` only)
- **REBUILD** `PROJECTS.md`, `PRINCIPAL_TELOS.md` → `.claude/rules/projects.md`, `.claude/rules/telos.md` with `paths:` frontmatter (load contextually, not at every session start)
- **DELETE** `ARCHITECTURE_SUMMARY.md` from default load path (move to skill on-demand or remove entirely if no consumer)

### Algorithm & Skills (P3)

- **REBUILD** Algorithm from mode (auto-triggers via classifier) → skill (invoked explicitly via `Skill("Algorithm", ...)`)
  - *Rationale from `project_pai-right-ideas-wrong-implementation.md`:* right idea, wrong implementation
- **KEEP** `skills/ISA/`, `skills/Interceptor/`, `skills/Fabric/`, `skills/Council/`, `skills/RedTeam/`, `skills/Ideate/`, `skills/Evals/`, `skills/BitterPillEngineering/`, `skills/ContextSearch/`, `skills/Interview/`
- **DELETE** `~/.claude/commands/*` (CC merged commands into skills; migrate the 3 files to skill form or drop)

### Pulse (P3)

- **REBUILD** Pulse: shrink from hook-substrate role to voice/notification service only
  - *Upstream rationale:* The bun-per-hook performance problem needed a daemon
  - *Why we diverge:* `type: http` handler does what Pulse-as-substrate was doing; native is simpler

### Observability (P3)

- **DELETE** Custom JSONL observability paths that duplicate CC's auto-logged events
- **REBUILD** Telemetry → `CLAUDE_CODE_ENABLE_TELEMETRY=1` + OTLP exporter for the standard event stream
- **KEEP** PAI-specific event streams (mode-classifier decisions, ISA-sync events)

### Effort levels (P4)

- **REBUILD** `/e1`-`/e5` slash commands → wire through CC's native `effortLevel` setting + per-message override

### Constitutional (P3)

- **KEEP** `PAI_SYSTEM_PROMPT.md` via `--append-system-prompt-file` — survives compaction, only way to inject constitutional rules at system-prompt level

### Mode classifier (P6)

- **FIX** Resolve the 25s-timeout failure mode in `PromptProcessing.hook.ts`
  - *Evidence:* Two fail-safe E3 escalations observed in a single session on 2026-05-27
  - *Options (deferred to P6 with telemetry):* Haiku rewrite / regex pre-pass / remove model call entirely

---

## Implemented divergences

> None yet. P0 is meta-only (this commit).

---

## Upstream changes not yet triaged

> When upstream commits land between syncs, list them here with a triage verdict.

None pending (last sync was the fork itself).

---

## Candidate PRs back to upstream

> Divergences that may be valuable to upstream once validated in pai-thin v0.1+.

- **`InstructionsLoaded` observability hook** (5-line bash) — would help any PAI user diagnose CLAUDE.md / @-import load order
- **The audit-driven hook-pruning approach** — a methodology, not a code change, but worth a discussion issue
- **`.claude/rules/` migration recipe** — moving load-heavy `@`-imports to path-scoped rules is a general win
