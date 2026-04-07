/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import {
	AgentInput,
	AskUserQuestionInput,
	BashInput,
	FileEditInput,
	FileReadInput,
	FileWriteInput,
	GlobInput,
	GrepInput,
	NotebookEditInput,
	ExitPlanModeInput as SDKExitPlanModeInput,
	TaskOutputInput,
	TaskStopInput,
	TodoWriteInput,
	WebFetchInput,
	WebSearchInput,
} from '@anthropic-ai/claude-agent-sdk/sdk-tools';
import { URI } from '../../../../util/vs/base/common/uri';

/**
 * Extended ExitPlanModeInput that includes the plan property sent by the actual tool.
 * The SDK type only has allowedPrompts, but the tool also sends plan.
 */
export interface ExitPlanModeInput extends SDKExitPlanModeInput {
	readonly plan?: string;
}

/**
 * EnterPlanMode tool input - empty as the tool takes no parameters
 */
export interface EnterPlanModeInput {
	// EnterPlanMode takes no input parameters
}

// TODO: How can we verify these when we bump the SDK version?
export enum ClaudeToolNames {
	Task = 'Task',
	Bash = 'Bash',
	Glob = 'Glob',
	Grep = 'Grep',
	LS = 'LS',
	EnterPlanMode = 'EnterPlanMode',
	ExitPlanMode = 'ExitPlanMode',
	Read = 'Read',
	Edit = 'Edit',
	MultiEdit = 'MultiEdit',
	Write = 'Write',
	NotebookEdit = 'NotebookEdit',
	WebFetch = 'WebFetch',
	TodoWrite = 'TodoWrite',
	WebSearch = 'WebSearch',
	BashOutput = 'BashOutput',
	KillBash = 'KillBash',
	AskUserQuestion = 'AskUserQuestion',
}



/**
 * LS tool input - not defined in SDK
 */
export interface LSInput {
	readonly path: string;
}

/**
 * Maps ClaudeToolNames to their SDK input types
 */
export interface ClaudeToolInputMap {
	[ClaudeToolNames.Task]: AgentInput;
	[ClaudeToolNames.Bash]: BashInput;
	[ClaudeToolNames.Glob]: GlobInput;
	[ClaudeToolNames.Grep]: GrepInput;
	[ClaudeToolNames.LS]: LSInput;
	[ClaudeToolNames.EnterPlanMode]: EnterPlanModeInput;
	[ClaudeToolNames.ExitPlanMode]: ExitPlanModeInput;
	[ClaudeToolNames.Read]: FileReadInput;
	[ClaudeToolNames.Edit]: FileEditInput;
	[ClaudeToolNames.MultiEdit]: FileEditInput;
	[ClaudeToolNames.Write]: FileWriteInput;
	[ClaudeToolNames.NotebookEdit]: NotebookEditInput;
	[ClaudeToolNames.WebFetch]: WebFetchInput;
	[ClaudeToolNames.TodoWrite]: TodoWriteInput;
	[ClaudeToolNames.WebSearch]: WebSearchInput;
	[ClaudeToolNames.BashOutput]: TaskOutputInput;
	[ClaudeToolNames.KillBash]: TaskStopInput;
	[ClaudeToolNames.AskUserQuestion]: AskUserQuestionInput;
}

export const claudeEditTools: readonly string[] = [ClaudeToolNames.Edit, ClaudeToolNames.MultiEdit, ClaudeToolNames.Write, ClaudeToolNames.NotebookEdit];

export function getAffectedUrisForEditTool(input: PreToolUseHookInput): URI[] {
	switch (input.tool_name) {
		case ClaudeToolNames.Edit:
		case ClaudeToolNames.MultiEdit:
			return [URI.file((input.tool_input as FileEditInput).file_path)];
		case ClaudeToolNames.Write:
			return [URI.file((input.tool_input as FileWriteInput).file_path)];
		case ClaudeToolNames.NotebookEdit:
			return [URI.file((input.tool_input as NotebookEditInput).notebook_path)];
		default:
			return [];
	}
}
