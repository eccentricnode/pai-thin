# Upstream sync — how to pull canonical PAI updates

> Per `reference_pai-no-upstream-pull-mechanism.md` in Austin's memory: PAI has no built-in upstream-pull. pai-thin is an active fork, so we roll our own. This file is the canonical procedure.

---

## Background

- **Origin:** `eccentricnode/pai-thin` (this repo)
- **Upstream:** `danielmiessler/Personal_AI_Infrastructure` (canonical PAI)
- **Default branch:** `main`
- **Last upstream sync:** see `DIVERGENCE.md` header

The two repos diverge by design — pai-thin deletes scaffolding that CC now provides natively. A naive `git pull upstream main` would re-introduce that scaffolding and conflict with our restructured files. The procedure below avoids that.

---

## Procedure

### 1. Check what changed upstream

```bash
git fetch upstream
git log --oneline HEAD..upstream/main
```

If empty: nothing to sync, done.

### 2. Categorize each upstream commit

Walk every commit since the last sync. Tag each one:

| Tag | Action |
|---|---|
| **REPLACED** | We've already replaced this surface (see `DIVERGENCE.md`). Ignore the upstream change. |
| **STILL-MATCHES** | We haven't diverged from this surface yet. Cherry-pick or merge. |
| **CONFLICT** | Upstream changed a surface we've already restructured. Read it; decide case-by-case. |
| **BLOCKED** | Upstream change depends on something we deleted. Skip; note in DIVERGENCE.md. |

Record the verdict per commit in `DIVERGENCE.md` under "Upstream changes not yet triaged" before applying anything.

### 3. Apply the STILL-MATCHES set

For commits cleanly tagged STILL-MATCHES, cherry-pick:

```bash
git cherry-pick <commit-sha>
```

Resolve any conflicts that surface (often whitespace / nearby edits, even on surfaces we haven't restructured).

### 4. Update `DIVERGENCE.md`

- Bump the "Last upstream sync" line to the new HEAD of `upstream/main`.
- Update the "Last reviewed" date.
- Move any newly-triaged commits out of the "not yet triaged" section.

### 5. Test before pushing

```bash
# Boot a normal Claude Code session against this repo state
# Verify startup context size hasn't regressed
# Verify hook count hasn't regressed
# Verify any of our keep/rebuild/delete invariants
```

### 6. Push

```bash
git push origin main
```

Tag the sync if it's substantial:

```bash
git tag -a sync-2026-MM-DD -m "Pulled upstream commits A..B"
git push origin sync-2026-MM-DD
```

---

## When to do this

- **Quarterly minimum.** Even if no specific change is wanted, a sync forces triage and surfaces drift.
- **Whenever upstream ships a feature you care about.** Watch the upstream release notes / Daniel's blog.
- **Whenever upstream releases a major version bump.** Don't wait — the longer between syncs, the harder triage becomes.

---

## What NOT to do

- ❌ `git pull upstream main` without triage. This will re-introduce surfaces we've intentionally deleted.
- ❌ `git rebase upstream/main`. Same problem, larger blast radius.
- ❌ Cherry-pick without updating `DIVERGENCE.md`. The catalog rot is the failure mode that ends the project.
- ❌ Apply STILL-MATCHES commits without testing — even non-divergent surfaces can have surprising interactions with pai-thin's restructure.

---

## Future automation

P-eventual: a script at `Tools/upstream-triage.ts` that walks `git log HEAD..upstream/main`, cross-references each commit's touched paths against `DIVERGENCE.md`, and emits a draft triage table. Not in the v0.1 scope.
