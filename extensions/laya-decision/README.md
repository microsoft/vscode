# Laya decision model prototype

This built-in extension runs [`@receptron/laya`](https://github.com/receptron/laya) in a Node.js worker thread and exposes it to other built-in extensions.

## Try the routing command

1. Build and run VS Code from this worktree.
2. Run **Laya: Run Model Routing Prototype** from the Command Palette.
3. Enter a request that you want to route.

The first request downloads the upstream fp32 ONNX bundle (about 1.7 GB) into the extension's global storage. Later requests reuse the cached bundle. To use an existing exported bundle instead, set `LAYA_MODEL_DIR` before starting VS Code:

```sh
LAYA_MODEL_DIR=/absolute/path/to/onnx ./scripts/code.sh
```

The command chooses between `fast`, `balanced`, and `capable` routes by default. A caller can pass different routes:

```ts
const answer = await vscode.commands.executeCommand('layaDecisionModel.route', {
	prompt: 'Fix the typo in README.md',
	routes: {
		small: 'Simple and localized requests.',
		large: 'Complex requests that need deeper reasoning.',
	},
});
```

To classify the current focused chat draft, run **Chat: Choose Model with Laya**. The command leaves the draft unchanged and recommends one of **GPT Astra**, **GPT Sol**, or **GPT Luna**, plus the minimum sufficient reasoning level from `minimal`, `low`, `medium`, `high`, or `xhigh`.

## Record resource usage

Every command invocation appends a record to `performance.jsonl` in the extension's global storage. Select **Open Metrics** on the recommendation notification to open it.

Each record includes:

- worker resident memory (RSS), JavaScript heap, external memory, and array-buffer memory before model load, after model load, and after inference;
- system free and total RAM and the system load average at the same points;
- model-load, inference, and total elapsed time;
- worker user and system CPU time consumed by the request, plus aggregate computer CPU utilization over the request;
- whether the model was already loaded.

The prototype explicitly uses ONNX Runtime's CPU execution provider, so each record reports `executionProvider: "cpu"` and `gpuUsed: false`. GPU memory or utilization should not change because of Laya. The first run shows download plus model-load impact; later runs isolate warm inference. For a useful comparison, run the same prompt once cold, once warm, then use **Laya: Unload Decision Model** and observe memory being released in Activity Monitor.

## Call the extension API

```ts
const extension = vscode.extensions.getExtension<LayaDecisionModelApi>('vscode.laya-decision');
const laya = await extension?.activate();
const result = await laya?.decide(state, questions);
```

The prototype is desktop-only and runs in the local UI extension host. It intentionally does not include the production model distribution, checksum, policy, telemetry, remote-host, or web-runtime work.
