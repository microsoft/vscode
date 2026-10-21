---
description: Use when adding, updating, or removing npm dependencies (package.json, package-lock.json, .npmrc). Covers the 7-day npm package quarantine of the internal feed, the package age check, and how to request an exception.
applyTo: '{**/package.json,**/package-lock.json,**/.npmrc,build/npm/package-age-exceptions.json}'
---

# npm Dependencies

## The 7-day quarantine

The official build and the **VS Code Dependencies Check** pipeline install npm packages from the internal Azure Artifacts feed, not from npmjs.com. That feed only serves npmjs.com package versions once they are **at least 7 days old**. A pull request that adds a younger version, directly or transitively in any `package-lock.json`, cannot pass the dependencies check or build until the version ages in, even though `npm install` from npmjs.com works locally and in the GitHub PR checks.

Packages published through internal release pipelines (for example `@vscode/*`, `@microsoft/*`, `@github/*`, `typescript`) are mirrored without that delay. These are listed under `packages` in [package-age-exceptions.json](../../build/npm/package-age-exceptions.json).

## Before opening a pull request

After changing any `package.json` or `package-lock.json`, run the package age check from the repository root:

```bash
node build/npm/check-package-age.ts
```

It compares changed lockfiles (including uncommitted ones) against `origin/main`, looks up publish times on npmjs.com, and lists every added version the feed will not serve yet, with the date it becomes available. Some `.npmrc` files (for example `build/.npmrc`) also set `min-release-age=7`, so `npm install` in those folders refuses to resolve versions younger than 7 days (`ETARGET ... with a date before ...`), including internally mirrored packages. Locked versions installed with `npm ci` are not affected.

If the check fails, do not open the pull request as is. Tell the developer which versions are too new and when they become available, then agree on one of these options:

1. **Use an older version** that is at least 7 days old and still contains what is needed.
2. **Wait** until the reported date, then open or re-run the pull request.
3. **Request an exception** if the version is urgent (for example, a security fix).

## Requesting an exception

An exception has two parts. Both are needed:

1. **Feed:** ask the VS Code engineering team, who own the internal feed, to make the exact version available early. Repository changes alone cannot make the feed serve a quarantined version.
2. **Repository:** add the exact version to `versions` in [package-age-exceptions.json](../../build/npm/package-age-exceptions.json) with a reason or a link, for example `"electron@44.9.1": "Security release, approved in <link>"`. Remove the entry once the version is older than 7 days.

To install a version that is younger than 7 days in a folder whose `.npmrc` sets `min-release-age`, override it for that command: `npm install --min-release-age=0 <name>@<version>`.

## Where the check runs

- **GitHub PR checks:** the `Compile & Hygiene` job runs the check against npmjs.com publish times and the exceptions file before installing dependencies.
- **VS Code Dependencies Check (Azure DevOps):** runs the check against the internal feed itself before the install step, so a version the feed already serves always passes. The install step then retries only briefly for transient feed failures.
