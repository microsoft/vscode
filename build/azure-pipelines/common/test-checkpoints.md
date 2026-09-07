# Linux unit-test checkpoint pilot

The product pipeline's `VSCODE_REUSE_SUCCESSFUL_TESTS` queue parameter enables
success checkpoints for Linux x64 unit tests only:

- Electron unit tests
- Node.js unit tests
- Chromium browser unit tests

The parameter defaults to `false`. When disabled, template expansion omits the
lookup, recording commands, conditions, publication, and synthetic failure steps. Other platforms,
CI-mode jobs, integration/smoke tests, and Copilot/sanity tests are unchanged.
Existing test-enable and skip-tests parameters still apply.

## Trying it

Queue [the product pipeline](../product-build.yml) from a branch containing the
change, with:

```text
VSCODE_BUILD_TYPE=Product
VSCODE_BUILD_LINUX=true
VSCODE_STEP_ON_IT=false
VSCODE_REUSE_SUCCESSFUL_TESTS=true
VSCODE_PUBLISH=false
VSCODE_RELEASE=false
```

Disable unwanted target-platform and Snap parameters for a smaller validation
build. This pilot does not skip build/setup work or non-unit tests.

After each unit test passes, its `Publish ... checkpoint` step immediately uploads
a small `test-checkpoint.json` pipeline artifact. The temporary `Validate unit-test
checkpoint retry (expected failure)` step then deliberately fails the first
attempt, after all enabled unit-test publishers and before integration-test setup.
It is gated by the pilot parameter, requires at least one unit-test type to be
enabled, and runs only when `VSCODE_PUBLISH=false`, `System.JobAttempt=1`, and
`System.StageAttempt=1`.

Retry the failed Linux job or its stage **in the same pipeline run**. The restore
step reports the checkpoints it finds, and the corresponding unit-test tasks and
publishers are skipped. The synthetic failure step is also skipped on a job or
stage retry, so integration tests and subsequent work can proceed normally.
Failed or not-yet-run tests remain eligible. If a real failure occurs before the
synthetic step, the retry still skips any already-checkpointed tests.

Remove the temporary validation step after confirming live retry behavior and
before adopting the pilot beyond this experiment. Actual integration tests have
not been modified to fail.

Turn off `VSCODE_REUSE_SUCCESSFUL_TESTS` when queuing a new run to return to the
original behavior. Queue parameters cannot be changed by retrying an existing
run. A fresh run never reuses another run's checkpoints, even at the same commit.

## Semantics and limitations

- Lookup uses the current build's artifact API and `System.AccessToken`, not local
  files or a previous successful build.
- Names include version, stage, job, platform, architecture, and test identity,
  but not attempt numbers. The `test-pass-` prefix excludes checkpoints from
  product publication.
- Only the successful end of a test command records metadata. Nonzero exits and
  skipped/timed-out tasks do not publish a pass.
- Lookup retries transient network/5xx failures using the existing retry helper.
  Authentication errors, throttling (429), malformed responses, and exhausted
  retries fail visibly rather than treating an unknown state as a hit.
- Upload failures remain failures. If the upload actually committed despite a
  lost response, the next attempt discovers it. Otherwise the test may run again.
  There are no blind task-level upload retries or overwrites of existing markers.
- Each identity has one sequential producer. Concurrent executions of the same
  job/test identity are not supported.
- Reuse assumes equivalent logical inputs within a run. It is not proof that
  regenerated binaries are byte-identical. Queue a fresh run after intentional
  input changes or to force tests to execute again.
- Test results from the original execution remain in Azure DevOps; skipping a
  task does not fabricate or republish passing results for the new attempt.
- Artifacts follow the pipeline run's retention policy.

## Validation

Run the targeted tests with the existing build-script test runner:

```sh
node --test build/lib/test/testCheckpoint.test.ts
```

Live acceptance: confirm that an uploaded checkpoint survives a later failed
task, is found on job and stage retries, and causes the actual unit-test step to
be skipped. Also verify that another build ID executes the tests and that the
default-off pipeline expands to the original test steps.
