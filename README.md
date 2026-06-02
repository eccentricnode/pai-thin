# pai-thin

> A thinner [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure) for modern Claude Code — keep the unique ideas, drop what Claude Code does natively.

---

## What this is

A fork of [danielmiessler/Personal_AI_Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure) (PAI) that audits the upstream tree against Claude Code's 2026 feature surface and removes the wrapper code for things CC now does natively.

The original PAI repo was built before Claude Code shipped auto-memory, the `http` / `prompt` / `agent` hook handler types, `.claude/rules/` path-scoped instructions, ~25 hook events, and persistent subagent memory. PAI scaffolded around the absence of those features. **They exist now.** pai-thin is the version that leans on them.

The deliverable so far is a *trustworthy decision catalog* — every meaningful piece of the upstream tree classified as KEEP / REBUILD / DELETE / FIX / ADD — and a slimmed-down tree that reflects the cheaper verdicts (DELETE, FIX, sweep).

## Current state

| | Done | What it produced |
|---|---|---|
| **P0** — fork + meta | ✓ | `STRATEGY.md`, `DIVERGENCE.md`, [`.github/UPSTREAM_SYNC.md`](./.github/UPSTREAM_SYNC.md) |
| **P0.5** — scope lock | ✓ | v0.1 Definition of Done in STRATEGY (repo-is-deliverable, audit-only first) |
| **P1** — audit catalog | ✓ | **[`MANIFEST.yaml`](./MANIFEST.yaml)** — 76 units classified |
| **P2** — DELETE pass | ✓ | Dropped `Releases/` (10K archived files), `Packs/Delegation`, `.github/FUNDING.yml`. Tree: 12,380 → 1,888 files. |
| **P3** — FIX pass | ✓ | 10 packs fixed for specific bugs the audit named (broken imports, missing fixtures, casing mismatches) |
| **P4** — Pulse + MEMORY sweep | ✓ | Removed hardcoded `localhost:31337/notify` Pulse voice notifications (264 files) and `~/.claude/PAI/MEMORY/SKILLS/execution.jsonl` logging (38 files) |
| **P5** — REBUILD pass | _pending_ | 8 packs + the custom-security surface need to be re-grounded on Claude Code native primitives (permissions, telemetry). Architectural; deserves its own kickoff. |

Live-system migration (CLAUDE.md surgery, MEMORY.md restructure, hook pruning in `~/.claude`) is intentionally **not** in v0.1 scope — pai-thin is a repo-as-deliverable, not an in-place refactor of anyone's installed PAI. See `STRATEGY.md` § v0.1 Definition of Done.

## What's actually different from upstream right now

| Upstream PAI 5.0 | pai-thin (today) |
|---|---|
| 12,380 tracked files (incl. ~10K in archived release snapshots) | 1,888 tracked files |
| Most packs hardcode `curl http://localhost:31337/notify` voice notifications in `SKILL.md` and every workflow | Notifications removed — bring your own if you want them |
| Most SKILL.md files end with a forced `~/.claude/PAI/MEMORY/SKILLS/execution.jsonl` append | Custom JSONL gone — use Claude Code native telemetry (`CLAUDE_CODE_ENABLE_TELEMETRY=1`) if you want skill-level observability |
| 10 packs ship with known bugs the audit named (broken imports, missing fixtures) | Those 10 packs fixed |
| `Packs/Delegation` shipped | Removed (audit verdict) |

What hasn't changed *yet* (work pending in P5):
- 8 REBUILD-class packs still contain wrapper code over Claude Code natives.
- The custom security inspector pipeline (`.pai-protected.json`, `Tools/validate-protected.ts`) still parallels Claude Code's native `permissions.{allow,ask,deny}`.

## What's the same as upstream

- Skills, subagents, ISA system, the Algorithm doctrine, Fabric integration, Interceptor, the `PAI_SYSTEM_PROMPT.md` constitutional pattern — preserved.
- Anything Claude Code doesn't do natively — preserved.

## Not the same project as `pai-lite`

[`eccentricnode/pai-lite`](https://github.com/eccentricnode/pai-lite) is the PAI variant for **pi.dev** as substrate (built because pi.dev doesn't have CC's hook system).

**pai-thin** is the PAI variant for **modern Claude Code** as substrate (built because Claude Code now has most of what PAI scaffolded around).

Both exist because PAI's value is in the *ideas* (memory, skills, routing, learning, the Algorithm, ISA), not in any particular implementation. Different substrates get different implementations.

## How the work happened (for the curious)

The audit and the FIX pass were both autonomous Ralph-style loops — one `codex exec` call per unit, fresh context each, sentinel-file resumable, orchestrator commits per iteration. Scripts and per-iteration prompts are at `scripts/` (gitignored as local mission scaffold; the *deliverable* is the manifest + the committed changes, not the rig).

The P4 Pulse and MEMORY sweeps were done with a Python script (`scripts/p4-sweep.py`) instead of Ralph — the patterns were copy-paste-uniform across 40 packs, so a single 100-line script produced one reviewable diff rather than 40 redundant codex iterations. Choosing the right tool per phase mattered.

## Read first

- **[`MANIFEST.yaml`](./MANIFEST.yaml)** — the decision catalog. Every unit, every verdict, every rationale, every citation.
- **[`STRATEGY.md`](./STRATEGY.md)** — design principles, v0.1 Definition of Done, full implementation plan
- **[`DIVERGENCE.md`](./DIVERGENCE.md)** — every meaningful divergence from upstream and why
- **[`.github/UPSTREAM_SYNC.md`](./.github/UPSTREAM_SYNC.md)** — how to pull canonical PAI updates and triage them
- **[`UPSTREAM_README.md`](./UPSTREAM_README.md)** — Daniel's original README, preserved

## Credits

Built on [Daniel Miessler](https://danielmiessler.com/)'s [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure). All credit for the original ideas — memory, skills, the Algorithm, ISA, the substrate-agnostic philosophy — goes upstream. This fork is an implementation experiment grounded in the same ideas, not a critique.

## License

Same as upstream (see [LICENSE](./LICENSE)).
