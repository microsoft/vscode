/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Claude SDK integration tests.
 *
 * The cross-provider portion lives in {@link defineSharedRealSdkTests}; this
 * file would layer on Claude-specific assertions as the provider grows.
 *
 * Disabled by default. To run, set `AGENT_HOST_REAL_SDK=1`. The Claude SDK
 * is resolved automatically from the dev dependency in
 * `node_modules/@anthropic-ai/claude-agent-sdk`.
 *
 *   AGENT_HOST_REAL_SDK=1 ./scripts/test-integration.sh --run \
 *     src/vs/platform/agentHost/test/node/protocol/claudeRealSdk.integrationTest.ts
 *
 * **Authentication:** token from `GITHUB_TOKEN` (preferred) or `gh auth
 * token`. Either works — the agent host's `CopilotApiService` discovers the
 * user's CAPI endpoint via `GET /copilot_internal/user` and uses the GitHub
 * token directly as a Bearer credential, the same pattern as the
 * `@github/copilot` CLI.
 */

import { existsSync } from 'fs';
import { join } from '../../../../../base/common/path.js';
import { defineSharedRealSdkTests, type IRealSdkProviderConfig } from './realSdkTestHelpers.js';

const REAL_SDK_ENABLED = process.env['AGENT_HOST_REAL_SDK'] === '1';

/**
 * Resolve the path of the locally installed `@anthropic-ai/claude-agent-sdk`
 * package. It's a dev dep so it's always present at
 * `<repo>/node_modules/@anthropic-ai/claude-agent-sdk`; we hand its
 * directory to the agent host server via `--claude-sdk-path` so the Claude
 * provider gets registered.
 *
 * The Electron renderer test loader rejects bare module-specifier resolution
 * (no `import.meta.resolve('pkg')`, no `require.resolve('pkg')`), so we
 * locate the package by joining `process.cwd()` with the well-known path.
 * Tests are always invoked from the repo root.
 *
 * Returns `undefined` silently when the directory is missing — only called
 * once the suite has already opted in via env vars, so the suite's own
 * skip-if-not-found path surfaces the missing dep.
 */
function resolveClaudeSdkPath(): string | undefined {
	const candidate = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
	return existsSync(candidate) ? candidate : undefined;
}

// Resolve lazily: if the suite isn't opted in, skip the filesystem probe so a
// missing SDK directory can't trip a disabled run.
const CLAUDE_SDK_PATH = REAL_SDK_ENABLED ? resolveClaudeSdkPath() : undefined;

const CLAUDE_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket — Real Claude SDK',
	provider: 'claude',
	scheme: 'claude',
	shellToolName: 'Bash',
	subagentToolName: 'Task',
	exitPlanModeToolName: 'ExitPlanMode',
	enabled: REAL_SDK_ENABLED && !!CLAUDE_SDK_PATH,
	claudeSdkPath: CLAUDE_SDK_PATH,
	// Claude has not landed worktree isolation or subagents yet (deferred to
	// Phase 12). The shared suite skips those tests when the flags are false.
	supportsWorktreeIsolation: false,
	supportsSubagents: false,
	// Plan mode is wired (`ExitPlanMode` interactive tool exists) but the
	// shared test's Copilot-flavoured prompt doesn't reliably drive Claude
	// to invoke it. TODO: rework the prompt for Claude conventions.
	supportsPlanMode: false,
};

defineSharedRealSdkTests(CLAUDE_CONFIG);
