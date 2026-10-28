# Historical prototype — not for merging

This branch preserves the October 20, 2026 two-service experiment, based on
`109b9b8bc132809d5141e23a5894ab82aecd40d1`. It is not the implementation plan
for the newer one-active-account design.

The original working copy and index were not changed. Only the archive copy
of `agentHostAuth.ts` was formatted to satisfy the normal commit hook.
To recover its exact original source text in a separate checkout, extract
`restorePatch` from `ARCHIVE.json` and pass it to `git apply`, then remove
this file and `ARCHIVE.json`.
The resulting source tree is `1d8fb2c97c2980b0e636c592fb785fa46919dc1f`.

Normal signing and commit hooks were used. This archival operation did not
rerun product builds or inference. Runtime binaries, credentials, profiles,
raw logs and private runtime source are not included.
