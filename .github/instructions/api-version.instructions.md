---
description: Read this when changing proposed API in vscode.proposed.*.d.ts files.
applyTo: 'src/vscode-dts/**/vscode.proposed.*.d.ts'
---

The following is only required for proposed API related to chat and languageModel proposals. It's optional for other proposed API, but recommended.

When a proposed API is changed in a non-backwards-compatible way, the version number at the top of the file must be incremented. If it doesn't have a version number, we must add one. The format of the number like this:

```
// version: 1
```

No semver, just a basic incrementing integer. The corresponding version number in the extension's package.json must be incremented to match (you could remind the user of this if you don't have access to the extension code yourself).

An example of a non-backwards-compatible change is removing a non-optional property or changing the type to one that is incompatible with the previous type.

An example of a backwards-compatible change is an additive change or deleting a property that was already optional.
