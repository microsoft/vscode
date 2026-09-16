# Launch skill benchmark

This benchmark measures the end-to-end agent loop for both supported surfaces:

- **Agents window**: launch, settle the workspace, send two chat turns, and fork.
- **Editor window**: launch the workbench, open chat, send two chat turns, and fork.

## Isolation

Chat benchmarks must use a dedicated non-git fixture root outside the VS Code checkout:

```text
/tmp/vscode-launch-benchmark-workspaces
```

Never use the repository checkout for synthetic prompts. A fork from a repository
workspace can create a full worktree, pollute its chat history, and consume
significant disk space.

The runner creates a unique child folder for each trial and removes it during
cleanup. Reusing one folder can accumulate agent-host session identity and make
repeated results dependent on earlier trials.

## Reliability invariants

1. Before every action, detect visible modal dialogs.
2. Handle known safe dialogs, such as Workspace Trust, and wait until they close.
3. Fail with a diagnostic for unknown dialogs. Never interact with the page behind
   a modal.
4. Verify the chat input contains the exact prompt before submitting it.
5. Observe response loading start and completion instead of using a fixed sleep.
6. Use state-specific deadlines (setup 90 s, response 60 s, fork 30 s), but
   report actual completion time and return immediately when state changes.
7. Verify that a fork changed the visible session or conversation state.
8. Close the automation connection and terminate only the launched Code OSS PID.

## Metrics

Each trial records:

- launch to CDP ready;
- setup to an actionable chat input;
- first and second response latency;
- fork latency;
- end-to-end wall time;
- Playwright process invocations;
- success or the exact failed invariant.

Raw observations live in `results/`. The current summary and optimization history
are in [`dashboard.md`](dashboard.md).

## Run

The runner launches each surface sequentially, uses one checked direct-CDP
process per scenario, verifies that the repository worktree list is unchanged,
and removes the throwaway launch directory:

```bash
./.agents/skills/launch/benchmark/run.mjs \
  --surface all \
  --repeat 3 \
  --workspace /tmp/vscode-launch-benchmark-workspaces \
  --output .agents/skills/launch/benchmark/results/latest.json
```

The fixture path is created if needed and rejected if it contains `.git`.
Pass `--skip-prelaunch` only after one successful prepared launch of the same
build when measuring repeated-run steady state.
