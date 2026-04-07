/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentInput, BashInput, FileReadInput, GlobInput, GrepInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools';
import Anthropic from '@anthropic-ai/sdk';
import * as l10n from '@vscode/l10n';
import type { ChatSimpleToolResultData, ChatTerminalToolInvocationData } from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatSubagentToolInvocationData, ChatToolInvocationPart, MarkdownString } from '../../../../vscodeTypes';
import { ClaudeToolNames, ExitPlanModeInput, LSInput } from './claudeTools';

// #region Tool Result Content Extraction

/**
 * Extracts text content from a tool result's content field.
 * Tool results can be a string, an array of content blocks, or undefined.
 */
function extractToolResultContent(content: Anthropic.Messages.ToolResultBlockParam['content']): string {
	if (!content) {
		return '';
	}
	if (typeof content === 'string') {
		return content;
	}
	// Array of content blocks - extract text from each
	return content
		.filter((block): block is Anthropic.Messages.TextBlockParam => block.type === 'text')
		.map(block => block.text)
		.join('\n');
}

// #endregion

// #region Tool Invocation Completion Handlers

/**
 * Completes a tool invocation by populating toolSpecificData with the result.
 * This enables VS Code's chat UI to display tool outputs.
 */
export function completeToolInvocation(
	toolUse: Anthropic.Beta.Messages.BetaToolUseBlock,
	toolResult: Anthropic.Messages.ToolResultBlockParam,
	invocation: ChatToolInvocationPart
): void {
	const resultContent = extractToolResultContent(toolResult.content);

	switch (toolUse.name as ClaudeToolNames) {
		case ClaudeToolNames.Bash:
			completeBashInvocation(invocation, toolUse, resultContent);
			break;
		case ClaudeToolNames.Read:
		case ClaudeToolNames.LS:
			completeReadInvocation(invocation, toolUse, resultContent);
			break;
		case ClaudeToolNames.Glob:
		case ClaudeToolNames.Grep:
			completeSearchInvocation(invocation, toolUse, resultContent);
			break;
		case ClaudeToolNames.Edit:
		case ClaudeToolNames.MultiEdit:
		case ClaudeToolNames.Write:
		case ClaudeToolNames.TodoWrite:
			// These tools have their own UI handling (edit diffs, todo list)
			break;
		case ClaudeToolNames.Task:
			completeTaskInvocation(invocation, resultContent);
			break;
		default:
			completeGenericInvocation(invocation, toolUse, resultContent);
			break;
	}
}

/**
 * Completes a bash tool invocation with terminal-specific output formatting.
 * Parses exit code from output and formats for ChatTerminalToolInvocationData.
 */
function completeBashInvocation(
	invocation: ChatToolInvocationPart,
	toolUse: Anthropic.Beta.Messages.BetaToolUseBlock,
	resultContent: string
): void {
	// Parse exit code from the end of the result (format: "Exit code: X" or similar patterns)
	const exitCodeMatch = /(?:exit code|exited with)[:=\s]*(\d+)/i.exec(resultContent);
	const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : undefined;

	// Remove exit code line from output for cleaner display
	let text = resultContent;
	if (exitCode !== undefined) {
		text = resultContent.replace(/(?:exit code|exited with)[:=\s]*\d+\s*$/i, '').trimEnd();
	}

	// Convert \n to \r\n for proper terminal display
	text = text.replace(/\n/g, '\r\n');

	const toolSpecificData: ChatTerminalToolInvocationData = {
		commandLine: {
			original: (toolUse.input as BashInput)?.command ?? '',
		},
		language: 'bash',
		state: exitCode !== undefined ? { exitCode } : undefined,
		output: text ? { text } : undefined
	};
	invocation.toolSpecificData = toolSpecificData;
}

/**
 * Completes a read/ls tool invocation with simple input/output display.
 */
function completeReadInvocation(
	invocation: ChatToolInvocationPart,
	toolUse: Anthropic.Beta.Messages.BetaToolUseBlock,
	resultContent: string
): void {
	if (!resultContent) {
		return;
	}

	const input = toolUse.name === ClaudeToolNames.LS
		? (toolUse.input as LSInput)?.path ?? ''
		: (toolUse.input as FileReadInput)?.file_path ?? '';

	const toolSpecificData: ChatSimpleToolResultData = {
		input,
		output: resultContent
	};
	invocation.toolSpecificData = toolSpecificData;
}

/**
 * Completes a glob/grep tool invocation with simple input/output display.
 */
function completeSearchInvocation(
	invocation: ChatToolInvocationPart,
	toolUse: Anthropic.Beta.Messages.BetaToolUseBlock,
	resultContent: string
): void {
	if (!resultContent) {
		return;
	}

	const input = toolUse.name === ClaudeToolNames.Glob
		? (toolUse.input as GlobInput)?.pattern ?? ''
		: (toolUse.input as GrepInput)?.pattern ?? '';

	const toolSpecificData: ChatSimpleToolResultData = {
		input,
		output: resultContent
	};
	invocation.toolSpecificData = toolSpecificData;
}

/**
 * Completes a Task tool invocation by setting the result on its ChatSubagentToolInvocationData.
 * The toolSpecificData was already populated by formatTaskInvocation with description/agentName/prompt;
 * this adds the result text from the subagent's execution.
 */
function completeTaskInvocation(
	invocation: ChatToolInvocationPart,
	resultContent: string
): void {
	if (invocation.toolSpecificData instanceof ChatSubagentToolInvocationData) {
		invocation.toolSpecificData.result = resultContent;
	}
}

/**
 * Generic completion handler for tools without specific formatting.
 * Displays input arguments and output as plain text.
 */
function completeGenericInvocation(
	invocation: ChatToolInvocationPart,
	toolUse: Anthropic.Beta.Messages.BetaToolUseBlock,
	resultContent: string
): void {
	if (!resultContent) {
		return;
	}

	const toolSpecificData: ChatSimpleToolResultData = {
		input: toolUse.input ? JSON.stringify(toolUse.input, null, 2) : '',
		output: resultContent
	};
	invocation.toolSpecificData = toolSpecificData;
}

// #endregion

// #region Tool Invocation Creation

/**
 * Creates a formatted tool invocation part based on the tool type and input
 */
export function createFormattedToolInvocation(
	toolUse: Anthropic.Beta.Messages.BetaToolUseBlock,
	complete?: boolean
): ChatToolInvocationPart | undefined {
	const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);
	if (complete !== undefined) {
		invocation.isConfirmed = complete;
		invocation.isComplete = complete;
	}

	switch (toolUse.name as ClaudeToolNames) {
		case ClaudeToolNames.Bash:
			formatBashInvocation(invocation, toolUse);
			break;
		case ClaudeToolNames.Read:
			formatReadInvocation(invocation, toolUse);
			break;
		case ClaudeToolNames.Glob:
			formatGlobInvocation(invocation, toolUse);
			break;
		case ClaudeToolNames.Grep:
			formatGrepInvocation(invocation, toolUse);
			break;
		case ClaudeToolNames.LS:
			formatLSInvocation(invocation, toolUse);
			break;
		case ClaudeToolNames.Edit:
		case ClaudeToolNames.MultiEdit:
		case ClaudeToolNames.Write:
			return; // edit diff is shown
		case ClaudeToolNames.ExitPlanMode:
			formatExitPlanModeInvocation(invocation, toolUse);
			break;
		case ClaudeToolNames.Task:
			formatTaskInvocation(invocation, toolUse);
			break;
		case ClaudeToolNames.TodoWrite:
			// Suppress this, it's too common
			return;
		default:
			formatGenericInvocation(invocation, toolUse);
			break;
	}

	return invocation;
}

function formatBashInvocation(invocation: ChatToolInvocationPart, toolUse: Anthropic.Beta.Messages.BetaToolUseBlock): void {
	invocation.invocationMessage = '';
	invocation.toolSpecificData = {
		commandLine: {
			original: (toolUse.input as BashInput)?.command,
		},
		language: 'bash'
	};
}

function formatReadInvocation(invocation: ChatToolInvocationPart, toolUse: Anthropic.Beta.Messages.BetaToolUseBlock): void {
	const filePath: string = (toolUse.input as FileReadInput)?.file_path ?? '';
	const display = filePath ? formatUriForMessage(filePath) : '';
	invocation.invocationMessage = new MarkdownString(l10n.t("Read {0}", display));
}

function formatGlobInvocation(invocation: ChatToolInvocationPart, toolUse: Anthropic.Beta.Messages.BetaToolUseBlock): void {
	const pattern: string = (toolUse.input as GlobInput)?.pattern ?? '';
	invocation.invocationMessage = new MarkdownString(l10n.t("Searched for files matching `{0}`", pattern));
}

function formatGrepInvocation(invocation: ChatToolInvocationPart, toolUse: Anthropic.Beta.Messages.BetaToolUseBlock): void {
	const pattern: string = (toolUse.input as GrepInput)?.pattern ?? '';
	invocation.invocationMessage = new MarkdownString(l10n.t("Searched for regex `{0}`", pattern));
}

function formatLSInvocation(invocation: ChatToolInvocationPart, toolUse: Anthropic.Beta.Messages.BetaToolUseBlock): void {
	const path: string = (toolUse.input as LSInput)?.path ?? '';
	const display = path ? formatUriForMessage(path) : '';
	invocation.invocationMessage = new MarkdownString(l10n.t("Read {0}", display));
}

function formatExitPlanModeInvocation(invocation: ChatToolInvocationPart, toolUse: Anthropic.Beta.Messages.BetaToolUseBlock): void {
	invocation.invocationMessage = l10n.t("Here is Claude's plan:\n\n{0}", (toolUse.input as ExitPlanModeInput)?.plan ?? '');
}

function formatTaskInvocation(invocation: ChatToolInvocationPart, toolUse: Anthropic.Beta.Messages.BetaToolUseBlock): void {
	const description = (toolUse.input as AgentInput)?.description ?? '';
	invocation.invocationMessage = new MarkdownString(l10n.t("Completed Task: \"{0}\"", description));

	const input = toolUse.input as AgentInput;
	invocation.toolSpecificData = new ChatSubagentToolInvocationData(
		input.description,
		input.subagent_type,
		input.prompt);
}

function formatGenericInvocation(invocation: ChatToolInvocationPart, toolUse: Anthropic.Beta.Messages.BetaToolUseBlock): void {
	invocation.invocationMessage = l10n.t("Used tool: {0}", toolUse.name);
}

function formatUriForMessage(path: string): string {
	return `[](${URI.file(path).toString()})`;
}

// #endregion
