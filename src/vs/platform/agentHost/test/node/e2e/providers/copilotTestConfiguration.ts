/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentHostE2EProviderConfig } from '../harness/agentHostE2ETestHarness.js';

export const COPILOT_CONFIG: IAgentHostE2EProviderConfig = {
	suiteTitle: 'Agent Host E2E — Copilot',
	provider: 'copilotcli',
	scheme: 'copilotcli',
	shellToolName: 'bash',
	subagentToolNames: ['task'],
	exitPlanModeToolName: 'exit_plan_mode',
	streamingFileCreateToolName: 'create',
	// The shared suite runs by default in deterministic replay mode (tokenless,
	// against committed fixtures). Recording new fixtures is opt-in via
	// `AGENT_HOST_REPLAY_RECORD=1`. The Copilot CLI is always present (dev dep).
	enabled: true,
	supportsWorktreeIsolation: true,
	supportsHostTerminalTool: true,
	supportsSubagents: true,
	supportsSideChats: true,
	supportsPlanMode: true,
	supportsMultipleChats: true,
	supportsChatFork: true,
	supportsChatForkE2E: true,
	supportsFileTools: true,
};
