---
agent: agent
tools: ['edit', 'search', 'runCommands', 'fetch', 'todos']
---

# Add My Contributions to CODENOTIFY

This prompt helps you add your code contributions to the `.github/CODENOTIFY` file based on git blame history.

## Instructions

**Before running this prompt, provide the following information:**

1. **Your GitHub handle:** (e.g., `@YOURHANDLE`)
2. **Alternative usernames in git blame:** (e.g., `Erich Gamma`, `ALIAS@microsoft.com`, or any other names/emails that might appear in git commits)

## What This Prompt Does

This prompt will:
1. Search through the repository's git blame history for files you've significantly contributed to
2. Analyze which files and directories have your contributions
3. **Follow the existing structure** in the `.github/CODENOTIFY` file, here are some examples:
   - `src/vs/base/common/**` → Add to **Base Utilities** section
   - `src/vs/base/browser/ui/**` → Add to **Base Widgets** section
   - `src/vs/base/parts/**` → Add to **Base Utilities** section
   - `src/vs/platform/**` → Add to **Platform** section
   - `src/bootstrap-*.ts`, `src/main.ts`, etc. → Add to **Bootstrap** section
   - `src/vs/code/**` → Add to **Electron Main** section
   - `src/vs/workbench/services/**` → Add to **Workbench Services** section
   - `src/vs/workbench/common/**`, `src/vs/workbench/browser/**` → Add to **Workbench Core** section
   - `src/vs/workbench/contrib/**` → Add to **Workbench Contributions** section
   - `src/vs/workbench/api/**` → Add to **Workbench API** section
   - `extensions/**` → Add to **Extensions** section
4. Add appropriate entries in the format:
   - Individual files: `path/to/file.ts @yourusername`
   - Directories: `path/to/directory/** @yourusername`
5. Place entries within existing sections, maintaining alphabetical or logical order
6. Create new sections only if contributions don't fit existing categories
7. Avoid duplicating existing entries

## Expected Output Format

Entries will be added to **existing sections** based on their path. For example:

```
# Base Utilities
src/vs/base/common/extpath.ts @bpasero
src/vs/base/common/oauth.ts @yourusername  # ← Your contribution added here
src/vs/base/parts/quickinput/** @yourusername  # ← Your contribution added here

# Platform
src/vs/platform/quickinput/** @yourusername  # ← Your contribution added here
src/vs/platform/secrets/** @yourusername  # ← Your contribution added here

# Workbench Services
src/vs/workbench/services/authentication/** @yourusername  # ← Your contribution added here

# Workbench Contributions
src/vs/workbench/contrib/authentication/** @yourusername  # ← Your contribution added here
src/vs/workbench/contrib/localization/** @yourusername  # ← Your contribution added here
```

If you have contributions that don't fit existing sections (e.g., `foo/bar/**`), new sections can be created at the end:

```
# Foo Bar
foo/bar/baz/** @yourusername
foo/bar/biz/** @yourusername
```

## Notes

- **CRITICAL**: Entries must be added to the appropriate existing section based on their path
- Respect the existing organizational structure of the CODENOTIFY file
- If you're already listed for certain files/directories, those won't be duplicated
- Use `**` wildcard for directories where you've touched multiple files
- Maintain alphabetical or logical order within each section

---

**Now, provide your GitHub handle and any alternative usernames found in git blame, and I'll help you update the CODENOTIFY file.**
