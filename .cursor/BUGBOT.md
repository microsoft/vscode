# Bugbot Rules — Solo

## Project context

Solo is a Cursor-like standalone AI editor, forked from VS Code (microsoft/vscode).
TypeScript + Electron, uses npm, builds with gulp and custom build scripts.

## Review priorities

- Sessions and agent integration code in `src/vs/sessions/`
- Chat and copilot extension code in `extensions/copilot/`
- Build system changes in `build/`
- Electron main process changes
- Security: no secret exposure, no unsafe IPC patterns

## Ignore

- Upstream VS Code files that haven't been modified from the fork base
- Generated files, lockfile-only changes
- `.github/workflows/` changes (managed centrally)
- Test snapshot updates
