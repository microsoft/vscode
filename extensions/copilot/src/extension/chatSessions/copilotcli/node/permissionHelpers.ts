/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequestedEvent } from '@github/copilot/sdk';
import { platform } from 'node:os';
import type { CancellationToken, ChatParticipantToolToken } from 'vscode';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { extUriBiasedIgnorePathCase } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart } from '../../../../vscodeTypes';
import { ToolName } from '../../../tools/common/toolNames';
import { IToolsService } from '../../../tools/common/toolsService';
import { createEditConfirmation, formatDiffAsUnified } from '../../../tools/node/editFileToolUtils';
import { getAffectedUrisForEditTool, getCdPresentationOverrides, ToolCall } from '../common/copilotCLITools';

type CoreTerminalConfirmationToolParams = {
	tool: ToolName.CoreTerminalConfirmationTool;
	input: {
		message: string;
		command: string | undefined;
		isBackground: boolean;
	};
}

type CoreConfirmationToolParams = {
	tool: ToolName.CoreConfirmationTool;
	input: {
		title: string;
		message: string;
		confirmationType: 'basic';
	};
}

export async function requestPermission(
	instaService: IInstantiationService,
	permissionRequest: PermissionRequest,
	toolCall: ToolCall | undefined,
	workingDirectory: URI | undefined,
	toolsService: IToolsService,
	toolInvocationToken: ChatParticipantToolToken,
	toolParentCallId: string | undefined,
	token: CancellationToken,
): Promise<boolean> {

	const toolParams = await getConfirmationToolParams(instaService, permissionRequest, toolCall, workingDirectory);
	if (!toolParams) {
		return true;
	}
	const { tool, input } = toolParams;
	const result = await toolsService.invokeTool(tool, { input, toolInvocationToken, subAgentInvocationId: toolParentCallId }, token);

	const firstResultPart = result.content.at(0);
	return (firstResultPart instanceof LanguageModelTextPart && firstResultPart.value === 'yes');
}

export async function requiresFileEditconfirmation(instaService: IInstantiationService, permissionRequest: PermissionRequest, toolCall?: ToolCall | undefined, workingDirectory?: URI): Promise<boolean> {
	const confirmationInfo = await getFileEditConfirmationToolParams(instaService, permissionRequest, toolCall, workingDirectory);
	return confirmationInfo !== undefined;
}

async function getFileEditConfirmationToolParams(instaService: IInstantiationService, permissionRequest: PermissionRequest, toolCall?: ToolCall | undefined, workingDirectory?: URI): Promise<CoreConfirmationToolParams | undefined> {
	if (permissionRequest.kind !== 'write') {
		return;
	}
	// Extract file name from the toolCall, thats more accurate, (as recommended by copilot cli sdk maintainers).
	// The fileName in permission request is primarily for UI display purposes.
	const file = getFileBeingEdited(permissionRequest, toolCall);
	if (!file) {
		return;
	}
	const details = async (accessor: ServicesAccessor) => {
		if (!toolCall) {
			return '';
		} else if (toolCall.toolName === 'str_replace_editor' && toolCall.arguments.path) {
			if (toolCall.arguments.command === 'edit' || toolCall.arguments.command === 'str_replace') {
				return getDetailsForFileEditPermissionRequest(accessor, toolCall.arguments);
			} else if (toolCall.arguments.command === 'create') {
				return getDetailsForFileCreatePermissionRequest(accessor, toolCall.arguments);
			} else if (toolCall.arguments.command === 'insert') {
				return getDetailsForFileInsertPermissionRequest(accessor, toolCall.arguments);
			}
		} else if (toolCall.toolName === 'edit') {
			return getDetailsForFileEditPermissionRequest(accessor, toolCall.arguments);
		} else if (toolCall.toolName === 'create') {
			return getDetailsForFileCreatePermissionRequest(accessor, toolCall.arguments);
		} else if (toolCall.toolName === 'insert') {
			return getDetailsForFileInsertPermissionRequest(accessor, toolCall.arguments);
		}
	};

	const getDetails = () => instaService.invokeFunction(details).then(d => d || '');
	const confirmationInfo = await instaService.invokeFunction(accessor => createEditConfirmation(accessor, [file], undefined, getDetails, undefined, () => workingDirectory));
	const confirmationMessage = confirmationInfo.confirmationMessages;
	if (!confirmationMessage) {
		return;
	}

	return {
		tool: ToolName.CoreConfirmationTool,
		input: {
			title: confirmationMessage.title,
			message: typeof confirmationMessage.message === 'string' ? confirmationMessage.message : confirmationMessage.message.value,
			confirmationType: 'basic'
		}
	};
}

async function getDetailsForFileInsertPermissionRequest(accessor: ServicesAccessor, args: Extract<ToolCall, { toolName: 'insert' }>['arguments']): Promise<string | undefined> {
	if (args.path && args.new_str) {
		return formatDiffAsUnified(accessor, URI.file(args.path), '', args.new_str);
	}
}
async function getDetailsForFileCreatePermissionRequest(accessor: ServicesAccessor, args: Extract<ToolCall, { toolName: 'create' }>['arguments']): Promise<string | undefined> {
	if (args.path && args.file_text) {
		return formatDiffAsUnified(accessor, URI.file(args.path), '', args.file_text);
	}
}
async function getDetailsForFileEditPermissionRequest(accessor: ServicesAccessor, args: Extract<ToolCall, { toolName: 'edit' | 'str_replace' }>['arguments']): Promise<string | undefined> {
	if (args.path && (args.new_str || args.old_str)) {
		return formatDiffAsUnified(accessor, URI.file(args.path), args.old_str ?? '', args.new_str ?? '');
	}
}

export function getFileBeingEdited(permissionRequest: PermissionRequest, toolCall?: ToolCall) {
	if (permissionRequest.kind !== 'write') {
		return;
	}
	// Get hold of file thats being edited if this is a edit tool call (requiring write permissions).
	const editFiles = toolCall ? getAffectedUrisForEditTool(toolCall) : undefined;
	// Sometimes we don't get a tool call id for the edit permission request
	const editFile = editFiles && editFiles.length ? editFiles[0] : (permissionRequest.fileName ? URI.file(permissionRequest.fileName) : undefined);
	return editFile;
}
/**
 * Pure function mapping a Copilot CLI permission request -> tool invocation params.
 * Keeps logic out of session class for easier unit testing.
 */
export async function getConfirmationToolParams(instaService: IInstantiationService, permissionRequest: PermissionRequest, toolCall?: ToolCall, workingDirectory?: URI, isWindows?: boolean): Promise<CoreTerminalConfirmationToolParams | CoreConfirmationToolParams | undefined> {
	if (permissionRequest.kind === 'shell') {
		isWindows = typeof isWindows === 'boolean' ? isWindows : platform() === 'win32';
		const isPowershell = isWindows;
		const fullCommandText = permissionRequest.fullCommandText || '';
		const userFriendlyCommand = fullCommandText ? getCdPresentationOverrides(fullCommandText, isPowershell, workingDirectory)?.commandLine : undefined;
		const command = userFriendlyCommand ?? fullCommandText;
		return {
			tool: ToolName.CoreTerminalConfirmationTool,
			input: {
				message: permissionRequest.intention || command || codeBlock(permissionRequest),
				command,
				isBackground: false
			}
		};
	}

	if (permissionRequest.kind === 'write') {
		const workspaceService = instaService.invokeFunction(accessor => accessor.get(IWorkspaceService));
		const editFile = getFileBeingEdited(permissionRequest, toolCall);

		// Determine the working/workspace folder this file belongs to.
		let workspaceFolderForFileBeingEdited: URI | undefined;
		if (editFile) {
			workspaceFolderForFileBeingEdited = workspaceService.getWorkspaceFolder(editFile);
			if (workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(editFile, workingDirectory)) {
				workspaceFolderForFileBeingEdited = workingDirectory;
			}
		}
		return getFileEditConfirmationToolParams(instaService, permissionRequest, toolCall, workspaceFolderForFileBeingEdited);
	}

	if (permissionRequest.kind === 'mcp') {
		const serverName = permissionRequest.serverName as string | undefined;
		const toolTitle = permissionRequest.toolTitle as string | undefined;
		const toolName = permissionRequest.toolName as string | undefined;
		const args = permissionRequest.args;
		return {
			tool: ToolName.CoreConfirmationTool,
			input: {
				title: toolTitle || `MCP Tool: ${toolName || 'Unknown'}`,
				message: serverName
					? `Server: ${serverName}\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``
					: `\`\`\`json\n${JSON.stringify(permissionRequest, null, 2)}\n\`\`\``,
				confirmationType: 'basic'
			}
		};
	}

	if (permissionRequest.kind === 'read' && typeof permissionRequest.intention === 'string' && permissionRequest.intention) {
		return {
			tool: ToolName.CoreConfirmationTool,
			input: {
				title: 'Read file(s)',
				message: permissionRequest.intention,
				confirmationType: 'basic'
			}
		};
	}

	return {
		tool: ToolName.CoreConfirmationTool,
		input: {
			title: 'Copilot CLI Permission Request',
			message: codeBlock(permissionRequest),
			confirmationType: 'basic'
		}
	};
}

function codeBlock(obj: Record<string, unknown>): string {
	return `\n\n\`\`\`\n${JSON.stringify(obj, null, 2)}\n\`\`\``;
}


/** TYPES FROM @github/copilot */

/**
 * A permission request which will be used to check tool or path usage against config and/or request user approval.
 */
export declare type PermissionRequest = PermissionRequestedEvent['data']['permissionRequest'];
