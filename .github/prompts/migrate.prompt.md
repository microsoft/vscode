---
agent: agent
tools:
  [
    "github/add_issue_comment",
    "github/get_label",
    "github/get_me",
    "github/issue_read",
    "github/issue_write",
    "github/search_issues",
    "github/search_pull_requests",
    "github/search_repositories",
    "github/sub_issue_write",
  ]
---

# Issue Migration Prompt

Use this prompt when migrating issues from one GitHub repository to another (e.g., from `microsoft/vscode-copilot` to `microsoft/vscode`).

## Input Methods

You can specify which issues to migrate using **any** of these three methods:

### Option A: GitHub Search Query URL

Provide a full GitHub issues search URL. **All matching issues will be migrated.**

```
https://github.com/microsoft/vscode-copilot/issues?q=is%3Aissue+is%3Aopen+assignee%3Ayoyokrazy
```

### Option B: GitHub Search Query Parameters

Provide search query syntax for a specific repo. **All matching issues will be migrated.**

```
repo:microsoft/vscode-copilot is:issue is:open assignee:yoyokrazy
```

Common query filters:

- `is:issue` / `is:pr` - Filter by type
- `is:open` / `is:closed` - Filter by state
- `assignee:USERNAME` - Filter by assignee
- `author:USERNAME` - Filter by author
- `label:LABEL` - Filter by label
- `milestone:MILESTONE` - Filter by milestone

### Option C: Specific Issue URL

Provide a direct link to a single issue. **Only this issue will be migrated.**

```
https://github.com/microsoft/vscode-copilot/issues/12345
```

## Task

**Target Repository:** `{TARGET_REPO}`

Based on the input provided, migrate the issue(s) to the target repository following all requirements below.

## Requirements

### 1. Issue Body Format

Create the new issue with this header format:

```markdown
_Transferred from {SOURCE_REPO}#{ORIGINAL_ISSUE_NUMBER}_
_Original author: `@{ORIGINAL_AUTHOR}`_

---

{ORIGINAL_ISSUE_BODY}
```

### 2. Comment Migration

For each comment on the original issue, add a comment to the new issue:

```markdown
_`@{COMMENT_AUTHOR}` commented:_

---

{COMMENT_BODY}
```

### 3. CRITICAL: Preventing GitHub Pings

**ALL `@username` mentions MUST be wrapped in backticks to prevent GitHub from sending notifications.**

✅ Correct: `` `@username` ``
❌ Wrong: `@username`

This applies to:

- The "Original author" line in the issue body
- Any `@mentions` within the issue body content
- The comment author attribution line
- Any `@mentions` within comment content
- Any quoted content that contains `@mentions`

### 4. CRITICAL: Issue/PR Link Reformatting

**Issue references like `#12345` are REPO-SPECIFIC.** If you copy `#12345` from the source repo to the target repo, it will incorrectly link to issue 12345 in the _target_ repo instead of the source.

**Convert ALL `#NUMBER` references to full URLs:**

✅ Correct: `https://github.com/microsoft/vscode-copilot/issues/12345`
✅ Also OK: `microsoft/vscode-copilot#12345`
❌ Wrong: `#12345` (will link to wrong repo)

This applies to:

- Issue references in the body (`#12345` → full URL)
- PR references in the body (`#12345` → full URL)
- References in comments
- References in quoted content
- References in image alt text or links

**Exception:** References that are _already_ full URLs should be left unchanged.

### 5. Metadata Preservation

- Copy all applicable labels to the new issue
- Assign the new issue to the same assignees (if they exist in target repo)
- Preserve the issue title exactly

### 5. Post-Migration

After creating the new issue and all comments:

- Add a comment to the **original** issue linking to the new issue:
  ```markdown
  Migrated to {TARGET_REPO}#{NEW_ISSUE_NUMBER}
  ```
- Close the original issue as not_planned

## Example Transformation

### Original Issue Body (in `microsoft/vscode-copilot`):

```markdown
I noticed @johndoe had a similar issue in #9999. cc @janedoe for visibility.

Related to #8888 and microsoft/vscode#12345.

Steps to reproduce:

1. Open VS Code
2. ...
```

### Migrated Issue Body (in `microsoft/vscode`):

```markdown
_Transferred from microsoft/vscode-copilot#12345_
_Original author: `@originalauthor`_

---

I noticed `@johndoe` had a similar issue in https://github.com/microsoft/vscode-copilot/issues/9999. cc `@janedoe` for visibility.

Related to https://github.com/microsoft/vscode-copilot/issues/8888 and microsoft/vscode#12345.

Steps to reproduce:

1. Open VS Code
2. ...
```

Note: The `microsoft/vscode#12345` reference was already a cross-repo link, so it stays unchanged.

## Checklist Before Migration

- [ ] Confirm input method (query URL, query params, or specific issue URL)
- [ ] Confirm target repository
- [ ] If using query: verify the query returns the expected issues
- [ ] Verify all `@mentions` are wrapped in backticks
- [ ] Verify all `#NUMBER` references are converted to full URLs
- [ ] Decide whether to close original issues after migration
