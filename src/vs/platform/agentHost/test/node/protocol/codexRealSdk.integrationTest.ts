/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Codex app-server integration tests.
 *
 * Disabled by default. To run, set `AGENT_HOST_REAL_CODEX=1`. The Codex CLI
 * is resolved automatically from the dev dependency in
 * `node_modules/@openai/codex`.
 *
 *   AGENT_HOST_REAL_CODEX=1 ./scripts/test-integration.sh --run \
 *     src/vs/platform/agentHost/test/node/protocol/codexRealSdk.integrationTest.ts
 *
 * **Authentication:** token from `GITHUB_TOKEN` (preferred) or `gh auth
 * token`. The agent host's Codex proxy forwards the app-server's Responses API
 * traffic to Copilot CAPI using that token.
 */

import { existsSync } from 'fs';
import { join } from '../../../../../base/common/path.js';
import { defineSharedRealSdkTests, type IRealSdkProviderConfig } from './realSdkTestHelpers.js';

const REAL_CODEX_ENABLED = process.env['AGENT_HOST_REAL_CODEX'] === '1';

function resolveCodexBinaryPath(): string | undefined {
	const candidate = join(process.cwd(), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
	return existsSync(candidate) ? candidate : undefined;
}

const CODEX_BINARY_PATH = REAL_CODEX_ENABLED ? resolveCodexBinaryPath() : undefined;

const CODEX_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket - Real Codex App Server',
	provider: 'codex',
	scheme: 'codex',
	shellToolName: 'shell',
	subagentToolNames: [],
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: REAL_CODEX_ENABLED && !!CODEX_BINARY_PATH,
	codexBinaryPath: CODEX_BINARY_PATH,
	supportsWorktreeIsolation: false,
	supportsSubagents: false,
	supportsPlanMode: false,
};

defineSharedRealSdkTests(CODEX_CONFIG);
