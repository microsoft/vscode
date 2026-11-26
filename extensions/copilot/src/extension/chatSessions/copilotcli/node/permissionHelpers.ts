/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment, PermissionRequestedEvent } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
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
import { getWorkspaceFileExternalConfirmation } from '../../../tools/node/toolUtils';
import { ExternalEditTracker } from '../../common/externalEditTracker';
import { getWorkingDirectory, isIsolationEnabled, IWorkspaceInfo } from '../../common/workspaceInfo';
import { getAffectedUrisForEditTool, getCdPresentationOverrides, ToolCall } from '../common/copilotCLITools';
import type { Session } from '../common/utils';
import { getCopilotCLISessionStateDir } from './cliHelpers';
import { ICopilotCLIImageSupport } from './copilotCLIImageSupport';

type CoreTerminalConfirmationToolParams = {
	tool: ToolName.CoreTerminalConfirmationTool;
	input: {
		message: string;
		command: string | undefined;
		isBackground: boolean;
		sandboxBypass?: boolean;
		sandboxBypassReason?: string;
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
export type PermissionRequestResult = Parameters<Session['respondToPermission']>[1];

/**
 * Handles `read` permission requests.
 * Auto-approves reads for workspace files, session resources, trusted images, and attached files.
 * Workspace membership is based on the resolved path, so a workspace symlink to an outside file still requires confirmation.
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
		return { kind: 'approve-once' };
	}

	// Lexical membership is not enough: a symlink inside the workspace can resolve outside it.
	let boundaryViolation: BoundaryViolation | undefined;
	if (getTrustedReadRoot(file, workspaceInfo, workspaceService)) {
		const check = await checkResolvedBoundary(file, candidate => getTrustedReadRoot(candidate, workspaceInfo, workspaceService), logService, 'read');
		if (check.kind === 'inside') {
			logService.trace(`[CopilotCLISession] Auto Approving request to read workspace file ${permissionRequest.path}`);
			return { kind: 'approve-once' };
		}
		boundaryViolation = check;
	}

	// Auto-approve reads of internal session resources (e.g. plan.md).
	const sessionDir = Uri.joinPath(Uri.file(getCopilotCLISessionStateDir()), sessionId);
	if (extUriBiasedIgnorePathCase.isEqualOrParent(file, sessionDir)) {
		logService.trace(`[CopilotCLISession] Auto Approving request to read Copilot CLI session resource ${permissionRequest.path}`);
		return { kind: 'approve-once' };
	}

	// Auto-approve if the file was explicitly attached by the user.
	if (attachments.some(attachment => attachment.type === 'file' && isEqual(Uri.file(attachment.path), file))) {
		logService.trace(`[CopilotCLISession] Auto Approving request to read attached file ${permissionRequest.path}`);
		return { kind: 'approve-once' };
	}

	const baseMessage = permissionRequest.intention || permissionRequest.path || codeBlock(permissionRequest);
	const toolParams: CoreConfirmationToolParams = {
		tool: ToolName.CoreConfirmationTool,
		input: {
			title: 'Read file(s)',
			message: boundaryViolation ? `${baseMessage}\n\n${describeBoundaryViolation(file, boundaryViolation)}` : baseMessage,
			confirmationType: 'basic'
		}
	};
	return invokeConfirmationTool(toolParams, toolParentCallId, toolsService, toolInvocationToken, logService, token);
}

/**
 * Returns the session or workspace root that lexically contains `file`.
 * The returned root is the boundary used to decide whether a resolved path is still trusted.
 */
function getTrustedReadRoot(file: URI, workspaceInfo: IWorkspaceInfo, workspaceService: IWorkspaceService): URI | undefined {
	return getSessionReadRoot(file, workspaceInfo) ?? workspaceService.getWorkspaceFolder(file);
}

/**
 * Returns the session working directory, folder, or (for worktrees) repository that lexically contains `file`.
 */
function getSessionReadRoot(file: URI, workspaceInfo: IWorkspaceInfo): URI | undefined {
	const workingDirectory = getWorkingDirectory(workspaceInfo);
	if (workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(file, workingDirectory)) {
		return workingDirectory;
	}
	if (workspaceInfo.folder && extUriBiasedIgnorePathCase.isEqualOrParent(file, workspaceInfo.folder)) {
		return workspaceInfo.folder;
	}
	// Only if we have a worktree should we check the repository.
	// As this means the user created a worktree and we have a repository.
	// & if the worktree is automatically trusted, then so is the repository as we created the worktree from that.
	if (workspaceInfo.worktree && workspaceInfo.repository && extUriBiasedIgnorePathCase.isEqualOrParent(file, workspaceInfo.repository)) {
		return workspaceInfo.repository;
	}
	return undefined;
}

/**
 * Why a lexically trusted path still needs confirmation: it resolves to `target` outside
 * the boundary, or its real location could not be determined.
 */
type BoundaryViolation =
	| { readonly kind: 'escaped'; readonly target: URI }
	| { readonly kind: 'unresolved' };

type BoundaryCheck = { readonly kind: 'inside' } | BoundaryViolation;

/**
 * Resolves symlinks and junctions in `file` and checks the result against the roots selected by `getRoot`.
 * `getRoot` defines the trust boundary. Resolution failures fail closed as `unresolved`.
 */
async function checkResolvedBoundary(file: URI, getRoot: (candidate: URI) => URI | undefined, logService: ILogService, purpose: 'read' | 'write'): Promise<BoundaryCheck> {
	try {
		const { needsConfirmation, realPath } = await getWorkspaceFileExternalConfirmation(file, getRoot);
		if (!needsConfirmation) {
			return { kind: 'inside' };
		}
		if (realPath) {
			logService.trace(`[CopilotCLISession] Not auto-approving ${purpose} that resolves outside the trusted folder: ${file.fsPath} -> ${realPath.fsPath}`);
			return { kind: 'escaped', target: realPath };
		}
	} catch (error) {
		logService.warn(`[CopilotCLISession] Failed to resolve ${purpose} path ${file.fsPath}; requiring confirmation: ${error instanceof Error ? error.message : String(error)}`);
	}
	return { kind: 'unresolved' };
}

/**
 * Describes a boundary violation in a confirmation prompt.
 */
function describeBoundaryViolation(file: URI, violation: BoundaryViolation): string {
	return violation.kind === 'escaped'
		? l10n.t('{0} resolves through a link to {1}, which is outside the trusted folder.', file.fsPath, violation.target.fsPath)
		: l10n.t('Could not determine where {0} resolves, so it may be outside the trusted folder.', file.fsPath);
}

/**
 * The folder that justifies auto-approving a write, and why it is trusted.
 * - `isolation`: the isolated worktree; writes skip the protected-file check.
 * - `workingDirectory` / `workspace`: writes are subject to the protected-file check.
 * - `sessionState`: Copilot CLI session resources (e.g. plan.md).
 */
interface IWriteBoundary {
	readonly kind: 'isolation' | 'workingDirectory' | 'workspace' | 'sessionState';
	readonly root: URI;
	/** Roots a resolved path may land in without leaving the boundary. */
	readonly trustedRoots: readonly URI[];
}

/**
 * Selects the boundary that may justify auto-approving a write to `editFile`, if any.
 */
function getWriteBoundary(editFile: URI, workspaceInfo: IWorkspaceInfo, workspaceService: IWorkspaceService, sessionDir: URI): IWriteBoundary | undefined {
	const workingDirectory = getWorkingDirectory(workspaceInfo);
	const workspaceFolder = workspaceService.getWorkspaceFolder(editFile);
	if (workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(editFile, workingDirectory)) {
		// If isolation is enabled, only the working directory itself is trusted.
		if (isIsolationEnabled(workspaceInfo) && !workspaceService.getWorkspaceFolder(workingDirectory)) {
			return { kind: 'isolation', root: workingDirectory, trustedRoots: [workingDirectory] };
		}
		// The protected-file check is relative to the working directory, so a link must stay inside it.
		return { kind: 'workingDirectory', root: workingDirectory, trustedRoots: [workingDirectory] };
	}
	if (workspaceFolder) {
		return { kind: 'workspace', root: workspaceFolder, trustedRoots: [workspaceFolder] };
	}
	if (extUriBiasedIgnorePathCase.isEqualOrParent(editFile, sessionDir)) {
		return { kind: 'sessionState', root: sessionDir, trustedRoots: [sessionDir] };
	}
	return undefined;
}

/**
 * Handles `write` permission requests.
 * Auto-approves writes within the workspace, working directory, or session resources (respecting
 * isolation mode and protected-file checks). The boundary is checked against the resolved path,
 * so a symlink or junction that leaves it still requires confirmation.
 * Tracks edits via `ExternalEditTracker` when approved.
 * Falls back to interactive confirmation for writes outside these boundaries or to protected files.
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
	const editFile = getFileBeingEdited(permissionRequest, toolCall);

	// Builds the edit confirmation and tracks the edit if it is approved (or needs no confirmation).
	const confirm = async (options: IEditConfirmationOptions): Promise<PermissionRequestResult> => {
		const toolParams = await getFileEditConfirmationToolParams(instantiationService, permissionRequest, toolCall, options);
		if (!toolParams) {
			if (options.forceConfirmationReason) {
				logService.warn(`[CopilotCLISession] Failed to build confirmation for write that leaves the trusted folder: ${editFile?.fsPath ?? permissionRequest.fileName}`);
				return { kind: 'denied-interactively-by-user' };
			}
			// No confirmation needed (e.g. no file to edit) — auto-approve.
			if (editFile) {
				await trackEditIfNeeded(editTracker, toolCall, editFile, stream, logService);
			}
			return { kind: 'approve-once' };
		}
		const result = await invokeConfirmationTool(toolParams, toolParentCallId, toolsService, toolInvocationToken, logService, token);
		if (result.kind === 'approve-once' && editFile) {
			await trackEditIfNeeded(editTracker, toolCall, editFile, stream, logService);
		}
		return result;
	};

	const sessionDir = Uri.joinPath(Uri.file(getCopilotCLISessionStateDir()), sessionId);
	const boundary = editFile && getWriteBoundary(editFile, workspaceInfo, workspaceService, sessionDir);
	if (!editFile || !boundary) {
		return confirm({});
	}

	// Resolve before the protected-file check, which is evaluated relative to the boundary root.
	const check = await checkResolvedBoundary(
		editFile,
		candidate => boundary.trustedRoots.find(root => extUriBiasedIgnorePathCase.isEqualOrParent(candidate, root)),
		logService,
		'write',
	);
	if (check.kind !== 'inside') {
		return confirm({ forceConfirmationReason: describeBoundaryViolation(editFile, check) });
	}

	switch (boundary.kind) {
		case 'isolation':
			logService.trace(`[CopilotCLISession] Auto Approving request ${editFile.fsPath}`);
			await trackEditIfNeeded(editTracker, toolCall, editFile, stream, logService);
			return { kind: 'approve-once' };
		case 'sessionState':
			logService.trace(`[CopilotCLISession] Auto Approving request to write to Copilot CLI session resource ${editFile.fsPath}`);
			return { kind: 'approve-once' };
		case 'workingDirectory':
		case 'workspace':
			return confirm({ workingDirectory: boundary.root });
	}
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

	// When the model opted this command out of the sandbox, surface that to the
	// user so the confirmation makes the elevation of privilege clear (the
	// terminal confirmation tool renders its own title, so the note must be
	// passed as a dedicated flag rather than baked into the message).
	const sandboxBypass = permissionRequest.requestSandboxBypass === true;
	const sandboxBypassReason = sandboxBypass ? permissionRequest.requestSandboxBypassReason : undefined;

	return {
		tool: ToolName.CoreTerminalConfirmationTool,
		input: {
			message: permissionRequest.intention || command || codeBlock(permissionRequest),
			command,
			isBackground: false,
			...(sandboxBypass ? { sandboxBypass: true } : {}),
			...(sandboxBypassReason ? { sandboxBypassReason } : {}),
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
			return { kind: 'approve-once' };
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
	return !!getSessionReadRoot(file, workspaceInfo);
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

/**
 * Whether writing the requested file needs confirmation because it is a protected file.
 * Every path, including symlink targets, is treated as inside `workingDirectory`, so resolve and verify
 * the path first (see {@link checkResolvedBoundary}). Without `workingDirectory`, every file path needs confirmation.
 */
export async function requiresFileEditconfirmation(instaService: IInstantiationService, permissionRequest: PermissionRequest, toolCall?: ToolCall | undefined, workingDirectory?: URI): Promise<boolean> {
	const confirmationInfo = await getFileEditConfirmationToolParams(instaService, permissionRequest, toolCall, { workingDirectory });
	return confirmationInfo !== undefined;
}

interface IEditConfirmationOptions {
	/**
	 * The folder every path in the edit is treated as belonging to when checking protected files.
	 * Symlink targets are treated as inside it too, so only pass it after verifying that the
	 * resolved path stays inside (see {@link checkResolvedBoundary}).
	 */
	readonly workingDirectory?: URI;
	/** When set, always require confirmation and show this reason. */
	readonly forceConfirmationReason?: string;
}

async function getFileEditConfirmationToolParams(instaService: IInstantiationService, permissionRequest: PermissionRequest, toolCall: ToolCall | undefined, { workingDirectory, forceConfirmationReason }: IEditConfirmationOptions): Promise<CoreConfirmationToolParams | undefined> {
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
	const confirmationInfo = await instaService.invokeFunction(accessor => createEditConfirmation(accessor, [file], undefined, getDetails, forceConfirmationReason, () => workingDirectory));
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
function codeBlock(obj: unknown): string {
	return `\n\n\`\`\`\n${JSON.stringify(obj, null, 2)}\n\`\`\``;
}


/** TYPES FROM @github/copilot */

/**
 * A permission request which will be used to check tool or path usage against config and/or request user approval.
 */
export declare type PermissionRequest = PermissionRequestedEvent['data']['permissionRequest'];
