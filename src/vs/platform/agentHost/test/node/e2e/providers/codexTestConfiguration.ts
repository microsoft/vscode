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
	modelProviders: ['codex'],
	scheme: 'codex',
	shellToolName: 'shell',
	fileOperationStrategy: 'shell',
	subagentToolNames: [],
	exitPlanModeToolName: 'exit_plan_mode',
	modelSwitchTarget: '@provider=vscode-proxy:gpt-5.6-terra',
	modelSwitchWireTarget: 'gpt-5.6-terra',
	modelSwitchReturnTarget: '@provider=vscode-proxy:gpt-5.3-codex',
	modelSwitchWireReturnTarget: 'gpt-5.3-codex',
	createSessionModelTarget: '@provider=vscode-proxy:gpt-5.6-terra',
	createSessionModelWireTarget: 'gpt-5.6-terra',
	interactiveInputPrompt: 'Use your request_user_input capability to ask me one question: "Which fruit?" with options Apple and Banana. After I answer, reply with only the option I chose.',
	cancelledInputPrompt: 'Use your request_user_input capability to ask me one question: "Continue?" with options Yes and No. If the request is cancelled or receives no answer, reply exactly "cancelled".',
	inputRequestMode: 'plan',
	enabled: !!CODEX_SDK_ROOT,
	codexSdkRoot: CODEX_SDK_ROOT,
	supportsWorktreeIsolation: true,
	supportsHostTerminalTool: false,
	supportsSubagents: false,
	planModeStyle: 'input-request',
	supportsMultipleChats: true,
	supportsMultipleChatsE2E: true,
	supportsWorkspacelessE2E: true,
	supportsRuntimeSlashCommandsE2E: true,
	supportsPausedTurnCancellationE2E: true,
	supportsCustomizationDiscoveryE2E: true,
	supportsFixedInstructionDiscoveryE2E: true,
	// Client-plugin synchronization can race the first turn and leave it incomplete.
	supportsPluginCustomizationDiscoveryE2E: false,
	supportsChatFork: true,
	supportsChatForkE2E: true,
	supportsSideChats: true,
	supportsSideChatsE2E: true,
	shellToolReplayUnstableOnLinux: true,
	shellToolResultTextUnreliable: true,
};
