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
 * Disabled by default. To run, set BOTH `AGENT_HOST_REAL_SDK=1` and
 * `AGENT_HOST_REAL_SDK_CLAUDE=1`. The Claude SDK is resolved automatically
 * from the dev dependency in `node_modules/@anthropic-ai/claude-agent-sdk`.
 *
 *   AGENT_HOST_REAL_SDK=1 AGENT_HOST_REAL_SDK_CLAUDE=1 \
 *     ./scripts/test-integration.sh --run \
 *     src/vs/platform/agentHost/test/node/protocol/claudeRealSdk.integrationTest.ts
 *
 * **Authentication:** token from `GITHUB_TOKEN` (preferred) or `gh auth
 * token`. Claude mints a Copilot session token via
 * `/copilot_internal/v2/token`, which requires an OAuth token issued from a
 * Copilot-enabled app — the default `gh auth login` token does NOT work.
 * Capture a token from VS Code's GitHub auth provider (e.g. by reading the
 * relevant secret from your keychain) and set `GITHUB_TOKEN` to it before
 * running. The opt-in env var exists so the suite isn't accidentally enabled
 * with an `AGENT_HOST_REAL_SDK=1`-only invocation that would fail for
 * everyone using a vanilla `gh auth token`.
 */

import { existsSync } from 'fs';
import { join } from '../../../../../base/common/path.js';
import { defineSharedRealSdkTests, type IRealSdkProviderConfig } from './realSdkTestHelpers.js';

const REAL_SDK_ENABLED = process.env['AGENT_HOST_REAL_SDK'] === '1';
const CLAUDE_OPT_IN = process.env['AGENT_HOST_REAL_SDK_CLAUDE'] === '1';

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
 */
function resolveClaudeSdkPath(): string | undefined {
	const candidate = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
	if (existsSync(candidate)) {
		return candidate;
	}
	console.error(`[claudeRealSdk] Could not find @anthropic-ai/claude-agent-sdk at ${candidate}. Run \`npm install\` and try again.`);
	return undefined;
}

const CLAUDE_SDK_PATH = resolveClaudeSdkPath();

const CLAUDE_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket — Real Claude SDK',
	provider: 'claude',
	scheme: 'claude',
	shellToolName: 'Bash',
	subagentToolName: 'Task',
	exitPlanModeToolName: 'ExitPlanMode',
	enabled: REAL_SDK_ENABLED && CLAUDE_OPT_IN && !!CLAUDE_SDK_PATH,
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
