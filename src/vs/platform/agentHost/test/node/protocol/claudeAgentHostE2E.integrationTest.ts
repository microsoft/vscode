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
 *     src/vs/platform/agentHost/test/node/protocol/claudeAgentHostE2E.integrationTest.ts
 *
 * **Recording authentication:** token from `GITHUB_TOKEN` (preferred) or `gh auth
 * token`. Either works — the agent host's `CopilotApiService` discovers the
 * user's CAPI endpoint via `GET /copilot_internal/user` and uses the GitHub
 * token directly as a Bearer credential, the same pattern as the
 * `@github/copilot` CLI. Replay needs no credential.
 */

import { existsSync } from 'fs';
import { join } from '../../../../../base/common/path.js';
import { defineAgentHostE2ETests, type IAgentHostE2EProviderConfig } from './agentHostE2ETestHelpers.js';

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
	// Claude has not landed worktree isolation yet (deferred to Phase 12).
	// The shared suite skips that test when the flag is false.
	supportsWorktreeIsolation: false,
	supportsSubagents: true,
	// Plan mode is wired (`ExitPlanMode` interactive tool exists) but the
	// shared test's Copilot-flavoured prompt doesn't reliably drive Claude
	// to invoke it. TODO: rework the prompt for Claude conventions.
	supportsPlanMode: false,
};

defineAgentHostE2ETests(CLAUDE_CONFIG);
