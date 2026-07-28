---
description: Guidelines for creating git commits — respecting signing configuration, verification hooks, and referencing GitHub issues.
applyTo: '**'
---

# Committing

Follow these rules when creating git commits unless explicitely requested otherwise by the user:

- Always respect the user's commit signing configuration. Do not disable, override, or work around signing (for example, do not pass `--no-gpg-sign` when the user has signing enabled).
- Never commit with `--no-verify`. Always let the pre-commit and commit-msg hooks run.
