/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment, PermissionRequestedEvent } from '@github/copilot/sdk';
import { platform } from 'node:os';
import type { CancellationToken, ChatParticipantToolToken, ChatResponseStream } from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, Uri } from '../../../../vscodeTypes';
import { ToolName } from '../../../tools/common/toolNames';
import { IToolsService } from '../../../tools/common/toolsService';
import { createEditConfirmation, formatDiffAsUnified } from '../../../tools/node/editFileToolUtils';
import { ExternalEditTracker } from '../../common/externalEditTracker';
import { getWorkingDirectory, isIsolationEnabled, IWorkspaceInfo } from '../../common/workspaceInfo';
import { getAffectedUrisForEditTool, getCdPresentationOverrides, ToolCall } from '../common/copilotCLITools';
import { getCopilotCLISessionStateDir } from './cliHelpers';
import { ICopilotCLIImageSupport } from './copilotCLIImageSupport';

type CoreTerminalConfirmationToolParams = {
	tool: ToolName.CoreTerminalConfirmationTool;
	input: {
		message: string;
		command: string | undefined;
		isBackground: boolean;
	};
};

type CoreConfirmationToolParams = {
	tool: ToolName.CoreConfirmationTool;
	input: {
		title: string;
		message: string;
		confirmationType: 'basic';
	};
};

/**
 * The result of requesting permissions — the full union accepted by `Session.respondToPermission`.
 * Extracted from the SDK's second parameter type to stay in sync automatically.
 */
export type PermissionRequestResult = Parameters<import('@github/copilot/sdk').Session['respondToPermission']>[1];

/**
 * Handles `read` permission requests.
 * Auto-approves reads for workspace files, session resources, trusted images, and attached files.
 * Falls back to interactive confirmation for out-of-workspace reads.
 */
export async function handleReadPermission(
	sessionId: string,
	permissionRequest: Extract<PermissionRequest, { kind: 'read' }>,
	toolParentCallId: string | undefined,
	attachments: readonly Attachment[],
	imageSupport: ICopilotCLIImageSupport,
	workspaceInfo: IWorkspaceInfo,
	workspaceService: IWorkspaceService,
	toolsService: IToolsService,
	toolInvocationToken: ChatParticipantToolToken,
	logService: ILogService,
	token: CancellationToken,
): Promise<PermissionRequestResult> {
	const file = Uri.file(permissionRequest.path);

	if (imageSupport.isTrustedImage(file)) {
		return { kind: 'approved' };
	}

	if (isFileFromSessionWorkspace(file, workspaceInfo)) {
		logService.trace(`[CopilotCLISession] Auto Approving request to read file in session workspace ${permissionRequest.path}`);
		return { kind: 'approved' };
	}

	if (workspaceService.getWorkspaceFolder(file)) {
		logService.trace(`[CopilotCLISession] Auto Approving request to read workspace file ${permissionRequest.path}`);
		return { kind: 'approved' };
	}

	// Auto-approve reads of internal session resources (e.g. plan.md).
	const sessionDir = Uri.joinPath(Uri.file(getCopilotCLISessionStateDir()), sessionId);
	if (extUriBiasedIgnorePathCase.isEqualOrParent(file, sessionDir)) {
		logService.trace(`[CopilotCLISession] Auto Approving request to read Copilot CLI session resource ${permissionRequest.path}`);
		return { kind: 'approved' };
	}

	// Auto-approve if the file was explicitly attached by the user.
	if (attachments.some(attachment => attachment.type === 'file' && isEqual(Uri.file(attachment.path), file))) {
		logService.trace(`[CopilotCLISession] Auto Approving request to read attached file ${permissionRequest.path}`);
		return { kind: 'approved' };
	}

	const toolParams: CoreConfirmationToolParams = {
		tool: ToolName.CoreConfirmationTool,
		input: {
			title: 'Read file(s)',
			message: permissionRequest.intention || permissionRequest.path || codeBlock(permissionRequest),
			confirmationType: 'basic'
		}
	};
	return invokeConfirmationTool(toolParams, toolParentCallId, toolsService, toolInvocationToken, logService, token);
}

/**
 * Handles `write` permission requests.
 * Auto-approves writes within workspace/working directory (respecting isolation mode
 * and protected-file checks). Tracks edits via `ExternalEditTracker` when auto-approving.
 * Falls back to interactive confirmation for writes outside the workspace or to protected files.
 */
export async function handleWritePermission(
	sessionId: string,
	permissionRequest: Extract<PermissionRequest, { kind: 'write' }>,
	toolCall: ToolCall | undefined,
	toolParentCallId: string | undefined,
	stream: ChatResponseStream | undefined,
	editTracker: ExternalEditTracker,
	workspaceInfo: IWorkspaceInfo,
	workspaceService: IWorkspaceService,
	instantiationService: IInstantiationService,
	toolsService: IToolsService,
	toolInvocationToken: ChatParticipantToolToken,
	logService: ILogService,
	token: CancellationToken,
): Promise<PermissionRequestResult> {
	const workingDirectory = getWorkingDirectory(workspaceInfo);
	const editFile = getFileBeingEdited(permissionRequest, toolCall);

	// Auto-approve writes within the workspace/working directory when appropriate.
	if (workingDirectory && editFile) {
		const isWorkspaceFile = workspaceService.getWorkspaceFolder(editFile);
		const isWorkingDirectoryFile = !workspaceService.getWorkspaceFolder(workingDirectory) && extUriBiasedIgnorePathCase.isEqualOrParent(editFile, workingDirectory);

		let autoApprove = false;
		// If isolation is enabled, we only auto-approve writes within the working directory.
		if (isIsolationEnabled(workspaceInfo) && isWorkingDirectoryFile) {
			autoApprove = true;
		}
		// If its a workspace file, and not editing protected files, we auto-approve.
		if (!autoApprove && isWorkspaceFile && !(await requiresFileEditconfirmation(instantiationService, permissionRequest, toolCall))) {
			autoApprove = true;
		}
		// If we're working in the working directory (non-isolation), and not editing protected files, we auto-approve.
		if (!autoApprove && isWorkingDirectoryFile && !(await requiresFileEditconfirmation(instantiationService, permissionRequest, toolCall, workingDirectory))) {
			autoApprove = true;
		}

		if (autoApprove) {
			logService.trace(`[CopilotCLISession] Auto Approving request ${editFile.fsPath}`);
			await trackEditIfNeeded(editTracker, toolCall, editFile, stream, logService);
			return { kind: 'approved' };
		}
	}

	// Auto-approve writes to internal session resources (e.g. plan.md).
	const sessionDir = Uri.joinPath(Uri.file(getCopilotCLISessionStateDir()), sessionId);
	if (editFile && extUriBiasedIgnorePathCase.isEqualOrParent(editFile, sessionDir)) {
		logService.trace(`[CopilotCLISession] Auto Approving request to write to Copilot CLI session resource ${editFile.fsPath}`);
		return { kind: 'approved' };
	}

	// Fall back to interactive confirmation. If approved, track the edit.
	let workspaceFolderForFile: URI | undefined;
	if (editFile) {
		workspaceFolderForFile = workspaceService.getWorkspaceFolder(editFile);
		if (workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(editFile, workingDirectory)) {
			workspaceFolderForFile = workingDirectory;
		}
	}
	const toolParams = await getFileEditConfirmationToolParams(instantiationService, permissionRequest, toolCall, workspaceFolderForFile);
	if (!toolParams) {
		// No confirmation needed (e.g. no file to edit) — auto-approve.
		if (editFile) {
			await trackEditIfNeeded(editTracker, toolCall, editFile, stream, logService);
		}
		return { kind: 'approved' };
	}
	const result = await invokeConfirmationTool(toolParams, toolParentCallId, toolsService, toolInvocationToken, logService, token);
	if (result.kind === 'approved' && editFile) {
		await trackEditIfNeeded(editTracker, toolCall, editFile, stream, logService);
	}
	return result;
}

/**
 * Handles `shell` permission requests.
 * Builds a terminal confirmation prompt with the command text and intention,
 * stripping `cd` prefixes that match the working directory for cleaner display.
 */
export async function handleShellPermission(
	permissionRequest: Extract<PermissionRequest, { kind: 'shell' }>,
	toolParentCallId: string | undefined,
	workspaceInfo: IWorkspaceInfo,
	toolsService: IToolsService,
	toolInvocationToken: ChatParticipantToolToken,
	logService: ILogService,
	token: CancellationToken,
): Promise<PermissionRequestResult> {
	const toolParams = buildShellConfirmationParams(permissionRequest, getWorkingDirectory(workspaceInfo));
	return invokeConfirmationTool(toolParams, toolParentCallId, toolsService, toolInvocationToken, logService, token);
}

/**
 * Builds the terminal confirmation tool params for a shell permission request.
 * Pure function — no side effects, easy to test.
 */
export function buildShellConfirmationParams(
	permissionRequest: Extract<PermissionRequest, { kind: 'shell' }>,
	workingDirectory: URI | undefined,
	isWindows?: boolean,
): CoreTerminalConfirmationToolParams {
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

/**
 * Handles `mcp` permission requests.
 * Shows a confirmation dialog with the MCP server name, tool name, and arguments.
 */
export async function handleMcpPermission(
	permissionRequest: Extract<PermissionRequest, { kind: 'mcp' }>,
	toolParentCallId: string | undefined,
	toolsService: IToolsService,
	toolInvocationToken: ChatParticipantToolToken,
	logService: ILogService,
	token: CancellationToken,
): Promise<PermissionRequestResult> {
	const toolParams = buildMcpConfirmationParams(permissionRequest);
	return invokeConfirmationTool(toolParams, toolParentCallId, toolsService, toolInvocationToken, logService, token);
}

/**
 * Builds the confirmation tool params for an MCP permission request.
 * Pure function — no side effects, easy to test.
 */
export function buildMcpConfirmationParams(
	permissionRequest: Extract<PermissionRequest, { kind: 'mcp' }>,
): CoreConfirmationToolParams {
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

/**
 * Invokes a confirmation tool and returns a `PermissionRequestResult` based on the user's response.
 */
async function invokeConfirmationTool(
	toolParams: CoreTerminalConfirmationToolParams | CoreConfirmationToolParams,
	toolParentCallId: string | undefined,
	toolsService: IToolsService,
	toolInvocationToken: ChatParticipantToolToken,
	logService: ILogService,
	token: CancellationToken,
): Promise<PermissionRequestResult> {
	try {
		const { tool, input } = toolParams;
		const result = await toolsService.invokeTool(tool, { input, toolInvocationToken, subAgentInvocationId: toolParentCallId }, token);
		const firstResultPart = result.content.at(0);
		if (firstResultPart instanceof LanguageModelTextPart && typeof firstResultPart.value === 'string' && firstResultPart.value.toLowerCase() === 'yes') {
			return { kind: 'approved' };
		}
	} catch (error) {
		logService.error(error, `[CopilotCLISession] Permission request error`);
	}
	return { kind: 'denied-interactively-by-user' };
}

/**
 * Shows a generic interactive permission prompt to the user.
 * Used as the fallback for permission kinds without a dedicated handler (url, memory, custom-tool, hook).
 */
export async function showInteractivePermissionPrompt(
	permissionRequest: PermissionRequest,
	toolParentCallId: string | undefined,
	toolsService: IToolsService,
	toolInvocationToken: ChatParticipantToolToken,
	logService: ILogService,
	token: CancellationToken,
): Promise<PermissionRequestResult> {
	const toolParams: CoreConfirmationToolParams = {
		tool: ToolName.CoreConfirmationTool,
		input: {
			title: 'Copilot CLI Permission Request',
			message: codeBlock(permissionRequest),
			confirmationType: 'basic'
		}
	};
	return invokeConfirmationTool(toolParams, toolParentCallId, toolsService, toolInvocationToken, logService, token);
}

/**
 * Checks whether a file belongs to the session's workspace, working directory,
 * or repository (when using worktrees).
 */
export function isFileFromSessionWorkspace(file: URI, workspaceInfo: IWorkspaceInfo): boolean {
	const workingDirectory = getWorkingDirectory(workspaceInfo);
	if (workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(file, workingDirectory)) {
		return true;
	}
	if (workspaceInfo.folder && extUriBiasedIgnorePathCase.isEqualOrParent(file, workspaceInfo.folder)) {
		return true;
	}
	// Only if we have a worktree should we check the repository.
	// As this means the user created a worktree and we have a repository.
	// & if the worktree is automatically trusted, then so is the repository as we created the worktree from that.
	if (workspaceInfo.worktree && workspaceInfo.repository && extUriBiasedIgnorePathCase.isEqualOrParent(file, workspaceInfo.repository)) {
		return true;
	}
	return false;
}

/**
 * Starts edit tracking if we have a tool call and a stream.
 * This ensures the UI shows the edit-in-progress indicator and waits for core to acknowledge the edit.
 */
async function trackEditIfNeeded(editTracker: ExternalEditTracker, toolCall: ToolCall | undefined, editFile: URI, stream: ChatResponseStream | undefined, logService: ILogService): Promise<void> {
	if (toolCall && stream) {
		try {
			await editTracker.trackEdit(toolCall.toolCallId, [editFile], stream);
		} catch (error) {
			logService.error(error, `[CopilotCLISession] Failed to track edit for toolCallId ${toolCall.toolCallId}`);
		}
	}
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

export function getFileBeingEdited(permissionRequest: Extract<PermissionRequest, { kind: 'write' }>, toolCall?: ToolCall) {
	// Get hold of file thats being edited if this is a edit tool call (requiring write permissions).
	const editFiles = toolCall ? getAffectedUrisForEditTool(toolCall) : undefined;
	// Sometimes we don't get a tool call id for the edit permission request
	const editFile = editFiles && editFiles.length ? editFiles[0] : (permissionRequest.fileName ? URI.file(permissionRequest.fileName) : undefined);
	return editFile;
}
function codeBlock(obj: Record<string, unknown>): string {
	return `\n\n\`\`\`\n${JSON.stringify(obj, null, 2)}\n\`\`\``;
}


/** TYPES FROM @github/copilot */

/**
 * A permission request which will be used to check tool or path usage against config and/or request user approval.
 */
export declare type PermissionRequest = PermissionRequestedEvent['data']['permissionRequest'];
