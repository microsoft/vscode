# Windows x64 test checkpoints

The Windows product build is split into compile, test and sign jobs (see
[product-build-win32.yml](../win32/product-build-win32.yml)), so retrying a
failed job never repeats the work of the jobs that already succeeded. Within the
Windows x64 test job, test checkpoints go one step further: retrying the test
job (**Rerun failed jobs**) skips the test tasks that already passed in an
earlier attempt of the same pipeline run and only runs the remaining ones.

The `VSCODE_SKIP_SUCCESSFUL_TEST_TASKS` queue parameter of
[the product pipeline](../product-build.yml) ("Skip successful test tasks on
retries", default `true`) enables checkpoints. When it is disabled, template
expansion omits the restore, recording, publishing and gating steps, and the job
runs its original test steps. Other jobs, including the Windows CI test jobs,
are unchanged.

The following test tasks are checkpointed:

- Unit tests: Electron, Node.js, Browser (Chromium)
- Integration tests: Electron, Browser (Firefox), Remote
- Smoke tests: Electron, Browser (Chromium), Remote
- Copilot tests: extension, completions core, sanity

## How it works

1. `Restore test checkpoints` runs first in the test phase. It lists the
   artifacts of the current run and sets `TEST_CHECKPOINT_<ID>_HIT` for every
   test task that already has a checkpoint.
2. Each test task is skipped when its `HIT` variable is `true`. The WSL Dev
   Container setup only serves the Electron smoke tests, so it is skipped along
   with them.
3. After a test task passes, [testCheckpoint.ts](./testCheckpoint.ts) `record`
   writes a small `test-checkpoint.json` file and the following
   `Publish ... checkpoint` step immediately uploads it as a pipeline artifact.
4. `Publish Tests Results` only runs when the attempt produced test results.

Setup steps shared by several test tasks (checkout, dependencies, the
compilation artifact, Electron and Playwright, building the integration tests,
the Copilot setup) still run on every attempt.

## Trying it

Queue [the product pipeline](../product-build.yml) with, for example:

```text
VSCODE_BUILD_TYPE=Product
VSCODE_BUILD_WIN32=true
VSCODE_STEP_ON_IT=false
VSCODE_SKIP_SUCCESSFUL_TEST_TASKS=true
VSCODE_PUBLISH=false
VSCODE_RELEASE=false
```

When a test task of the `Windows (X64) - Test` job fails, retry the job with
**Rerun failed jobs**. `Restore test checkpoints` reports the checkpoints it
finds, and the test tasks that passed in the earlier attempt are skipped.

## Semantics and limitations

- Lookup uses the current build's artifact API and `System.AccessToken`, not
  local files or a previous successful build. A new pipeline run never reuses
  another run's checkpoints, even at the same commit.
- Checkpoint names include stage, job, platform, architecture and test
  identity, but not attempt numbers. The `test-pass-` prefix excludes the
  checkpoints from product publication.
- Only the successful end of a test command records a checkpoint. Nonzero exits
  and skipped or timed-out tasks do not publish a pass.
- Lookup retries transient network and 5xx failures using the existing retry
  helper. Authentication errors, throttling (429), malformed responses and
  exhausted retries fail visibly rather than treating an unknown state as a hit.
- Upload failures remain failures. If the upload actually committed despite a
  lost response, the next attempt discovers it. Otherwise the test runs again.
- Each identity has one sequential producer. Concurrent executions of the same
  job and test identity are not supported.
- Reuse assumes equivalent inputs within a run, which holds because every
  attempt of the test job tests the same compilation artifact. Queue a new run
  to force all tests to run again. Queue parameters cannot be changed by
  retrying an existing run.
- Test results of the original execution remain in Azure DevOps. Skipping a
  task does not fabricate or republish passing results for the new attempt.
- Artifacts follow the pipeline run's retention policy.

## Validation

Run the targeted tests with the existing build script test runner:

```sh
node --test build/lib/test/testCheckpoint.test.ts build/lib/test/testCheckpointTemplates.test.ts
```
