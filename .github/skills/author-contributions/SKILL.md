---
name: author-contributions
description: Identify all files a specific author contributed to on a branch vs its upstream, tracing code through renames. Use when asked who edited what, what code an author contributed, or to audit authorship before a merge. This skill should be run as a subagent — it performs many git operations and returns a concise table.
---

When asked to find all files a specific author contributed to on a branch (compared to main or another upstream), follow this procedure. The goal is to produce a simple table that both humans and LLMs can consume.

## Run as a Subagent

This skill involves many sequential git commands. Delegate it to a subagent with a prompt like:

> Find every file that author "Full Name" contributed to on branch `<branch>` compared to `<upstream>`. Trace contributions through file renames. Return a markdown table with columns: Status (DIRECT or VIA_RENAME), File Path, and Lines (+/-). Include a summary line at the end.

## Procedure

### 1. Identify the author's exact git identity

```bash
git log --format="%an <%ae>" <upstream>..<branch> | sort -u
```

Match the requested person to their exact `--author=` string. Do not guess — short usernames won't match full display names (resolve via `git log` or the GitHub MCP `get_me` tool).

### 2. Collect all files the author directly committed to

```bash
git log --author="<Exact Name>" --format="%H" <upstream>..<branch>
```

For each commit hash, extract touched files:

```bash
git diff-tree --no-commit-id --name-only -r <hash>
```

Union all results into a set (`author_files`).

### 3. Build rename map across the entire branch

For **every** commit on the branch (not just the author's), extract renames:

```bash
git diff-tree --no-commit-id -r -M <hash>
```

Parse lines with `R` status to build a map: `new_path → {old_paths}`.

### 4. Get the merge diff file list

```bash
git diff --name-only <upstream>..<branch>
```

These are the files that will actually land when the branch merges.

### 5. Classify each file in the merge diff

For each file in step 4:
- If it's in `author_files` → **DIRECT**
- Else, walk the rename map transitively (follow chains: current → old → older) and check if any ancestor is in `author_files` → **VIA_RENAME**
- Otherwise → not this author's contribution

### 6. Get diff stats

```bash
git diff --stat <upstream>..<branch> -- <file1> <file2> ...
```

### 7. Return the table

Format the result as a markdown table:

```
| Status | File | +/- |
|--------|------|-----|
| DIRECT | src/vs/foo/bar.ts | +120/-5 |
| VIA_RENAME | src/vs/baz/qux.ts | +300 |
| ... | ... | ... |

**Total: N files, +X/-Y lines**
```

## Important Notes

- **Use Python for the heavy lifting.** Shell loops with inline comments break in zsh. Write a temp `.py` script, run it, then delete it.
- **Author matching is exact.** Always run step 1 first. `--author` does substring matching but you must verify the right person is matched (e.g., don't match "Joshua Smith" when looking for "Josh S."). Use the GitHub MCP `get_me` tool or `git log` output to resolve the correct full name.
- **Renames can be multi-hop.** A file may have moved `contrib/chat/` → `agentSessions/` → `sessions/`. The rename map must be walked transitively.
- **Only report files in the merge diff** (step 4). Files the author touched that were later deleted entirely should not appear — they won't land in the upstream.
- **The rename map must include all authors' commits**, not just the target author's. Other people often do the rename commits (e.g., bulk refactors/moves).

## Example Python Script

```python
import subprocess, os

os.chdir('<repo_root>')
UPSTREAM = 'main'
AUTHOR = '<Author Name>'  # Resolve via `git log` or GitHub MCP `get_me`

# Step 2: author's files
commits = subprocess.check_output(
    ['git', 'log', f'--author={AUTHOR}', '--format=%H', f'{UPSTREAM}..HEAD'],
    text=True).strip().split('\n')
author_files = set()
for h in (c for c in commits if c):
    files = subprocess.check_output(
        ['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', h],
        text=True).strip().split('\n')
    author_files.update(f for f in files if f)

# Step 3: rename map from ALL commits
all_commits = subprocess.check_output(
    ['git', 'log', '--format=%H', f'{UPSTREAM}..HEAD'],
    text=True).strip().split('\n')
rename_map = {}  # new_name -> set(old_names)
for h in (c for c in all_commits if c):
    out = subprocess.check_output(
        ['git', 'diff-tree', '--no-commit-id', '-r', '-M', h],
        text=True, timeout=5).strip()
    for line in out.split('\n'):
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) >= 3 and 'R' in parts[0]:
            rename_map.setdefault(parts[2], set()).add(parts[1])

# Step 4: merge diff
diff_files = subprocess.check_output(
    ['git', 'diff', '--name-only', f'{UPSTREAM}..HEAD'],
    text=True).strip().split('\n')

# Step 5: classify
results = []
for f in (x for x in diff_files if x):
    if f in author_files:
        results.append(('DIRECT', f))
    else:
        # walk rename chain
        chain, to_check = set(), [f]
        while to_check:
            cur = to_check.pop()
            if cur in chain:
                continue
            chain.add(cur)
            to_check.extend(rename_map.get(cur, []))
        chain.discard(f)
        if chain & author_files:
            results.append(('VIA_RENAME', f))

# Step 6: stats
if results:
    stat = subprocess.check_output(
        ['git', 'diff', '--stat', f'{UPSTREAM}..HEAD', '--'] +
        [f for _, f in results], text=True)
    print(stat)

# Step 7: table
for kind, f in sorted(results, key=lambda x: x[1]):
    print(f'| {kind:12s} | {f} |')
print(f'\nTotal: {len(results)} files')
```

### Alternative Script

After following the process above, run this script to cross-check files touched by an author against the branch diff.   You can do this both with an without src/vs/sessions.

```
AUTHOR=""

# 1. Find commits by author on this branch (not on main)
git log main...HEAD --author="$AUTHOR" --format="%H"

# 2. Get unique files touched across all those commits, excluding src/vs/sessions/
git log main...HEAD --author="$AUTHOR" --format="%H" \
  | xargs -I{} git diff-tree --no-commit-id -r --name-only {} \
  | sort -u \
  | grep -v '^src/vs/sessions/'

# 3. Cross-reference with branch diff to keep only files still changed vs main
git log main...HEAD --author="$AUTHOR" --format="%H" \
  | xargs -I{} git diff-tree --no-commit-id -r --name-only {} \
  | sort -u \
  | grep -v '^src/vs/sessions/' \
  | while read f; do git diff main...HEAD --name-only -- "$f" 2>/dev/null; done \
  | sort -u
```
