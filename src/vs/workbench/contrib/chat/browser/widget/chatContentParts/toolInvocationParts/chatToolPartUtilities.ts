/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createMarkdownCommandLink, IMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ConfirmedReason, IChatToolInvocation, IChatToolInvocationSerialized, isLegacyChatTerminalToolInvocationData, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';

export function isMcpToolInvocation(toolInvocation: Pick<IChatToolInvocation | IChatToolInvocationSerialized, 'toolId' | 'source'>): boolean {
	return toolInvocation.source?.type === 'mcp' || toolInvocation.toolId.toLowerCase().includes('mcp');
}

interface IToolInvocationIconData {
	readonly icon?: ThemeIcon;
	readonly source?: ToolDataSource;
	readonly toolSpecificData?: IChatToolInvocation['toolSpecificData'];
}

/** Resolves the activity icon shared by standalone, grouped, and subagent tool rows. */
export function getToolInvocationIcon(toolId: string, data?: IToolInvocationIconData, resultText?: string): ThemeIcon {
	if (isMcpToolInvocation({ toolId, source: data?.source })) {
		return Codicon.mcp;
	}

	const lowerToolId = toolId.toLowerCase();
	if ((lowerToolId === 'problems' || lowerToolId === 'get_errors' || lowerToolId === 'copilot_geterrors')
		&& resultText?.toLowerCase().replace(/\s+/g, ' ').includes('no problems found')) {
		return Codicon.search;
	}

	const toolSpecificData = data?.toolSpecificData;
	if (toolSpecificData?.kind === 'search') {
		return Codicon.search;
	}
	if (toolSpecificData?.kind === 'terminal') {
		if (!isLegacyChatTerminalToolInvocationData(toolSpecificData)) {
			const exitCode = toolSpecificData.terminalCommandState?.exitCode;
			if (exitCode !== undefined && exitCode !== 0) {
				return Codicon.error;
			}
			if (toolSpecificData.commandLine.isSandboxWrapped) {
				return Codicon.terminalSecure;
			}
		}
		return data?.icon ?? Codicon.terminal;
	}

	if (data?.icon) {
		return data.icon;
	}
	if (lowerToolId.includes('comment')) {
		return Codicon.comment;
	}
	if (
		lowerToolId.includes('search') ||
		lowerToolId.includes('grep') ||
		lowerToolId.includes('find') ||
		lowerToolId.includes('list') ||
		lowerToolId.includes('semantic') ||
		lowerToolId.includes('changes') ||
		lowerToolId.includes('codebase') ||
		lowerToolId.includes('checked')
	) {
		return Codicon.search;
	}
	if (
		lowerToolId.includes('read') ||
		lowerToolId.includes('get_file') ||
		lowerToolId.includes('problems')
	) {
		return Codicon.book;
	}
	if (
		lowerToolId.includes('edit') ||
		lowerToolId.includes('create') ||
		lowerToolId.includes('replace') ||
		lowerToolId.includes('patch')
	) {
		return Codicon.pencil;
	}
	if (lowerToolId.includes('terminal')) {
		return Codicon.terminal;
	}
	return Codicon.tools;
}

/**
 * Whether a tool is waiting on an approval that the confirmation carousel above the chat input hosts
 * when it is enabled. Hidden tools and MCP tools (extension-hosted or agent-host, see
 * {@link isMcpToolInvocation}) keep their confirmations inline.
 * @param state The tool state to check, for callers that already read it through an observable reader.
 */
export function isCarouselToolConfirmation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, state?: IChatToolInvocation.State): toolInvocation is IChatToolInvocation {
	if (toolInvocation.kind !== 'toolInvocation' || toolInvocation.presentation === 'hidden' || isMcpToolInvocation(toolInvocation)) {
		return false;
	}
	const current = state ?? toolInvocation.state.get();
	return current.type === IChatToolInvocation.StateKind.WaitingForConfirmation && !!current.confirmationMessages?.title;
}

export function isAskQuestionsToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): boolean {
	return toolInvocation.toolId === 'copilot_askQuestions'
		|| toolInvocation.toolId === 'vscode_askQuestions'
		|| toolInvocation.toolId === 'ask_user'
		|| toolInvocation.toolId === 'AskUserQuestion'
		|| toolInvocation.toolId === 'request_user_input';
}

/**
 * Determines whether a tool invocation's progress text should shimmer.
 */
export function shouldShimmerForTool(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, content: string | IMarkdownString | undefined): boolean {
	if (!isAskQuestionsToolInvocation(toolInvocation) || IChatToolInvocation.isComplete(toolInvocation)) {
		return false;
	}

	return getMarkdownValue(content) === getMarkdownValue(toolInvocation.invocationMessage);
}

function getMarkdownValue(content: string | IMarkdownString | undefined): string | undefined {
	return (typeof content === 'string' ? content : content?.value)
		?.replaceAll('&nbsp;', ' ')
		.replace(/\\[\\`*_{}\[\]()#+\-!~]/g, escaped => escaped.slice(1));
}

/**
 * Creates a markdown message explaining why a tool was auto-approved.
 * @param toolInvocation The tool invocation to get the approval message for
 * @returns A markdown string with the approval message, or undefined if no message should be shown
 */
export function getToolApprovalMessage(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): IMarkdownString | undefined {
	const reason = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation);
	if (!reason || typeof reason === 'boolean') {
		return undefined;
	}

	return getApprovalMessageFromReason(reason);
}

/**
 * Creates a markdown message from a ConfirmedReason explaining why a tool was auto-approved.
 * @param reason The confirmation reason
 * @returns A markdown string with the approval message, or undefined if no message should be shown
 */
export function getApprovalMessageFromReason(reason: ConfirmedReason): IMarkdownString | undefined {
	let md: string;
	switch (reason.type) {
		case ToolConfirmKind.Setting:
			md = localize('chat.autoapprove.setting', 'Auto approved by {0}', createMarkdownCommandLink({ text: '`' + reason.id + '`', id: 'workbench.action.openSettings', arguments: [reason.id], tooltip: localize('openSettings.tooltip', 'Open settings') }, false));
			break;
		case ToolConfirmKind.LmServicePerTool:
			md = reason.scope === 'session'
				? localize('chat.autoapprove.lmServicePerTool.session', 'Auto approved for this session')
				: reason.scope === 'workspace'
					? localize('chat.autoapprove.lmServicePerTool.workspace', 'Auto approved for this workspace')
					: localize('chat.autoapprove.lmServicePerTool.profile', 'Auto approved for this profile');
			md += ' (' + createMarkdownCommandLink({ text: localize('edit', 'Edit'), id: 'workbench.action.chat.editToolApproval', arguments: [reason.scope], tooltip: localize('editToolApproval.tooltip', 'Edit tool approval settings') }) + ')';
			break;
		case ToolConfirmKind.ConfirmationNotNeeded:
			if (reason.reason) {
				return typeof reason.reason === 'string'
					? new MarkdownString(reason.reason, { isTrusted: true })
					: reason.reason;
			}
			return undefined;
		case ToolConfirmKind.UserAction:
		case ToolConfirmKind.Denied:
		default:
			return undefined;
	}

	return new MarkdownString(md, { isTrusted: true });
}
