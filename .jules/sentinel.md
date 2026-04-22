## 2026-04-19 - Command Injection in freePortKillProcess
**Vulnerability:** The `port` string extracted via regex from the terminal output was passed directly into a `child_process.exec()` call (`netstat -ano | findstr "${port}"` or `lsof -nP -iTCP -sTCP:LISTEN | grep ${port}`). An attacker who could inject text into the terminal matching the regex could supply a malicious port string like `8080; touch /tmp/pwned` to achieve arbitrary code execution.
**Learning:** Even internal RPC functions processing regex matches from known outputs can be vulnerable to injection if the underlying regex is loose or if the input isn't explicitly sanitized before being passed to shell commands.
**Prevention:** Always use strict validation (e.g., `/^\d+$/`) on parameters before inserting them into `exec()` or use `execFile()` to bypass the shell completely.

## 2026-04-20 - Command Injection in Process Utilities
**Vulnerability:** Command injection was possible in `src/vs/base/node/ps.ts` where unvalidated array elements (PIDs) and paths were interpolated or directly passed into `child_process.exec`.
**Learning:** Developers attempted to sanitize dynamic inputs by passing paths through `JSON.stringify()`, expecting it to escape spaces. However, double quotes do not prevent shell evaluation like `$()` command substitution, maintaining the injection vector.
**Prevention:** Always refactor to `child_process.execFile` when working with system commands. It bypasses the shell completely, eliminating the injection class entirely while robustly handling paths with spaces natively without hacky string-escaping.
