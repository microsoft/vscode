#!/usr/bin/env bash
#
# sync-upstream.sh — keep the stokd-ide fork cheap to maintain.
#
# This fork is a THIN PATCH on top of upstream VS Code (see SEAM_MANIFEST.md and
# docs/REBASE_RUNBOOK.md). Governing invariant: AX-TERMINAL-AGENT-TABS.
#
#   * `main`             mirrors upstream microsoft/vscode (no stokd commits).
#   * the patch branch   is an ordered, replayable commit stack on top of a
#                        pinned upstream *release tag*.
#
# This script automates the mechanical parts only: wiring the upstream remote,
# fetching, and reporting the next rebase target. It NEVER rewrites history and
# NEVER pushes on its own — it prints the commands for you to run.
#
# Usage:
#   scripts/sync-upstream.sh                 # fetch upstream, report status + next steps
#   scripts/sync-upstream.sh --ff-main       # fast-forward main to upstream/main (then push manually)
#   scripts/sync-upstream.sh --print-tag     # print the latest stable release tag and exit
#
set -euo pipefail

UPSTREAM_URL="https://github.com/microsoft/vscode.git"
UPSTREAM_REMOTE="upstream"
PATCH_BRANCH="${PATCH_BRANCH:-feat/agent-terminal-selector}"

cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

ensure_remote() {
  if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    cyan "Adding remote '$UPSTREAM_REMOTE' -> $UPSTREAM_URL"
    git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
  fi
}

latest_release_tag() {
  # VS Code stable releases are tags like 1.124.2 (MAJOR.MINOR.PATCH).
  git -c 'versionsort.suffix=-' \
    for-each-ref --sort=-version:refname --format='%(refname:short)' \
    'refs/tags/[0-9]*.[0-9]*.[0-9]*' 2>/dev/null | head -1
}

ensure_remote

if [[ "${1:-}" == "--print-tag" ]]; then
  git fetch --quiet --tags "$UPSTREAM_REMOTE" || true
  latest_release_tag
  exit 0
fi

cyan "Fetching $UPSTREAM_REMOTE (only new objects download — the fork shares SHAs with upstream)…"
git fetch --tags "$UPSTREAM_REMOTE"

TAG="$(latest_release_tag)"
cyan "Latest upstream stable release tag: ${TAG:-<none found>}"

if [[ "${1:-}" == "--ff-main" ]]; then
  cyan "Fast-forwarding main to $UPSTREAM_REMOTE/main (non-destructive; aborts if not a fast-forward)…"
  git checkout main
  git merge --ff-only "$UPSTREAM_REMOTE/main"
  yellow "Done. Review, then: git push origin main"
  exit 0
fi

cat <<EOF

Next steps (run manually — this script does not push or rewrite history):

  1) Update the mirror branch to latest upstream:
       scripts/sync-upstream.sh --ff-main && git push origin main

  2) Replay the patch stack onto the pinned release tag:
       git checkout $PATCH_BRANCH
       git rebase --onto ${TAG:-<tag>} \$(git merge-base $PATCH_BRANCH main) $PATCH_BRANCH
     Only the single 'seam' commit touching terminalView.ts can conflict — every
     other change is new files under .../terminal/browser/agentTabs/.

  3) Re-verify each entry in SEAM_MANIFEST.md, then prove the seam + model:
       scripts/verify-seam.sh
       node --import tsx --test src/vs/workbench/contrib/terminal/browser/agentTabs/test/agentTerminalSelectorModel.test.ts

  4) Optional full build (heavy):
       npm ci && npm run compile

EOF
