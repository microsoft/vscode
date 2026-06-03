/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import type { ITerminalSandboxPrecheckInputs } from '../../../../../platform/sandbox/common/terminalSandboxService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import type { IChatWidgetService } from '../chat.js';
import type { IChatService } from '../../common/chatService/chatService.js';
import { ChatPermissionLevel, isAutoApproveLevel } from '../../common/constants.js';
import { IToolResult } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { WorkingDirectory } from '../../common/workingDirectory.js';

export interface ISymbolToolInput {
	symbol: string;
	uri?: string;
	filePath?: string;
	lineContent: string;
}

/**
 * Resolves a URI from tool input. Accepts either a full URI string or a
 * workspace-relative file path. When a {@link workingDirectory} is provided
 * (agents window), relative paths are resolved against it first.
 */
export function resolveToolUri(input: ISymbolToolInput, workspaceContextService: IWorkspaceContextService, workingDirectory?: URI): URI | undefined {
	if (input.uri) {
		return URI.parse(input.uri);
	}
	if (input.filePath) {
		const workingDir = new WorkingDirectory(workspaceContextService, workingDirectory);
		return workingDir.resolveRelativePath(input.filePath);
	}
	return undefined;
}

/**
 * Gets the chat permission level that should apply to a tool invocation.
 *
 * When a request id is available, the request-stamped permission level is the
 * source of truth for that invocation. If the request cannot be resolved (for
 * example during early streaming), fall back to the live session widget and then
 * the latest request in the chat model.
 */
export function getChatPermissionLevelForToolInvocation(
	chatSessionResource: URI | undefined,
	chatRequestId: string | undefined,
	chatWidgetService: IChatWidgetService,
	chatService: IChatService,
): ChatPermissionLevel | undefined {
	if (!chatSessionResource) {
		return undefined;
	}

	const model = chatService.getSession(chatSessionResource);
	const request = chatRequestId
		? model?.getRequests().find(request => request.id === chatRequestId)
		: undefined;
	if (request) {
		return request.modeInfo?.permissionLevel ?? ChatPermissionLevel.Default;
	}

	const widget = chatWidgetService.getWidgetBySessionResource(chatSessionResource);
	if (widget) {
		return widget.input.currentModeInfo.permissionLevel ?? ChatPermissionLevel.Default;
	}

	return model?.getRequests().at(-1)?.modeInfo?.permissionLevel ?? ChatPermissionLevel.Default;
}

/**
 * Translates the chat permission level for a tool invocation into the
 * platform-neutral sandbox precheck inputs.
 */
export function getSandboxPrecheckInputsForToolInvocation(
	chatSessionResource: URI | undefined,
	chatRequestId: string | undefined,
	chatWidgetService: IChatWidgetService,
	chatService: IChatService,
): ITerminalSandboxPrecheckInputs | undefined {
	const chatPermissionLevel = getChatPermissionLevelForToolInvocation(chatSessionResource, chatRequestId, chatWidgetService, chatService);
	return chatPermissionLevel === undefined ? undefined : { isDefaultApprovalPermissionEnabled: !isAutoApproveLevel(chatPermissionLevel) };
}

/**
 * Finds the line number in the model that matches the given line content.
 * Whitespace is normalized so that extra spaces in the input still match.
 *
 * @returns The 1-based line number, or `undefined` if not found.
 */
export function findLineNumber(model: ITextModel, lineContent: string): number | undefined {
	const parts = lineContent.trim().split(/\s+/);
	const pattern = parts.map(escapeRegExpCharacters).join('\\s+');
	const matches = model.findMatches(pattern, false, true, false, null, false, 1);
	if (matches.length === 0) {
		return undefined;
	}
	return matches[0].range.startLineNumber;
}

/**
 * Finds the 1-based column of a symbol within a line of text using word
 * boundary matching.
 *
 * @returns The 1-based column, or `undefined` if not found.
 */
export function findSymbolColumn(lineText: string, symbol: string): number | undefined {
	const pattern = new RegExp(`\\b${escapeRegExpCharacters(symbol)}\\b`);
	const match = pattern.exec(lineText);
	if (match) {
		return match.index + 1; // 1-based column
	}
	return undefined;
}

/**
 * Creates an error tool result with the given message as both the content
 * and the tool result message.
 */
export function errorResult(message: string): IToolResult {
	const result = createToolSimpleTextResult(message);
	result.toolResultMessage = new MarkdownString(message);
	return result;
}
