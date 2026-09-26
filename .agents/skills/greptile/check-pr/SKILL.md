---
name: check-pr
description: >
  Checks a GitHub, GitLab, or Perforce (p4) pull request (or merge request, or shelved changelist)
  for unresolved review comments, failing status checks, and incomplete PR descriptions. Waits for
  pending checks to complete, categorizes issues as actionable or informational, and optionally fixes
  and resolves them. Use when the user wants to check a PR/MR/CL, address review feedback, or prepare
  a change for submission.
license: MIT
compatibility: Requires git and gh (GitHub CLI), glab (GitLab CLI), or p4 (Perforce CLI) installed and authenticated.
metadata:
  author: greptileai
  version: "1.3"
allowed-tools: Bash(gh:*) Bash(glab:*) Bash(git:*) Bash(p4:*)
---

# Check PR

Analyze a pull request (GitHub), merge request (GitLab), or shelved changelist (Perforce) for review comments, status checks, and description completeness, then help address any issues found.

## Inputs

- **PR/MR/CL number** (optional): If not provided, detect the PR/MR for the current branch, or the default pending changelist for p4.

## Instructions

### 0. Detect platform

First check if the user is working in a Perforce depot by looking for a `.p4config` file or `P4CLIENT`/`P4PORT` environment variables:

```bash
# Check for Perforce environment
if p4 info >/dev/null 2>&1; then
  VCS="perforce"
else
  # Fall back to git remote detection
  REMOTE_URL=$(git remote get-url origin)
  if echo "$REMOTE_URL" | grep -qi "gitlab"; then
    VCS="gitlab"
  else
    VCS="github"
  fi
fi
```

For self-hosted GitLab instances whose hostname doesn't contain "gitlab", the user can override by passing `--vcs gitlab` as an input. For Perforce, the user can override by passing `--vcs perforce`.

### 1. Identify the PR/MR/CL

If a number was provided, use it. Otherwise, detect it:

**GitHub:**
```bash
gh pr view --json number -q .number
```

**GitLab:**
```bash
glab mr view --output json | jq '.iid'
```

**Perforce:**
```bash
# List pending changelists for the current user/client
p4 changes -s pending -u $P4USER -c $P4CLIENT
```

Key field differences between platforms:
- GitHub: `number`, `headRefName`, `headRefOid`
- GitLab: `iid`, `source_branch`, `sha`
- Perforce: changelist number (CL), `shelved` files for in-review CLs

### 2. Fetch PR/MR/CL details

**GitHub:**
```bash
gh pr view <PR_NUMBER> --json title,body,state,reviews,comments,headRefName,statusCheckRollup
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments
gh api --paginate "repos/{owner}/{repo}/issues/<PR_NUMBER>/comments?per_page=100"
```

GitHub PRs are also issues, so general PR comments live on the issue comments endpoint. Greptile may edit a single general PR comment on each review cycle instead of creating a new review or comment. Always inspect the latest Greptile-authored general comment by `updated_at`, including any "Prompt to fix all with AI" section, before concluding that the PR is clear.

**GitLab:**
```bash
glab mr view <MR_IID> --output json
# Fetch discussions (inline diff comments are type "DiffNote"; general comments have null type)
glab api "projects/:fullpath/merge_requests/<MR_IID>/discussions"
```

For GitLab, paginate discussions if needed (add `?per_page=100&page=N`).

**Perforce:**
```bash
# Get changelist description, files, and status
p4 describe -s <CL_NUMBER>

# Get shelved files (for in-review CLs)
p4 describe -S <CL_NUMBER>

# Get the diff of the shelved changelist
p4 diff2 //...@=<CL_NUMBER> //...@=<CL_NUMBER>

# List review comments (if using p4 review workflow)
p4 review -c <CL_NUMBER>
```

Key Perforce CL fields:
- `Change`: changelist number
- `Status`: `pending`, `submitted`, `shelved`
- `Description`: the CL description / commit message
- `Files`: list of files in the CL

### 3. Wait for pending checks

Before analyzing, ensure all status checks have completed. If any checks are `PENDING` or `IN_PROGRESS` (GitHub) / `running` or `pending` (GitLab), poll every 30 seconds until all checks reach a terminal state.

**GitHub:** poll `statusCheckRollup` from `gh pr view`.

**GitLab:**
```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/pipelines"
```
Pipeline statuses: `running`, `pending`, `success`, `failed`, `canceled`, `skipped`. Poll until no pipeline has `running` or `pending` status.

**Perforce:** Perforce doesn't have built-in CI checks natively. If the team uses a review tool (Swarm, etc.) or an external CI triggered by shelve events, check the relevant system. Otherwise, proceed to analysis immediately.

### 4. Analyze the PR/MR

Once all checks are complete, evaluate these areas:

#### A. Status Checks

- Are all CI checks passing?
- If any are failing, identify which ones and the failure reason.

#### B. PR/MR Description

- Is the description complete and follows team conventions?
- Are all required sections filled in?
- Are there TODOs or placeholders that need updating?

#### C. Review Comments

- Inline code review comments that need addressing
- Look for bot review comments (e.g. from `greptile-apps[bot]` on GitHub, or the Greptile bot user on GitLab, linters, etc.)
- Human reviewer comments
- **Perforce:** review comments from `p4 review` or external review tools

#### D. General Comments

- Discussion comments on the PR/MR
- For GitHub, check the issue comments endpoint and use `updated_at` to catch bot comments edited in place. Greptile's latest edited summary can contain actionable items even when there are no new inline comments.
- Bot comments (deploy previews, etc.) — usually informational
- **Perforce:** CL description should include a clear summary, affected files rationale, and testing notes

### 5. Categorize issues

For each issue found, categorize as:

| Category | Meaning |
|---|---|
| **Actionable** | Code changes, test improvements, or fixes needed |
| **Informational** | Verification notes, questions, or FYIs that don't require changes |
| **Already addressed** | Issues that appear to be resolved by subsequent commits |

### 6. Report findings

Present a summary table:

| Area | Issue | Status | Action Needed |
|------|-------|--------|---------------|
| Status Checks | CI build failing | Failing | Fix type error in `src/api.ts` |
| Review | "Add null check" — @reviewer | Actionable | Add guard clause |
| Description | TODO placeholder in test plan | Actionable | Fill in test plan |
| Review | "Looks good" — @teammate | Informational | None |

### 7. Fix issues (if requested)

If there are actionable items:

1. Switch to the PR/MR's branch (git) or ensure files are open in the correct CL (Perforce) if not already.
2. Ask the user if they want to fix the issues.
3. If yes, make the fixes, then:

**GitHub/GitLab:** commit and push:
```bash
git add <files>
git commit -m "address review feedback"
git push
```

**Perforce:** open files for edit, make changes, and re-shelve:
```bash
p4 edit <file>
# make changes
p4 shelve -f -c <CL_NUMBER>
```

### 8. Resolve review threads

After addressing comments, resolve the corresponding review threads.

**Perforce** — Perforce does not have a native "resolve thread" concept. Instead, mark comments as addressed by updating the CL description or by responding in the review tool being used (Swarm, etc.). If using `p4 review`:

```bash
# Mark files as reviewed after addressing feedback
p4 review -c <CL_NUMBER>
```

**GitHub** — fetch unresolved thread IDs (paginate if needed — see [the GraphQL reference](references/graphql-queries.md)):

```bash
gh api graphql -f query='
query($cursor: String) {
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes { body path }
          }
        }
      }
    }
  }
}'
```

If `hasNextPage` is true, repeat with `-f cursor=ENDCURSOR` to get remaining threads.

Then resolve threads that have been addressed or are informational:

```bash
gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "THREAD_ID"}) {
    thread { isResolved }
  }
}'
```

Batch multiple resolutions into a single mutation using aliases (`t1`, `t2`, etc.).

**GitLab** — fetch unresolved discussions (see [the GitLab API reference](references/gitlab-api.md)):

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/discussions?per_page=100"
```

Filter for discussions where `"resolved": false`. Collect each discussion's `id`.

Resolve each discussion individually (GitLab has no batch resolution):

```bash
glab api --method PUT \
  "projects/:fullpath/merge_requests/<MR_IID>/discussions/<DISCUSSION_ID>" \
  --field resolved=true
```

Repeat for each unresolved discussion ID.

### 9. Multiple PRs/MRs/CLs

If checking a chain of PRs/MRs/CLs, process them sequentially.

**Perforce** — to check multiple changelists at once:
```bash
p4 changes -s pending -u $P4USER -c $P4CLIENT -l
```

## Output format

Summarize:
- PR/MR/CL title or description and current state
- Platform detected (GitHub / GitLab / Perforce)
- Status checks summary (passing/failing/pending) — or N/A for Perforce
- Total issues found
- Actionable items with descriptions
- Items that can be ignored with reasons
- Recommended next steps
