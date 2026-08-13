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
	fileOperationStrategy: 'fileTools',
	subagentToolNames: ['task'],
	exitPlanModeToolName: 'exit_plan_mode',
	streamingFileCreateToolName: 'create',
	modelSwitchTarget: 'claude-opus-4.6',
	modelSwitchReturnTarget: 'claude-sonnet-5',
	interactiveInputPrompt: 'Call ask_user exactly once to ask "Which fruit?" with choices "Apple" and "Banana". After the answer, reply with only the selected fruit.',
	cancelledInputPrompt: 'Call ask_user exactly once to ask "Continue?" with choices "Yes" and "No". If the request is cancelled, reply exactly "cancelled".',
	textInputPrompt: 'Call ask_user exactly once to ask "What word?" with no choices. After the answer, reply with only the answer.',
	supportsWorkspacelessE2E: true,
	supportsRuntimeSlashCommandsE2E: true,
	supportsAttachmentsE2E: true,
	supportsTruncateE2E: true,
	supportsWorktreeIncludeFilesE2E: true,
	supportsPausedTurnCancellationE2E: true,
	fileToolDenialReplayUnstableOnLinux: true,
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
};
