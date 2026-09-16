# Product artifact retries

Windows product jobs check their canonical output names before installing dependencies,
compiling, or signing on a job retry. A retry can proceed if none of those names is
associated with the current build. Diagnostic artifacts and other producers' outputs
do not block it.

If any canonical output is already associated, the check fails with its artifact ID
and producing job ID. It does not consider name existence proof of equal content:
rebuilding and re-signing the same source can change the payload. Failed or malformed
artifact-list requests also fail the check rather than treating the build as empty.

This is an early diagnostic, not publication idempotency or a lock. The existing 1ES
publication steps, immutable names, SBOM generation, and security gates remain
authoritative, including if another association appears after the check.

When the check blocks a retry, ask the release owner to assess the existing outputs
and downstream assets. Do not delete or overwrite artifact history, skip publication
only because a name exists, or assume a fresh build ID repairs an already-published
commit-qualified asset. Safe resumption requires validated original outputs and
provenance.

Test diagnostic uploads are suppressed when the preflight fails, because the build
and tests have not run and their directories may not exist. Other build failures
retain the existing diagnostic publication behavior.
