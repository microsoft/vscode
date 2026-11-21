---
name: ci-artifact-testing
description: Use when validating an upstream pull request or dependency fix against VS Code tests using GitHub Actions CI build artifacts instead of building locally. Covers finding compatible binaries, verifying PR and merge-commit provenance, selecting a candidate runtime or build, comparing unchanged regression tests, and restoring the baseline.
---

# Test with CI artifacts

Prefer an existing compatible CI build when checking whether an upstream change fixes a downstream regression. A successful upstream workflow is not proof that the VS Code scenario passes: run the downstream test with the candidate artifact.

This workflow applies to runtime executables, native libraries, SDK packages, and packaged applications. Use the relevant [integration-test](../integration-tests/SKILL.md), [unit-test](../unit-tests/SKILL.md), or [smoke-test](../smoke-tests/SKILL.md) workflow for execution. For Azure-hosted artifacts, use [azure-pipelines](../azure-pipelines/SKILL.md) for discovery and retrieval; the provenance and comparison rules below still apply.

## 1. Identify the candidate before building

- Record the upstream repository, PR number, exact head SHA, and intended regression. Record the downstream checkout revision and bundled dependency version.
- Check CI artifacts before cloning, installing dependencies, or starting a local build. Inspect the producer workflow when artifact names or packaging are unclear.
- Execute only artifacts from an authorized source. Treat PR binaries as code execution, use isolated test state, and do not supply live credentials to a deterministic replay test.

GitHub Actions discovery example (replace the illustrative values):

```bash
repo=owner/repository
pr=123
gh pr view "$pr" --repo "$repo" \
  --json url,state,headRefOid,baseRefOid
head_sha=$(gh pr view "$pr" --repo "$repo" \
  --json headRefOid --jq .headRefOid)
gh api --paginate \
  "repos/$repo/actions/runs?head_sha=$head_sha&per_page=100" \
  --jq '.workflow_runs[] | {id,name,event,status,conclusion,head_sha,html_url}'
```

Select a run that produced the relevant build, not just a lint or test-report artifact:

```bash
run_id=123456
gh api --paginate \
  "repos/$repo/actions/runs/$run_id/artifacts?per_page=100" \
  --jq '.artifacts[] | {id,name,size_in_bytes,expired,digest,workflow_run}'
```

List artifacts for the selected run rather than relying on the repository-wide latest-artifacts page. Busy repositories can push the desired artifact off that page. For reusable or downstream workflows, follow the producer relationship and verify the source revision instead of assuming its run uses the PR head.

If no compatible, unexpired artifact is accessible, say why and use the upstream's supported local build workflow. Do not silently substitute another revision or bypass access restrictions.

## 2. Verify provenance and download the smallest complete artifact

Check the producer job, OS, architecture, ABI/libc, build profile, and required package layout. A runtime-specific artifact may be sufficient; a full application archive is unnecessary when the test supports replacing just that runtime.

```bash
artifact_name=exact-name-from-the-run
artifact_dir=$(mktemp -d "${TMPDIR:-/tmp}/vscode-ci-artifact.XXXXXX")
gh run download "$run_id" --repo "$repo" \
  --name "$artifact_name" --dir "$artifact_dir"
```

- Record the run URL, artifact ID/name, and available digest. Inspect embedded build metadata and record hashes of the binaries actually selected.
- Do not equate the workflow's `head_sha` with the compiled source revision. PR CI often builds a synthetic merge commit. Read the artifact metadata or checkout/build logs and verify that merge includes the intended head:

  ```bash
  source_sha=full-source-sha-from-build-metadata
  gh api "repos/$repo/commits/$source_sha" \
    --jq '{sha,parents:[.parents[].sha],message:.commit.message}'
  ```

  If it is a merge build, record both its source SHA and the PR head. Do not describe it as an exact-head-only build. Stop or qualify the result when source provenance cannot be established.
- Keep matching executables, native libraries, and required resources together from the same build. Replacing a launcher while retaining an old implementation library does not test the fix.
- Archives may lose executable permissions or use staging filenames rather than installed names. Restore permissions only on identified executables, and reproduce the documented runtime layout. For example, a launcher expecting sibling `runtime.node` cannot load an artifact stored only under a platform-suffixed name; verify that contract before adding a local alias. Missing libraries are setup failures, not regression results.

## 3. Select the artifact without changing the test's meaning

Use the supported executable-path override, package-install mechanism, or build-target selector. Inspect the downstream launch path to establish which component it replaces and which host/SDK components remain bundled.

For Agent Host tests, follow [agent-host-e2e-tests](../agent-host-e2e-tests/SKILL.md). Prefer an existing provider configuration or test-target seam. If a temporary harness hook is necessary, limit it to selecting the candidate through the supported configuration and apply it before provider startup. Track it explicitly and remove it afterward.

- Keep assertions, prompts, fixtures, policy transitions, and lifecycle steps identical between baseline and candidate.
- Do not add a restart, retry away the failure, accept stale output, or weaken an assertion to make the candidate pass.
- Keep replay strict. Fixture or protocol incompatibility is a separate failure to investigate, not permission to hand-edit recordings or silently use live services.
- Keep dependency manifests, lockfiles, shared installs, and machine settings unchanged unless their modification is specifically part of the requested validation.
- Confirm the launched executable/library or build identity. A configured path alone is weaker evidence than confirmation of what the process loaded.

## 4. Compare observable behavior

1. Run the smallest existing test that reproduces the original symptom against the bundled baseline. Record its actual failure; a startup error or fixture mismatch is not the original regression.
2. Run the same test with the candidate selected. Explicitly enable a known-issue test when needed so a skipped case cannot be reported as passing.
3. Run adjacent controls covering behavior that must remain intact. Repeat lifecycle- or timing-sensitive scenarios at least twice.
4. When attribution matters, also test the PR's base with equivalent artifacts. Bundled-old versus candidate-new demonstrates a compatibility improvement but does not isolate every change between those revisions.

Do not confuse recorded model output with successful execution. Assert the real result, such as completed work, exported data, correct state, or an external side effect. Passing one platform or one policy transition does not establish all-platform or all-transition correctness. Keep any required packaged-build and cross-platform validation gates.

## 5. Restore and report

- Remove temporary selection hooks and environment overrides. Regenerate compiled output if a temporary source change was transpiled, so later tests do not accidentally keep using it.
- Stop only task-owned obsolete builds and servers. Remove task-owned scratch downloads when no longer needed; preserve useful evidence and never delete shared caches or unrelated work.
- Check the final diff/status against the starting state. Do not commit downloaded binaries, generated local paths, temporary hooks, or unrelated user changes.
- Report the baseline version, PR head, actual artifact source revision, run/artifact identity, platform, exact commands and outcomes, repetitions, and any components that were not replaced.
- Distinguish "the candidate passes this regression" from "the fix is merged, bundled, released, or verified across platforms." Update issues, PRs, or dependencies only when authorized.
