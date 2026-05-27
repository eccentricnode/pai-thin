# pai-thin

> A thin layer on top of native Claude Code. Keeps what's unique to PAI, drops what Claude Code now does natively.

**Status:** v0 — pre-implementation. STRATEGY.md is the load-bearing doc.

---

## What this is

A fork of [danielmiessler/Personal_AI_Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure) re-shaped against Claude Code's 2026 native feature surface. Same ideas, smaller surface area.

The canonical PAI repo grew up before Claude Code shipped auto-memory, the `http`/`prompt`/`agent` hook handler types, `.claude/rules/` path-scoped instructions, ~25 hook events, and persistent subagent memory. PAI scaffolded around the absence of those features. **They exist now.** pai-thin is the version that uses them.

## What's different from upstream

| Upstream PAI 5.0 | pai-thin |
|---|---|
| 25+ hooks, most `type: command` spawning a fresh runtime per fire | ~5-7 hooks, mostly `type: http`/bash; matches CC native handler types |
| Custom `MEMORY/{WORK,KNOWLEDGE,LEARNING}` parallel store + custom retrievers | CC native auto-memory (`~/.claude/projects/<proj>/memory/`), index + topic-file pattern |
| `CLAUDE.md` + 5 `@`-imports loading ~10.9K tok at every session start | `CLAUDE.md` ≤ 100 lines + 2 `@`-imports; PROJECTS/TELOS moved to `.claude/rules/` with `paths:` frontmatter |
| Custom security inspector pipeline | CC native `permissions.{allow,ask,deny}` + `autoMode.{hard_deny}` |
| Custom observability JSONL + Pulse | CC native telemetry (`CLAUDE_CODE_ENABLE_TELEMETRY=1` + OTLP); Pulse retained for voice only |
| Mode auto-detection via Sonnet classifier (25s timeouts, fragile) | Same idea, planned reliability fix in P6 |
| Algorithm as a *mode* that auto-triggers | Algorithm as a *skill* you invoke explicitly |
| Startup context ~22.7K tokens (~11% of window before first prompt) | Target ~12-14K tokens |

Full catalog: [DIVERGENCE.md](./DIVERGENCE.md).

## What's the same as upstream

- Skills, subagents, ISA system, the Algorithm doctrine, Fabric integration, Interceptor, the `PAI_SYSTEM_PROMPT.md` constitutional pattern — all preserved.
- Anything CC doesn't do natively: preserved.

## Not the same project as `pai-lite`

[`eccentricnode/pai-lite`](https://github.com/eccentricnode/pai-lite) is the PAI variant for **pi.dev** as substrate (built because pi.dev doesn't have CC's hook system).

**pai-thin** is the PAI variant for **modern Claude Code** as substrate (built because CC now has most of what PAI scaffolded around).

Both exist because PAI's value is in the *ideas* (memory, skills, routing, learning, the Algorithm, ISA), not in any particular implementation. Different substrates get different implementations.

## Roadmap

| Phase | Goal |
|---|---|
| P0 | Fork + meta (this commit) |
| P1 | Audit catalog — every upstream file classified KEEP / REBUILD / DELETE |
| P2 | Delete pass |
| P3 | Native rebuild (hooks → native handler types, memory → auto-memory) |
| P4 | CLAUDE.md surgery |
| P5 | MEMORY.md restructure |
| P6 | Mode classifier reliability fix |
| P7 | Dogfood for 1 week |
| P8 | v0.1 release |

Full plan: [STRATEGY.md](./STRATEGY.md). Phase tracking: [issue #1](../../issues/1).

## Read first

- **[STRATEGY.md](./STRATEGY.md)** — the project's source of truth (audit findings, design principles, implementation plan)
- **[DIVERGENCE.md](./DIVERGENCE.md)** — every meaningful divergence from upstream and why
- **[.github/UPSTREAM_SYNC.md](./.github/UPSTREAM_SYNC.md)** — how to pull canonical PAI updates and triage them
- **[UPSTREAM_README.md](./UPSTREAM_README.md)** — Daniel's original README, preserved

## Credits

Built on [Daniel Miessler](https://danielmiessler.com/)'s [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure). All credit for the original ideas — memory, skills, the Algorithm, ISA, the substrate-agnostic philosophy — goes upstream. This fork is an implementation experiment, not a critique.

## License

Same as upstream (see [LICENSE](./LICENSE)).
