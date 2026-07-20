/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent host end-to-end tests (Claude).
 *
 * The cross-provider portion lives in {@link defineAgentHostE2ETests}; this
 * file would layer on Claude-specific assertions as the provider grows.
 *
 * Runs by default in deterministic replay mode against committed fixtures (no
 * token, no network). To re-record against real CAPI, set
 * `AGENT_HOST_REPLAY_RECORD=1`. The Claude SDK is resolved automatically from
 * the dev dependency in `node_modules/@anthropic-ai/claude-agent-sdk`.
 *
 *   AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
 *     src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts
 *
 * **Recording authentication:** token from `GITHUB_TOKEN` (preferred) or `gh auth
 * token`. Either works — the agent host's `CopilotApiService` discovers the
 * user's CAPI endpoint via `GET /copilot_internal/user` and uses the GitHub
 * token directly as a Bearer credential, the same pattern as the
 * `@github/copilot` CLI. Replay needs no credential.
 */

import { existsSync } from 'fs';
import { join } from '../../../../../../base/common/path.js';
import { type IAgentHostE2EProviderConfig } from '../harness/agentHostE2ETestHarness.js';
import { defineAgentHostE2ETests } from '../suites/agentHostE2ESuites.js';

/**
 * Resolve the path of the locally installed `@anthropic-ai/claude-agent-sdk`
 * package. It's a dev dep so it's always present at
 * `<repo>/node_modules/@anthropic-ai/claude-agent-sdk`; we hand the repo
 * directory (the SDK root — the parent of `node_modules/`) to the agent
 * host server via `--claude-sdk-root` so the Claude provider gets
 * registered.
 *
 * The Electron renderer test loader rejects bare module-specifier resolution
 * (no `import.meta.resolve('pkg')`, no `require.resolve('pkg')`), so we
 * locate the package by joining `process.cwd()` with the well-known path.
 * Tests are always invoked from the repo root.
 *
 * Returns `undefined` when the directory is missing, which disables the suite.
 */
function resolveClaudeSdkRoot(): string | undefined {
	const sdkPackageDir = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
	return existsSync(sdkPackageDir) ? process.cwd() : undefined;
}

// The shared suite runs by default in deterministic replay mode; recording is
// opt-in via `AGENT_HOST_REPLAY_RECORD=1`. Both need the SDK on disk (it drives
// the HTTP the proxy answers), so resolve it unconditionally.
const CLAUDE_SDK_ROOT = resolveClaudeSdkRoot();

const CLAUDE_CONFIG: IAgentHostE2EProviderConfig = {
	suiteTitle: 'Agent Host E2E — Claude',
	provider: 'claude',
	scheme: 'claude',
	shellToolName: 'Bash',
	subagentToolNames: ['Task', 'Agent'],
	exitPlanModeToolName: 'ExitPlanMode',
	enabled: !!CLAUDE_SDK_ROOT,
	claudeSdkRoot: CLAUDE_SDK_ROOT,
	// Worktree isolation is now shared across agents via the host-owned
	// worktree isolation controller.
	supportsWorktreeIsolation: true,
	// Claude runs shell commands (`Bash`) inside its own SDK subprocess, not
	// the host-managed custom terminal tool, so the worktree suite verifies
	// isolation via the resolved working directory alone.
	supportsHostTerminalTool: false,
	supportsSubagents: true,
	// Claude rebuilds a reopened subagent transcript from the SDK's on-disk
	// `subagents/agent-*.jsonl`, not reliably visible on Windows (see PR #325284).
	subagentReplayUnstableOnWindows: true,
	// Plan mode is wired (`ExitPlanMode` interactive tool exists) but the
	// shared test's Copilot-flavoured prompt doesn't reliably drive Claude
	// to invoke it. TODO: rework the prompt for Claude conventions.
	supportsPlanMode: false,
};

defineAgentHostE2ETests(CLAUDE_CONFIG);
