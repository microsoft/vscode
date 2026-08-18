# Code-OSS Upstream Provenance

This document records the exact upstream provenance of the code in this repository.
No information is fabricated: every value below is taken directly from the live
repository state and the upstream `microsoft/vscode` GitHub API.

## Upstream repository

```
https://github.com/microsoft/vscode
```

## Upstream commit (base of this fork)

The `main` branch HEAD of this repository is a **verbatim** commit from
`microsoft/vscode`. There are **no fork-specific modifications** on `main`.

```
Upstream commit: c780ea96132b1cabf170a454aced493d8317eee7
Author:          Vijay Upadya
Author date:     2026-08-08T06:23:28Z
Commit message:  New TAS assignments endpoint updates (lifecycle, readiness, disposal) (#329736)
```

Verification: `GET https://api.github.com/repos/microsoft/vscode/commits/c780ea96132b1cabf170a454aced493d8317eee7`
returns HTTP 200 with the same SHA and message, confirming the commit exists in
the upstream repository.

## Upstream version

```
Package name (package.json): code-oss-dev
Package version:             1.133.0
Product (product.json):     Code - OSS
```

## Import date

```
Fork repository created_at:  2026-08-08T07:29:20Z
Fork parent (GitHub):       microsoft/vscode
Default branch:              main
```

The fork was created on GitHub on 2026-08-08, pointing at the upstream commit
above. Import date: **2026-08-08**.

## Current GitCortex repository

```
https://github.com/Frankenstein-dev197/vscode
```

## Modifications already present in Frankenstein-dev197/vscode at import time

**None.** The working tree on `main` is clean and identical to the upstream
commit `c780ea96132b1cabf170a454aced493d8317eee7`. GitCortex modifications will
be applied on top of this commit in subsequent phases, tracked separately.

## Node.js / toolchain (as required by the upstream repository)

```
.nvmrc:         24.18.0
Lockfile:       package-lock.json (lockfileVersion 3)
Build system:    gulp (npm scripts: compile, compile-build, watch)
```

The upstream `preinstall` script (`build/npm/preinstall.ts`) enforces that the
running Node.js major version matches `.nvmrc` (major 24, >= 24.18.0).
