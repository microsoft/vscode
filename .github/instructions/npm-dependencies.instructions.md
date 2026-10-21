---
description: Use when adding, updating, or removing npm dependencies (package.json, package-lock.json, .npmrc). Covers the 7-day npm package quarantine of the internal feed and how to request an exception.
applyTo: '{**/package.json,**/package-lock.json,**/.npmrc}'
---

# npm Dependencies

## The 7-day quarantine

The official build and the **VS Code Dependencies Check** pipeline install npm packages from the internal Azure Artifacts feed, not from npmjs.com. That feed only serves npmjs.com package versions once they are **at least 7 days old**. A pull request that adds a younger version, directly or transitively in any `package-lock.json`, cannot pass the dependencies check or build until the version ages in, even though `npm install` from npmjs.com works locally and in the GitHub PR checks. The dependencies check then fails after about an hour of retries, with `ETARGET` or 404 errors for the missing version.

Packages published through internal release pipelines (for example `@vscode/*`, `@microsoft/*`, `@github/*`, `typescript`) are mirrored without that delay.

## Before opening a pull request

After adding or bumping a third-party npm dependency, check when the versions added to `package-lock.json` were published:

```bash
npm view <name> time.<version>
```

Some `.npmrc` files (for example `build/.npmrc`) also set `min-release-age=7`, so `npm install` in those folders refuses to resolve versions younger than 7 days (`ETARGET ... with a date before ...`). To install a younger version there, for example an internally mirrored package, override it for that command: `npm install --min-release-age=0 <name>@<version>`.

If a version is younger than 7 days, do not open the pull request as is. Tell the developer which versions are too new and when they become available, then agree on one of these options:

1. **Use an older version** that is at least 7 days old and still contains what is needed.
2. **Wait** until the version is 7 days old, then open or re-run the pull request.
3. **Request an exception** if the version is urgent (for example, a security fix): ask the VS Code engineering team, who own the internal feed, to make the exact version available early.
