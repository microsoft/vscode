/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';
import { join } from '../../../../../../base/common/path.js';
import type { IAgentHostE2EProviderConfig } from '../harness/agentHostE2ETestHarness.js';

function resolveCodexSdkRoot(): string | undefined {
	const sdkPackageDir = join(process.cwd(), 'node_modules', '@openai', 'codex');
	return existsSync(sdkPackageDir) ? process.cwd() : undefined;
}

export const CODEX_SDK_ROOT = resolveCodexSdkRoot();

export const CODEX_CONFIG: IAgentHostE2EProviderConfig = {
	suiteTitle: 'Agent Host E2E — Codex',
	provider: 'codex',
	scheme: 'codex',
	shellToolName: 'shell',
	subagentToolNames: [],
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: !!CODEX_SDK_ROOT,
	codexSdkRoot: CODEX_SDK_ROOT,
	supportsWorktreeIsolation: true,
	supportsHostTerminalTool: false,
	supportsSubagents: false,
	supportsPlanMode: false,
	supportsMultipleChats: false,
	supportsChatFork: false,
	supportsChatForkE2E: false,
	shellToolReplayUnstableOnLinux: true,
};
