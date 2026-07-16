/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { realpath as fsRealpath } from 'fs';
import { homedir } from 'os';
import { promisify } from 'util';
import { match as globMatch } from '../../../base/common/glob.js';
import { untildify } from '../../../base/common/labels.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import * as path from '../../../base/common/path.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../base/common/resources.js';
import { isDefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, platformRootSchema, platformSessionSchema } from '../common/agentHostSchema.js';
import type { IAgentToolPendingConfirmationSignal } from '../common/agentService.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { ConfirmationOptionKind, type ConfirmationOption } from '../common/state/protocol/state.js';
import { ActionType, type IToolCallReadyAction } from '../common/state/sessionActions.js';
import {
	isAhpChatChannel,
	parseRequiredSessionUriFromChatUri,
	ResponsePartKind,
	ToolCallConfirmationReason,
	type URI as ProtocolURI,
} from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { CommandAutoApprover } from './commandAutoApprover.js';

/**
 * Event fields needed for auto-approval decisions.
 * Matches the subset of {@link IAgentToolPendingConfirmationSignal} used by the
 * approval pipeline.
 */
export interface IToolApprovalEvent {
	readonly toolCallId: string;
	readonly session: URI;
	readonly permissionKind?: IAgentToolPendingConfirmationSignal['permissionKind'];
	readonly permissionPath?: string;
	readonly toolInput?: string;
	readonly requestSandboxBypass?: boolean;
}

/** Standard per-tool confirmation options presented to the user. */
const ALLOW_SESSION_OPTION_ID = 'allow-session';
const CONFIRMATION_OPTIONS: readonly ConfirmationOption[] = [
	{ id: ALLOW_SESSION_OPTION_ID, label: localize('sessionPermissions.allowSession', "Allow in this Session"), kind: ConfirmationOptionKind.Approve, group: 1 },
	{ id: 'allow-once', label: localize('sessionPermissions.allowOnce', "Allow Once"), kind: ConfirmationOptionKind.Approve },
	{ id: 'skip', label: localize('sessionPermissions.skip', "Skip"), kind: ConfirmationOptionKind.Deny, group: 2 },
];

/** Default write-path glob rules applied to auto-approved edits. */
const DEFAULT_EDIT_AUTO_APPROVE_PATTERNS: Readonly<Record<string, boolean>> = {
	'**/*': true,
	'**/.vscode/*.json': false,
	'**/.git/**': false,
	'**/{package.json,server.xml,build.rs,web.config,.gitattributes,.env}': false,
	'**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props}': false,
	'**/*.lock': false,
	'**/*-lock.{yaml,json}': false,
};

const HOME_DIR = URI.file(homedir());

/**
 * Absolute directory prefixes whose contents are platform configuration data
 * (e.g. `~/Library`, `%APPDATA%`). Writes under these require confirmation
 * unless the working directory itself lives inside the restricted directory.
 */
const PLATFORM_RESTRICTED_DIRS: readonly string[] = (
	isWindows
		? [process.env.APPDATA, process.env.LOCALAPPDATA]
		: isMacintosh
			? [homedir() + '/Library']
			: []
).filter(isDefined);

const realpath = promisify(fsRealpath);

/**
 * Validates that a path doesn't contain suspicious characters that could be
 * used to bypass security checks on Windows (e.g. NTFS Alternate Data Streams,
 * invalid characters, reserved device names). Throws if the path is suspicious.
 */
function assertPathIsSafe(fsPath: string, _isWindows = isWindows): void {
	if (fsPath.includes('\0')) {
		throw new Error(`Path contains null bytes: ${fsPath}`);
	}

	if (!_isWindows) {
		return;
	}

	// Check for NTFS Alternate Data Streams (ADS)
	const colonIndex = fsPath.indexOf(':', 2);
	if (colonIndex !== -1) {
		throw new Error(`Path contains invalid characters (alternate data stream): ${fsPath}`);
	}

	// Check for invalid Windows filename characters
	const invalidChars = /[<>"|?*]/;
	const pathAfterDrive = fsPath.length > 2 ? fsPath.substring(2) : fsPath;
	if (invalidChars.test(pathAfterDrive)) {
		throw new Error(`Path contains invalid characters: ${fsPath}`);
	}

	// Check for named pipes or device paths
	if (fsPath.startsWith('\\\\.') || fsPath.startsWith('\\\\?')) {
		throw new Error(`Path is a reserved device path: ${fsPath}`);
	}

	const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

	// Check for trailing dots and spaces on path components (Windows quirk)
	const parts = fsPath.split('\\');
	for (const part of parts) {
		if (part.length === 0) {
			continue;
		}

		if (reserved.test(part)) {
			throw new Error(`Reserved device name in path: ${fsPath}`);
		}

		if (part.endsWith('.') || part.endsWith(' ')) {
			throw new Error(`Path contains invalid trailing characters: ${fsPath}`);
		}

		const tildeIndex = part.indexOf('~');
		if (tildeIndex !== -1) {
			const afterTilde = part.substring(tildeIndex + 1);
			if (afterTilde.length > 0 && /^\d/.test(afterTilde)) {
				throw new Error(`Path appears to use short filename format (8.3 names): ${fsPath}. Please use the full path.`);
			}
		}
	}
}

/**
 * Resolves the real path of `resource`, walking up the parent chain when the path
 * (or its ancestors) does not yet exist on disk. This ensures a symlink at any
 * ancestor is followed even for files that are about to be created.
 */
async function resolveRealPathForNonexistent(resource: URI, realpath: (fsPath: string) => Promise<string>): Promise<URI> {
	const fsPath = resource.fsPath;
	try {
		return URI.file(await realpath(fsPath));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw e;
		}
	}

	const tail: string[] = [path.basename(fsPath)];
	let current = path.dirname(fsPath);
	while (true) {
		const parent = path.dirname(current);
		if (parent === current) {
			// Reached the filesystem root without finding an existing ancestor.
			return resource;
		}
		try {
			const resolved = await realpath(current);
			return URI.file(path.join(resolved, ...tail));
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code;
			if (code !== 'ENOENT' && code !== 'ENOTDIR') {
				throw e;
			}
		}
		tail.unshift(path.basename(current));
		current = parent;
	}
}

/**
 * Single entry point for all tool-call approval logic in the agent host.
 *
 * Modeled after {@link ILanguageModelToolsConfirmationService} in the
 * workbench layer, this manager owns:
 *
 * - **Auto-approval** (`getAutoApproval`) — checks session-level config,
 *   per-tool session permissions, read/write path rules, and shell
 *   command rules. Returns a {@link ToolCallConfirmationReason} when
 *   the tool should be auto-approved, or `undefined` when user
 *   confirmation is needed.
 *
 * - **Confirmation options** (`createToolReadyAction`) — constructs the
 *   protocol action with the standard "Allow Once / Allow in this
 *   Session / Skip" options baked in.
 *
 * - **Post-confirmation side effects** (`handleToolCallConfirmed`) —
 *   persists the user's choice (e.g. adding a tool to the session
 *   permissions list).
 */
export class SessionPermissionManager extends Disposable {

	// ---- Edit auto-approve patterns -----------------------------------------

	private readonly _commandAutoApprover: CommandAutoApprover;
	private readonly _realpath: (fsPath: string) => Promise<string>;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		options: { realpath?: (fsPath: string) => Promise<string> },
		@IAgentConfigurationService private readonly _configService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._realpath = options?.realpath ?? realpath;
		this._commandAutoApprover = this._register(new CommandAutoApprover(this._logService));
	}

	/**
	 * Initializes async resources (tree-sitter WASM) used for shell command
	 * auto-approval. Await this before any session events can arrive so that
	 * shell command parsing within {@link getAutoApproval} is synchronous.
	 */
	initialize(): Promise<void> {
		return this._commandAutoApprover.initialize();
	}

	// ---- Auto-approval (analogous to getPreConfirmAction) -------------------

	/**
	 * Checks whether a `tool_ready` event should be auto-approved. Returns a
	 * {@link ToolCallConfirmationReason} when the tool call should proceed
	 * without user interaction, or `undefined` when user confirmation is
	 * required.
	 *
	 * Checks are evaluated in order:
	 * 1. Global auto-approve setting (`chat.tools.global.autoApprove`)
	 * 2. Session-level bypass (`autoApprove` config)
	 * 3. Per-tool session permissions (`permissions.allow`)
	 * 4. Read path rules (within working directory)
	 * 5. Write path rules (within working directory + glob patterns)
	 * 6. Shell command rules (tree-sitter parsed, default allow/deny)
	 */
	async getAutoApproval(e: IToolApprovalEvent, sessionKey: ProtocolURI): Promise<ToolCallConfirmationReason | undefined> {
		const workDir = this._configService.getEffectiveWorkingDirectory(sessionKey);
		const workingDirectory = workDir ? URI.parse(workDir) : undefined;

		// 0. Sandbox bypass: a shell command that opted out of the
		// sandbox (`requestSandboxBypass`) escapes the sandbox's
		// containment.
		if (e.requestSandboxBypass) {
			return undefined;
		}

		// 1. Global auto-approve setting
		if (this.isGlobalAutoApproveEnabled()) {
			return ToolCallConfirmationReason.Setting;
		}

		// 2. Session-level auto-approve
		if (this.isSessionAutoApproveEnabled(sessionKey)) {
			return ToolCallConfirmationReason.Setting;
		}

		// 3. Per-tool session permissions
		if (this._isToolAllowedByPermissions(sessionKey, e.toolCallId)) {
			return ToolCallConfirmationReason.Setting;
		}

		// 4. Read auto-approval
		if (e.permissionKind === 'read' && e.permissionPath) {
			if (await this._isReadAutoApproved(URI.file(e.permissionPath), workingDirectory)) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving read of ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			return undefined;
		}

		// 5. Write auto-approval
		if (e.permissionKind === 'write' && e.permissionPath) {
			if (await this._isEditAutoApproved(URI.file(e.permissionPath), workingDirectory)) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving write to ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			return undefined;
		}

		// 6. Shell auto-approval
		if (e.permissionKind === 'shell' && e.toolInput) {
			if (this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveEnabledConfigKey) === false) {
				return undefined;
			}
			const result = this._commandAutoApprover.shouldAutoApprove(e.toolInput, {
				autoApproveRules: this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveRulesConfigKey),
				isWriteDestApproved: dest => this._isShellWriteDestApproved(dest, workingDirectory),
			});
			if (result === 'approved') {
				this._logService.trace('[SessionPermissionManager] Auto-approving shell command');
				return ToolCallConfirmationReason.NotNeeded;
			}
			if (result === 'denied') {
				this._logService.trace('[SessionPermissionManager] Shell command denied by rule');
			}
			return undefined;
		}

		return undefined;
	}

	/**
	 * Returns whether VS Code's global auto-approve setting (`chat.tools.global.autoApprove`) is enabled.
	 * When enabled, every tool call is auto-approved without changing the session's approval level in the permissions picker.
	 */
	isGlobalAutoApproveEnabled(): boolean {
		return this._configService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true;
	}

	getEffectiveApprovalLevel(sessionKey: ProtocolURI): string {
		return this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove) ?? 'default';
	}

	isSessionAutoApproveEnabled(sessionKey: ProtocolURI): boolean {
		// `autoApprove` (Allow All) auto-approves every tool call.
		return this.getEffectiveApprovalLevel(sessionKey) === 'autoApprove';
	}

	// ---- Action construction (analogous to getPreConfirmActions) -------------

	/**
	 * Constructs a `ChatToolCallReady` action from an agent
	 * `pending_confirmation` signal. When the tool needs user confirmation
	 * (the protocol state carries `confirmationTitle`), the standard
	 * confirmation options are baked in so clients can render them directly.
	 */
	createToolReadyAction(e: IAgentToolPendingConfirmationSignal, _sessionKey: ProtocolURI, turnId: string): IToolCallReadyAction {
		const state = e.state;
		if (state.confirmationTitle) {
			return {
				type: ActionType.ChatToolCallReady,
				turnId,
				toolCallId: state.toolCallId,
				invocationMessage: state.invocationMessage,
				toolInput: state.toolInput,
				confirmationTitle: state.confirmationTitle,
				riskAssessment: state.riskAssessment,
				edits: state.edits,
				editable: state.editable,
				...(state._meta ? { _meta: state._meta } : {}),
				// Agents can supply tool-specific buttons (e.g. ExitPlanMode's
				// `Approve`/`Deny`) by populating `state.options`. The standard
				// `Allow Once / Allow in this Session / Skip` set is the default.
				options: state.options ? state.options.slice() : CONFIRMATION_OPTIONS.slice(),
			};
		}
		return {
			type: ActionType.ChatToolCallReady,
			turnId,
			toolCallId: state.toolCallId,
			invocationMessage: state.invocationMessage,
			toolInput: state.toolInput,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			...(state._meta ? { _meta: state._meta } : {}),
		};
	}

	// ---- Post-confirmation side effects -------------------------------------

	/**
	 * Handles the side effect of a `ChatToolCallConfirmed` action when the
	 * user selected "Allow in this Session". Adds the tool to the session's
	 * permission allow list so future calls are auto-approved.
	 */
	handleToolCallConfirmed(chatChannel: ProtocolURI, toolCallId: string, selectedOptionId: string | undefined): void {
		if (!isAhpChatChannel(chatChannel)) {
			throw new Error(`Tool call confirmations must be handled on an AHP chat channel: ${chatChannel}`);
		}
		const sessionKey = parseRequiredSessionUriFromChatUri(chatChannel);
		if (selectedOptionId === ALLOW_SESSION_OPTION_ID) {
			const toolName = this._getToolNameForToolCall(chatChannel, toolCallId);
			if (toolName) {
				this._addToolToSessionPermissions(sessionKey, toolName);
			}
		}
	}

	// ---- Internal helpers ---------------------------------------------------

	private async _isReadAutoApproved(resource: URI, workingDirectory: URI | undefined): Promise<boolean> {
		if (!workingDirectory) {
			return false;
		}

		const [resourcesToCheck, workingDirectories] = await Promise.all([
			this._resolveResourcesForApproval(resource),
			this._resolveResourcesForApproval(workingDirectory),
		]);
		return resourcesToCheck !== undefined
			&& workingDirectories !== undefined
			&& resourcesToCheck.every(candidate => workingDirectories.some(directory => this._isResourceInDirectory(candidate, directory)));
	}

	private _isResourceInWorkingDirectory(resource: URI, workingDirectory: URI | undefined): boolean {
		return workingDirectory !== undefined && this._isResourceInDirectory(resource, workingDirectory);
	}

	private _isResourceInDirectory(resource: URI, directory: URI): boolean {
		return extUriBiasedIgnorePathCase.isEqualOrParent(normalizePath(resource), normalizePath(directory));
	}

	/**
	 * Checks whether a shell write-redirection destination (e.g. the `out.txt`
	 * in `echo hi > out.txt`) should be auto-approved by reusing the same
	 * rules that govern write tool calls: the destination must resolve to a
	 * path inside the working directory and must not match a denied glob.
	 */
	private _isShellWriteDestApproved(dest: string, workingDirectory: URI | undefined): boolean {
		const resource = this._resolveShellRedirectResource(dest, workingDirectory);
		if (!resource) {
			return false;
		}
		return this._checkWriteResource(resource, workingDirectory);
	}

	/**
	 * Resolves the raw text of a shell redirect destination to an absolute
	 * filesystem path. `~` is expanded to the user's home directory; the
	 * downstream working-directory check rejects paths that end up outside
	 * the workspace. Returns `undefined` when resolution would require a
	 * working directory that isn't configured.
	 */
	private _resolveShellRedirectResource(dest: string, workingDirectory: URI | undefined): URI | undefined {
		const trimmed = untildify(dest.trim(), homedir());
		if (!trimmed) {
			return undefined;
		}
		if (path.isAbsolute(trimmed)) {
			return URI.file(trimmed);
		}
		if (!workingDirectory) {
			return undefined;
		}
		return URI.file(path.resolve(workingDirectory.fsPath, trimmed));
	}

	/**
	 * Determines whether a write to `resource` can be auto-approved. Mirrors the
	 * checks performed by the workbench edit-confirmation pipeline:
	 *
	 * 1. The path is resolved through any symlinks (following ancestors that do
	 *    not yet exist) so a link can't redirect an edit outside the working
	 *    directory. Both the literal and resolved paths must pass every check.
	 * 2. The path must be free of suspicious characters (see {@link assertPathIsSafe}).
	 * 3. The path must live inside the working directory.
	 * 4. The path must not target a platform-restricted location (home dotfiles,
	 *    `~/Library`, `%APPDATA%`, ...).
	 * 5. The path must match the edit auto-approve glob rules.
	 */
	private async _isEditAutoApproved(resource: URI, workingDirectory: URI | undefined): Promise<boolean> {
		const resourcesToCheck = await this._resolveResourcesForApproval(resource);
		return resourcesToCheck !== undefined && resourcesToCheck.every(candidate => this._checkWriteResource(candidate, workingDirectory));
	}

	/**
	 * Returns the literal path plus, for absolute paths, the symlink-resolved
	 * real path. Returns `undefined` when the path cannot be resolved due to
	 * missing permissions, signalling that confirmation is required.
	 */
	private async _resolveResourcesForApproval(resource: URI): Promise<URI[] | undefined> {
		const resourcesToCheck = [resource];
		if (resource.scheme !== Schemas.file) {
			return resourcesToCheck;
		}
		try {
			const resolved = await resolveRealPathForNonexistent(resource, this._realpath);
			if (!extUriBiasedIgnorePathCase.isEqual(resolved, resource)) {
				resourcesToCheck.push(resolved);
			}
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code;
			if (code === 'EPERM' || code === 'EACCES') {
				// No permission to resolve the path — require confirmation.
				return undefined;
			}
			// Otherwise fall back to checking the literal resource only.
		}
		return resourcesToCheck;
	}

	/** Runs the write checks for a single (already symlink-resolved) resource. */
	private _checkWriteResource(resource: URI, workingDirectory: URI | undefined): boolean {
		try {
			assertPathIsSafe(resource.fsPath);
		} catch {
			return false;
		}
		if (!this._isResourceInWorkingDirectory(resource, workingDirectory)) {
			return false;
		}
		if (this._isPlatformRestrictedResource(resource, workingDirectory)) {
			return false;
		}
		return this._matchesEditAutoApprovePatterns(resource.fsPath);
	}

	/**
	 * Returns whether `resource` targets a platform-restricted location that
	 * should always require confirmation. Edits within home-directory dotfiles
	 * are never auto-approved. Edits within platform config directories are
	 * allowed only when the working directory itself lives inside them.
	 */
	private _isPlatformRestrictedResource(resource: URI, workingDirectory: URI | undefined): boolean {
		const relativeToHome = extUriBiasedIgnorePathCase.relativePath(HOME_DIR, resource);
		const topLevelName = relativeToHome?.split('/')[0];
		if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, HOME_DIR) && topLevelName?.startsWith('.')) {
			return true;
		}

		for (const restricted of PLATFORM_RESTRICTED_DIRS) {
			const parentURI = URI.file(restricted);
			if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, parentURI)) {
				// Allow edits when the working directory is opened inside the restricted area.
				return !(workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, parentURI));
			}
		}
		return false;
	}

	private _matchesEditAutoApprovePatterns(filePath: string): boolean {
		let approved = true;
		for (const [pattern, isApproved] of Object.entries(DEFAULT_EDIT_AUTO_APPROVE_PATTERNS)) {
			if (isApproved !== approved && globMatch(pattern, filePath)) {
				approved = isApproved;
			}
		}
		return approved;
	}

	private _isToolAllowedByPermissions(sessionKey: ProtocolURI, toolCallId: string): boolean {
		const toolName = this._getToolNameForToolCall(sessionKey, toolCallId);
		if (!toolName) {
			return false;
		}
		// `getEffectiveValue` walks session → parent → host, so sessions
		// that haven't materialized their own `permissions` yet transparently
		// inherit from the host-level allow/deny lists.
		const permissions = this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Permissions);
		const allowed = permissions?.allow.includes(toolName) ?? false;
		if (allowed) {
			this._logService.trace(`[SessionPermissionManager] Auto-approving "${toolName}" via permissions`);
		}
		return allowed;
	}

	private _getToolNameForToolCall(sessionKey: ProtocolURI, toolCallId: string): string | undefined {
		const sessionState = this._stateManager.getSessionState(sessionKey);
		const parts = sessionState?.activeTurn?.responseParts;
		if (!parts) {
			return undefined;
		}
		for (const rp of parts) {
			if (rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === toolCallId) {
				return rp.toolCall.toolName;
			}
		}
		return undefined;
	}

	private _addToolToSessionPermissions(sessionKey: ProtocolURI, toolName: string): void {
		const permissions = this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Permissions)
			?? { allow: [], deny: [] };
		if (permissions.allow.includes(toolName)) {
			return;
		}
		this._configService.updateSessionConfig(sessionKey, {
			[SessionConfigKey.Permissions]: {
				allow: [...permissions.allow, toolName],
				deny: [...permissions.deny],
			},
		});
		this._logService.info(`[SessionPermissionManager] Added "${toolName}" to session permissions for ${sessionKey}`);
	}
}
