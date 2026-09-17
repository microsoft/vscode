---
name: commit
description: Commit staged or unstaged changes with an AI-generated commit message that matches the repository's existing commit style. Use when the user asks to 'commit', 'commit changes', 'create a commit', 'save my work', or 'check in code'.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Commit Changes

Help the user commit code changes with a well-crafted commit message derived from the diff, following the conventions already established in the repository.

## Guidelines

- **Never amend existing commits** without asking.
- **Never force-push or push** without explicit user approval.
- **Never skip pre-commit hooks** (do not use `--no-verify`).
- **Never skip signing commits** (do not use `--no-gpg-sign`).
- **Never revert, reset, or discard user changes** unless the user explicitly asked for that.
- Check for obvious secrets or generated artifacts that should not be committed. If something looks risky - ask the user.
- When in doubt about staging, convention, or message content — ask the user.

## Workflow

### 1. Discover the repository's commit convention

Run the following to sample recent commits and the user's own commits:

```
# Recent repo commits (for overall style)
git log --oneline -20

# User's recent commits (for personal style)
git log --oneline --author="$(git config user.name)" -10
```

Analyse the output to determine the commit message convention used in the repository (e.g. Conventional Commits, Gitmoji, ticket-prefixed, free-form). All generated messages **must** follow the detected convention.

### 2. Check repository status

```
git status --short
```

- If there are **no changes** (working tree clean, nothing staged), inform the user and stop.
- If there are **staged changes**, proceed with those and do not stage any unstaged changes.
- If there are **only unstaged changes**, stage everything (`git add -A`), and proceed with those.

### 3. Generate the commit message

Obtain the full diff of what will be committed:

```bash
git diff --cached --stat
git diff --cached
```

Using the diff and the commit convention detected in step 1, draft a commit message with:

- A **subject line** (≤ 72 characters) that summarises the change, following the repository's convention.
- An optional **body** that explains *why* the change was made, only when the diff is non-trivial.
- Reference issue/ticket numbers when they appear in branch names or related context.
- Focus on the intent of the change, not a file-by-file inventory.

### 4. Commit

Construct the `git commit` command with the generated message.

Execute the commit:

```
git commit -m "<subject>" -m "<body>"
```

### 5. Confirm

After the commit:

- Run `git status --short` to confirm the commit completed.
- Run `git log --oneline -1` to show the new commit.
- If pre-commit hooks changed files or blocked the commit, summarize exactly what happened.
- If hooks rewrote files after the commit attempt, do not amend automatically. Tell the user what changed and ask whether they want you to stage and commit those follow-up edits.
