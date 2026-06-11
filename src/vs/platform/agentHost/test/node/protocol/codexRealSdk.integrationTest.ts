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

function resolveCodexSdkRoot(): string | undefined {
	const sdkPackageDir = join(process.cwd(), 'node_modules', '@openai', 'codex');
	return existsSync(sdkPackageDir) ? process.cwd() : undefined;
}

const CODEX_SDK_ROOT = REAL_CODEX_ENABLED ? resolveCodexSdkRoot() : undefined;

const CODEX_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket - Real Codex App Server',
	provider: 'codex',
	scheme: 'codex',
	shellToolName: 'shell',
	subagentToolNames: [],
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: REAL_CODEX_ENABLED && !!CODEX_SDK_ROOT,
	codexSdkRoot: CODEX_SDK_ROOT,
	supportsWorktreeIsolation: false,
	supportsSubagents: false,
	supportsPlanMode: false,
};

defineSharedRealSdkTests(CODEX_CONFIG);
