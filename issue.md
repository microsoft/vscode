# Pre-commit hook fails in a loop

The pre-commit hook is failing in a loop. The error message is `TypeError: filter is not a function` in `build/hygiene.js:310:44`.

## Steps to reproduce:
1. Make a change to a file.
2. Commit the change.
3. The pre-commit hook will fail.
