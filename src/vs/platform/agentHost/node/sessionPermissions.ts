/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { realpath as fsRealpath } from 'fs';
import { homedir } from 'os';
import { promisify } from 'util';
import { firstParallel } from '../../../base/common/async.js';
import { match as globMatch } from '../../../base/common/glob.js';
import { untildify } from '../../../base/common/labels.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import * as path from '../../../base/common/path.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { extUri, extUriBiasedIgnorePathCase, normalizePath } from '../../../base/common/resources.js';
import { isDefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { Promises } from '../../../base/node/pfs.js';
import { localize } from '../../../nls.js';
import { ALWAYS_CHECKED_EDIT_PATTERNS, DEFAULT_EDIT_AUTO_APPROVE_PATTERNS } from '../../chat/common/chatSettings.js';
import { ILogService } from '../../log/common/log.js';
import { containsCmdDelayedExpansion } from '../../terminal/common/autoApprove/cmdDelayedExpansion.js';
import { suggestAutoApproveRuleKeys } from '../../terminal/common/autoApprove/suggestAutoApproveRules.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostEditAutoApprovePatternsConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey, type IPermissionsValue, platformRootSchema, platformSessionSchema } from '../common/agentHostSchema.js';
import { AgentPermissionKind, type IAgentToolPendingConfirmationSignal } from '../common/agent.js';
import { getAttachedLocalPaths } from '../common/attachedLocalPaths.js';
import { ISessionDataService, isSessionAttachmentPath } from '../common/sessionDataService.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { SessionConfigSchema } from '../common/state/protocol/commands.js';
import { getAvailableSessionApprovalValues, getEffectiveSessionApprovalValue, getSessionApprovalProperty, readSessionApprovalLevel } from '../common/sessionConfigProperties.js';
import { matchesPermissionRule, matchesShellCommandLine, matchesShellSubCommand, parsePermissionGrantOptionId, pathRule, permissionGrantOptionId, PermissionGrantScope, shellExactRule, shellPrefixRule, webFetchRule, type IPermissionRequest, type IPermissionRuleContext } from '../common/permissionRules.js';
import { readToolCallMeta } from '../common/meta/agentToolCallMeta.js';
import { ConfirmationOptionKind, type ConfirmationOption } from '../common/state/protocol/state.js';
import { ActionType, type IToolCallReadyAction } from '../common/state/sessionActions.js';
import {
	getInlineToolInput,
	isAhpChatChannel,
	ResponsePartKind,
	ToolCallConfirmationReason,
	ToolCallStatus,
	type URI as ProtocolURI,
} from '../common/state/sessionState.js';
import { getEffectiveWorkingDirectories, IAgentConfigurationService, type IAgentChatConfigurationTarget } from './agentConfigurationService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { CommandAutoApprover, type CommandApprovalResult, type IShouldAutoApproveOptions } from './commandAutoApprover.js';
import { resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';

/**
 * Event fields needed for auto-approval decisions.
 * Matches the subset of {@link IAgentToolPendingConfirmationSignal} used by the
 * approval pipeline.
 */
export interface IToolApprovalEvent {
	readonly toolCallId: string;
	readonly toolName?: string;
	readonly session: URI;
	readonly permissionKind?: AgentPermissionKind;
	readonly permissionPath?: string;
	readonly permissionUrl?: string;
	readonly toolInput?: string;
	readonly requestSandboxBypass?: boolean;
	readonly shellLanguage?: IAgentToolPendingConfirmationSignal['shellLanguage'];
}

/** Standard per-tool confirmation options presented to the user. */
const ALLOW_SESSION_OPTION_ID = 'allow-session';
const ALLOW_ONCE_OPTION: ConfirmationOption = { id: 'allow-once', label: localize('sessionPermissions.allowOnce', "Allow Once"), kind: ConfirmationOptionKind.Approve };
const SKIP_OPTION: ConfirmationOption = { id: 'skip', label: localize('sessionPermissions.skip', "Skip"), kind: ConfirmationOptionKind.Deny, group: 2 };
const CONFIRMATION_OPTIONS: readonly ConfirmationOption[] = [
	{ id: ALLOW_SESSION_OPTION_ID, label: localize('sessionPermissions.allowSession', "Allow in this Session"), kind: ConfirmationOptionKind.Approve, group: 1 },
	ALLOW_ONCE_OPTION,
	SKIP_OPTION,
];
const MANAGED_CONFIRMATION_OPTIONS: readonly ConfirmationOption[] = [ALLOW_ONCE_OPTION, SKIP_OPTION];
const SANDBOX_CONFIRMATION_OPTIONS: readonly ConfirmationOption[] = [
	{ ...ALLOW_ONCE_OPTION, label: localize('sessionPermissions.allow', "Allow") },
	SKIP_OPTION,
];
const SANDBOX_BYPASS_META_KEY = 'agentHost.sandboxBypass';

function permissionGrantOption(label: string, rules: readonly string[], scope: PermissionGrantScope = PermissionGrantScope.Session): ConfirmationOption {
	return { id: permissionGrantOptionId(scope, rules), label, kind: ConfirmationOptionKind.Approve, group: 1 };
}

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
 * Owns deny/ask/allow decisions, implicit terminal defaults, scoped confirmation options, and persistent session or host grants.
 * Global or session Allow All bypasses ask rules, but never deny rules.
 */
export class SessionPermissionManager extends Disposable {

	// ---- Edit auto-approve patterns -----------------------------------------

	private readonly _commandAutoApprover: CommandAutoApprover;
	private readonly _realpath: (fsPath: string) => Promise<string>;
	private readonly _exists: (fsPath: string) => Promise<boolean>;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		options: { realpath?: (fsPath: string) => Promise<string>; exists?: (fsPath: string) => Promise<boolean> },
		@IAgentConfigurationService private readonly _configService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
	) {
		super();
		this._realpath = options?.realpath ?? realpath;
		this._exists = options?.exists ?? Promises.exists;
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
	 * 0. Sandbox bypass requires confirmation
	 * 1. Global auto-approve setting (`chat.tools.global.autoApprove`)
	 * 2. Session-level bypass (`autoApprove` config)
	 * 3. Permission ask rules, then allow rules (chat/session/host `permissions`)
	 * 4. Read path rules (within working directory)
	 * 5. Write path rules (within working directory + glob patterns)
	 * 6. Explicit shell allow/ask rules, then implicit terminal defaults
	 *
	 * The caller rejects permission deny rules before checking auto-approval.
	 */
	async getAutoApproval(e: IToolApprovalEvent, sessionKey: ProtocolURI): Promise<ToolCallConfirmationReason | undefined> {
		// `sessionKey` is the chat channel URI (see `_handleToolReady`), so the
		// state manager returns that chat's *effective* working-directory set
		// (its own subset override when present, else the session's full set —
		// peer chats inherit). A read/write/shell destination auto-approves when
		// contained by *any* root. Today the set has exactly one entry (the
		// create-time length guard), so this is behaviour-identical to the
		// previous single-directory logic.
		const workDirs = getEffectiveWorkingDirectories(this._stateManager, sessionKey);
		const workingDirectories = workDirs?.map(d => URI.parse(d));

		// 0. Sandbox bypass: a shell command that opted out of the
		// sandbox (`requestSandboxBypass`) escapes the sandbox's
		// containment.
		if (e.requestSandboxBypass) {
			return undefined;
		}

		// 1. Global auto-approve setting
		const approvalConfig = this._sessionStateOf(sessionKey)?.config;
		const hostPolicy = approvalConfig?.schema.properties.availableApprovalModes?.readOnly === true;
		if (this.isGlobalAutoApproveEnabled() && (!hostPolicy || this.isSessionAutoApproveEnabled(sessionKey))) {
			return ToolCallConfirmationReason.Setting;
		}

		// 2. Session-level auto-approve
		if (this.isSessionAutoApproveEnabled(sessionKey)) {
			return ToolCallConfirmationReason.Setting;
		}

		// Ask rules never override global or session Allow All.
		const permissions = this._getPermissionRules(sessionKey);
		const request = this._permissionRequest(e, sessionKey);
		const context = this._permissionContext(sessionKey);
		if (permissions.allow.length || permissions.ask?.length) {
			const requests = await this._resolvePermissionRequests(request);
			if (!requests || permissions.ask?.some(rule => requests.some(candidate => matchesPermissionRule(rule, candidate, context)))) {
				return undefined;
			}
			if (e.permissionKind !== AgentPermissionKind.Shell && permissions.allow.some(rule => requests.every(candidate => matchesPermissionRule(rule, candidate, context)))) {
				return ToolCallConfirmationReason.Setting;
			}
		}

		// 3.5 Surface edit scope. A session created by a file-bound surface
		// (editor inline chat) is scoped to the one document it was invoked on.
		// The user opened chat *on* that file, so reading and writing it needs no
		// further consent even when it sits outside the working directory. Every
		// other write -- and every shell command, which can write anywhere and
		// carries no inspectable destination -- falls through to a confirmation
		// prompt. Reads of other files keep the normal rules below so routine
		// context gathering stays silent.
		//
		// This runs after the explicit opt-ins above: a user who turned on
		// global or session auto-approve asked for that everywhere, and inline
		// chat does not override it.
		const surfaceScope = this._getSurfaceEditScope(sessionKey);
		if (surfaceScope) {
			if ((e.permissionKind === AgentPermissionKind.Write || e.permissionKind === AgentPermissionKind.Read)
				&& e.permissionPath
				&& surfaceScope.target
				&& extUriBiasedIgnorePathCase.isEqual(URI.file(e.permissionPath), surfaceScope.target)
			) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving in-scope surface ${e.permissionKind} of ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			if (e.permissionKind === AgentPermissionKind.Write || e.permissionKind === AgentPermissionKind.Shell) {
				this._logService.trace(`[SessionPermissionManager] Requiring confirmation for out-of-scope surface ${e.permissionKind}`);
				return undefined;
			}
		}

		// 4. Read auto-approval
		if (e.permissionKind === AgentPermissionKind.Read && e.permissionPath) {
			if (this._isAttachmentPath(sessionKey, e.permissionPath)) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving session attachment read of ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			if (await this._isReadAutoApproved(URI.file(e.permissionPath), workingDirectories)) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving read of ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			// The user attached this file, or a folder containing it, to the chat: that is consent to read it.
			if (await this._isReadAutoApproved(URI.file(e.permissionPath), this._getAttachedResources(sessionKey))) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving read of attached ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			return undefined;
		}

		// 5. Write auto-approval
		if (e.permissionKind === AgentPermissionKind.Write && e.permissionPath) {
			if (await this._isEditAutoApproved(URI.file(e.permissionPath), workingDirectories, sessionKey)) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving write to ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			return undefined;
		}

		// 6. Shell auto-approval
		if (e.permissionKind === AgentPermissionKind.Shell && e.toolInput) {
			// Terminal-rule analysis needs an explicit shell dialect. Producers
			// that omit `shellLanguage` (or fail to correlate one) must prompt.
			if (!e.shellLanguage) {
				this._logService.trace('[SessionPermissionManager] Shell language is missing, requiring confirmation');
				return undefined;
			}
			if (this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveEnabledConfigKey) === false) {
				return undefined;
			}
			const result = await this._evaluateShellAutoApproval(e, workingDirectories, sessionKey);
			if (result === 'approved') {
				this._logService.trace('[SessionPermissionManager] Auto-approving shell command');
				return permissions.allow.some(rule => matchesPermissionRule(rule, request, context)) ? ToolCallConfirmationReason.Setting : ToolCallConfirmationReason.NotNeeded;
			}
			if (result === 'denied') {
				this._logService.trace('[SessionPermissionManager] Shell command denied by rule');
			}
			return undefined;
		}

		return undefined;
	}

	/**
	 * Rejects matching deny rules before any auto-approval or interactive confirmation.
	 * Decides synchronously unless a read/write path must be resolved through symlinks,
	 * so approvals that never touch the file system are not delayed by an extra tick.
	 */
	isDeniedByPermissions(e: IToolApprovalEvent, sessionKey: ProtocolURI): boolean | Promise<boolean> {
		const rules = this._getPermissionRules(sessionKey).deny;
		if (rules.length === 0) {
			return false;
		}
		const request = this._permissionRequest(e, sessionKey);
		const context = this._permissionContext(sessionKey);
		if (rules.some(rule => matchesPermissionRule(rule, request, context))) {
			return true;
		}
		if (e.permissionKind === AgentPermissionKind.Shell && e.toolInput) {
			const language = e.shellLanguage ?? 'bash';
			const commandLine = e.toolInput;
			if (rules.some(rule => matchesShellCommandLine(rule, commandLine, language))) {
				return true;
			}
			const subCommands = this._commandAutoApprover.evaluate(e.toolInput, { language }).subCommands ?? [e.toolInput.trim()];
			return subCommands.some(command => rules.some(rule => matchesShellSubCommand(rule, command, language)));
		}
		if ((e.permissionKind === AgentPermissionKind.Read || e.permissionKind === AgentPermissionKind.Write) && e.permissionPath) {
			return this._isPathDeniedByPermissions(request, rules, context);
		}
		return false;
	}

	private async _isPathDeniedByPermissions(request: IPermissionRequest, rules: readonly string[], context: IPermissionRuleContext): Promise<boolean> {
		const requests = await this._resolvePermissionRequests(request);
		if (!requests) {
			return rules.some(rule => rule.trim().startsWith(request.kind === AgentPermissionKind.Read ? 'Read(' : 'Edit('));
		}
		return requests.some(candidate => rules.some(rule => matchesPermissionRule(rule, candidate, context)));
	}

	/**
	 * The edit scope of a session created by a file-bound chat surface, or
	 * `undefined` for surfaces that are not file-bound.
	 *
	 * Returning a scope whose `target` is `undefined` is deliberate and fails
	 * closed: an inline-chat session that did not record a usable target must
	 * not fall back to unscoped editing, so no write auto-approves for it.
	 */
	private _getSurfaceEditScope(sessionKey: ProtocolURI): { readonly target: URI | undefined } | undefined {
		const session = this._ownerOf(sessionKey);
		const surface = session === undefined ? undefined : this._stateManager.getSessionSurfaceMeta(session);
		if (surface?.surface !== 'editorInline') {
			return undefined;
		}
		if (surface.targetUri === undefined) {
			return { target: undefined };
		}
		try {
			return { target: URI.parse(surface.targetUri) };
		} catch {
			this._logService.warn(`[SessionPermissionManager] Ignoring malformed inline chat target ${surface.targetUri}`);
			return { target: undefined };
		}
	}

	/**
	 * Whether a write targets a file under the session attachments directory. Those files are
	 * host-created **read-only snapshots** of client/derived content (pasted text/images, unsaved
	 * editors, `git:` diff views); the model must never edit the copy (#331154).
	 *
	 * {@link _handleToolReady} hard-denies such writes when a provider raises an interactive
	 * `pending_confirmation` (the auto-approve checks in {@link getAutoApproval} would otherwise
	 * approve first). Note this only fires for the interactive / managed-approval flow — providers
	 * that auto-approve upstream (Copilot SDK `'on'`, Claude bypass/acceptEdits, or Codex, which never
	 * routes through the host permission layer) don't reach it, so the read-only presentation is the
	 * primary defense there.
	 */
	isForbiddenSnapshotWrite(e: IToolApprovalEvent, sessionKey: ProtocolURI): boolean {
		if (e.permissionKind !== AgentPermissionKind.Write || !e.permissionPath) {
			return false;
		}
		return this._isAttachmentPath(sessionKey, e.permissionPath);
	}

	/** Whether `path` is an attachment snapshot of the chat (or session): in any directory its attachments are kept in. */
	private _isAttachmentPath(sessionOrChat: ProtocolURI, path: string): boolean {
		const owner = this._ownerOf(sessionOrChat);
		const scopes = isAhpChatChannel(sessionOrChat) ? this._stateManager.getChatAttachmentScopes(sessionOrChat) : undefined;
		return (scopes ?? (owner !== undefined ? [owner] : [])).some(scope => isSessionAttachmentPath(this._sessionDataService, URI.parse(scope), path));
	}

	/** The local files and folders the user attached to the chat's loaded turns, including the active one. */
	private _getAttachedResources(sessionOrChat: ProtocolURI): URI[] {
		if (!isAhpChatChannel(sessionOrChat)) {
			return [];
		}
		const chat = this._stateManager.getChatState(sessionOrChat);
		const messages = [...chat?.turns ?? [], ...chat?.activeTurn ? [chat.activeTurn] : []].map(turn => turn.message);
		const attached = new Map(messages.flatMap(message => getAttachedLocalPaths(message.attachments)).map(uri => [uri.toString(), uri]));
		return [...attached.values()];
	}

	/**
	 * Returns whether VS Code's global auto-approve setting (`chat.tools.global.autoApprove`) is enabled.
	 * When enabled, every tool call is auto-approved without changing the session's approval level in the permissions picker.
	 */
	/** The session that owns a chat, or the session itself; `undefined` for an unregistered chat. */
	private _ownerOf(sessionOrChat: ProtocolURI): string | undefined {
		return isAhpChatChannel(sessionOrChat) ? this._chatOwnership.getChatOwner(sessionOrChat) : sessionOrChat;
	}

	private _resolveSession(sessionOrChat: ProtocolURI): string | undefined {
		return resolveAgentHostSession(URI.parse(sessionOrChat), chat => this._chatOwnership.getChatOwner(chat))?.toString();
	}

	private _sessionStateOf(sessionOrChat: ProtocolURI): ReturnType<AgentHostStateManager['getSessionState']> {
		const session = this._resolveSession(sessionOrChat);
		return session === undefined ? undefined : this._stateManager.getSessionState(session);
	}

	/** The chat whose config applies to a chat channel; `undefined` for a session or an unregistered chat. */
	private _chatTargetOf(sessionOrChat: ProtocolURI): IAgentChatConfigurationTarget | undefined {
		const session = isAhpChatChannel(sessionOrChat) ? this._resolveSession(sessionOrChat) : undefined;
		return session === undefined ? undefined : { session, chat: sessionOrChat };
	}

	/** The effective config of a chat (its own values over the session's), or of a session. */
	private _effectiveConfigOf(sessionOrChat: ProtocolURI): { readonly schema: SessionConfigSchema; readonly values: Record<string, unknown> } | undefined {
		const config = this._sessionStateOf(sessionOrChat)?.config;
		const target = this._chatTargetOf(sessionOrChat);
		return config && { schema: config.schema, values: (target && this._configService.getChatConfigValues(target)) ?? config.values };
	}

	private _effectiveValue<K extends SessionConfigKey.AutoApprove | SessionConfigKey.Permissions>(sessionOrChat: ProtocolURI, key: K) {
		const target = this._chatTargetOf(sessionOrChat);
		return target
			? this._configService.getChatEffectiveValue(target, platformSessionSchema, key)
			: this._configService.getEffectiveValue(sessionOrChat, platformSessionSchema, key);
	}

	isGlobalAutoApproveEnabled(): boolean {
		return this._configService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true;
	}

	getEffectiveApprovalLevel(sessionKey: ProtocolURI): string {
		const config = this._effectiveConfigOf(sessionKey);
		const policyOwned = config?.schema.properties.availableApprovalModes?.readOnly === true;
		if (policyOwned) {
			const approval = getSessionApprovalProperty(config.schema);
			// A chat that chose its own approvals has them until its runtime reports the mode it applies.
			const effective = approval && getEffectiveSessionApprovalValue(approval, config.schema, config.values);
			return approval && typeof effective === 'string' && Array.isArray(config.values.availableApprovalModes) && getAvailableSessionApprovalValues(approval, config.schema, config.values).includes(effective)
				? readSessionApprovalLevel(approval, effective) ?? 'default' : 'default';
		}
		if (!policyOwned && this._configService.getRootValue(platformRootSchema, AgentHostAutoApprovePolicyRestrictedConfigKey) === true) {
			return 'default';
		}
		return this._effectiveValue(sessionKey, SessionConfigKey.AutoApprove) ?? 'default';
	}

	isSessionAutoApproveEnabled(sessionKey: ProtocolURI): boolean {
		// `autoApprove` (Allow All) auto-approves every tool call.
		return this.getEffectiveApprovalLevel(sessionKey) === 'autoApprove';
	}

	// ---- Action construction (analogous to getPreConfirmActions) -------------

	/**
	 * Constructs a ready action with scoped shell/URL/path options, or a tool-wide session option for other kinds.
	 * Resolve path grants with {@link getPathConfirmationOptions} first; managed and sandbox asks remain one-time only.
	 */
	createToolReadyAction(e: IAgentToolPendingConfirmationSignal, sessionKey: ProtocolURI, turnId: string, pathOptions: readonly ConfirmationOption[] = []): IToolCallReadyAction {
		const state = e.state;
		if (state.confirmationTitle) {
			const scoped = !e.managedApprovalRequired && !e.requestSandboxBypass && !e.requestSandboxPermissive
				? this._scopedConfirmationOptions(e, sessionKey, pathOptions) : undefined;
			const oneTimeOptions = e.requestSandboxBypass || e.requestSandboxPermissive ? SANDBOX_CONFIRMATION_OPTIONS : MANAGED_CONFIRMATION_OPTIONS;
			return {
				type: ActionType.ChatToolCallReady,
				turnId,
				toolCallId: state.toolCallId,
				...(state.contributor ? { contributor: state.contributor } : {}),
				...(state.intention !== undefined ? { intention: state.intention } : {}),
				invocationMessage: state.invocationMessage,
				toolInput: state.toolInput,
				confirmationTitle: state.confirmationTitle,
				riskAssessment: state.riskAssessment,
				edits: state.edits,
				editable: state.editable,
				...(e.requestSandboxBypass
					? { _meta: { ...state._meta, [SANDBOX_BYPASS_META_KEY]: true } }
					: state._meta ? { _meta: state._meta } : {}),
				// Managed asks are one-time only. Other agents can supply tool-specific
				// buttons (e.g. ExitPlanMode's `Approve`/`Deny`) via `state.options`;
				// otherwise the standard session/once/skip set is used.
				options: e.managedApprovalRequired
					? oneTimeOptions.slice()
					: e.requestSandboxBypass && readToolCallMeta(state)['vscode.sandboxPathGrant'] && state.options
						? state.options.slice()
						: e.requestSandboxPermissive || e.requestSandboxBypass
							? oneTimeOptions.slice()
							: scoped ?? (state.options ? state.options.slice() : CONFIRMATION_OPTIONS.slice()),
			};
		}
		return {
			type: ActionType.ChatToolCallReady,
			turnId,
			toolCallId: state.toolCallId,
			...(state.contributor ? { contributor: state.contributor } : {}),
			...(state.intention !== undefined ? { intention: state.intention } : {}),
			invocationMessage: state.invocationMessage,
			toolInput: state.toolInput,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			...(state._meta ? { _meta: state._meta } : {}),
		};
	}

	// ---- Post-confirmation side effects -------------------------------------

	/**
	 * Handles the side effect of a `ChatToolCallConfirmed` action when the
	 * user selected a scoped grant: persist its rules on the owning session or host.
	 * Sandbox bypass confirmations never persist tool permissions.
	 */
	handleToolCallConfirmed(chatChannel: ProtocolURI, toolCallId: string, selectedOptionId: string | undefined): void {
		if (!isAhpChatChannel(chatChannel)) {
			throw new Error(`Tool call confirmations must be handled on an AHP chat channel: ${chatChannel}`);
		}
		const sessionKey = this._resolveSession(chatChannel);
		if (sessionKey === undefined) {
			this._logService.trace(`[SessionPermissions] No owner recorded for ${chatChannel}; ignoring confirmation of ${toolCallId}`);
			return;
		}
		const part = this._stateManager.getSessionState(chatChannel)?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === toolCallId);
		if (part?.kind !== ResponsePartKind.ToolCall || part.toolCall.status !== ToolCallStatus.Running) {
			return;
		}
		const option = part.toolCall.selectedOption;
		if (readToolCallMeta(part.toolCall)[SANDBOX_BYPASS_META_KEY] || option?.id !== selectedOptionId || option?.kind !== ConfirmationOptionKind.Approve) {
			return;
		}
		const grant = parsePermissionGrantOptionId(option.id);
		if (grant) {
			if (grant.scope === PermissionGrantScope.Session) {
				this._addRulesToSessionPermissions(sessionKey, grant.rules);
			} else {
				const permissions = this._configService.getRootValue(platformRootSchema, SessionConfigKey.Permissions) ?? { allow: [], deny: [] };
				const allow = [...new Set([...permissions.allow, ...grant.rules])];
				if (allow.length !== permissions.allow.length) {
					this._configService.updateRootConfig({ [SessionConfigKey.Permissions]: { ...permissions, allow } });
				}
			}
		} else if (option.id === ALLOW_SESSION_OPTION_ID) {
			this._addRulesToSessionPermissions(sessionKey, [part.toolCall.toolName]);
		}
	}

	// ---- Internal helpers ---------------------------------------------------

	/**
	 * Whether a read of `resource` auto-approves against the session's working
	 * directories: it must be contained by **at least one** root. The read's
	 * symlink-resolved real path is compared too, so a symlink that crosses
	 * from one root into another is *not* auto-approved (fail-closed). With a
	 * single root this is identical to the previous behaviour.
	 */
	private async _isReadAutoApproved(resource: URI, workingDirectories: readonly URI[] | undefined): Promise<boolean> {
		if (!workingDirectories || workingDirectories.length === 0) {
			return false;
		}
		// Resolve the read target once (literal + symlink real path); a denied
		// resolution requires confirmation.
		const resourcesToCheck = this._resolveResourcesForApproval(resource);
		// Resolve each root's real path in parallel and stop at the first root
		// that contains the target.
		const match = await firstParallel(
			workingDirectories.map(directory => this._isReadContainedByRoot(resourcesToCheck, directory)),
			approved => approved,
		);
		return match === true;
	}

	/** Whether every resolved read candidate is contained by `workingDirectory` (or its real path). */
	private async _isReadContainedByRoot(resourcesToCheckPromise: Promise<readonly URI[] | undefined>, workingDirectory: URI): Promise<boolean> {
		const [resourcesToCheck, workingDirectories] = await Promise.all([resourcesToCheckPromise, this._resolveResourcesForApproval(workingDirectory)]);
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
	private async _evaluateShellAutoApproval(e: IToolApprovalEvent, workingDirectories: readonly URI[] | undefined, sessionKey: ProtocolURI): Promise<CommandApprovalResult> {
		const writeDestinations: string[] = [];
		const result = this._commandAutoApprover.shouldAutoApprove(e.toolInput ?? '', {
			...this._shellAutoApproveOptions(sessionKey, this._permissionRequest(e, sessionKey)),
			isWriteDestApproved: dest => {
				writeDestinations.push(dest);
				return true;
			},
		});
		if (result !== 'approved' || writeDestinations.length === 0) {
			return result;
		}
		const approvals = await Promise.all(writeDestinations.map(dest => this._isShellWriteDestApproved(dest, workingDirectories, sessionKey)));
		return approvals.every(approved => approved) ? 'approved' : 'noMatch';
	}

	private _shellAutoApproveOptions(sessionKey: ProtocolURI, request: IPermissionRequest): IShouldAutoApproveOptions {
		const permissions = this._getPermissionRules(sessionKey);
		const context = this._permissionContext(sessionKey);
		const language = request.shellLanguage ?? 'bash';
		const classify = (matches: (rule: string) => boolean): 'allow' | 'ask' | undefined => permissions.ask?.some(matches) ? 'ask' : permissions.allow.some(matches) ? 'allow' : undefined;
		return {
			language,
			defaultRules: this._configService.getRootValue(platformRootSchema, AgentHostTerminalIgnoreDefaultAutoApproveRulesConfigKey) === true ? {} : undefined,
			classify: command => classify(rule => matchesPermissionRule(rule, request, context) || matchesShellSubCommand(rule, command, language)),
			classifyCommandLine: commandLine => classify(rule => matchesShellCommandLine(rule, commandLine, language)),
		};
	}

	private async _isShellWriteDestApproved(dest: string, workingDirectories: readonly URI[] | undefined, sessionKey: ProtocolURI): Promise<boolean> {
		// A shell command runs in exactly one process cwd = the primary root
		// (index 0), so a *relative* redirect can only resolve against that cwd.
		const resource = this._resolveShellRedirectResource(dest, workingDirectories?.[0]);
		if (!resource) {
			return false;
		}
		return this._isEditAutoApproved(resource, workingDirectories, sessionKey);
	}

	/**
	 * Matches redirect destinations whose final path is decided by the shell
	 * rather than by the text: variable expansions (`$HOME/x`, `$env:TEMP/x`,
	 * `%APPDATA%\x`, `!APPDATA!\x`), command substitutions (`$(pwd)/x`,
	 * `` `pwd`/x ``), brace expansions, and `~` in a position {@link untildify}
	 * does not handle.
	 * Mirrors the workbench's file-write analyzer guard.
	 *
	 * See https://github.com/microsoft/vscode/issues/274166 and
	 * https://github.com/microsoft/vscode/issues/274167
	 */
	private static readonly _dynamicRedirectDestRegex = /[$(){}`~%]/;

	/**
	 * Resolves the raw text of a shell redirect destination to an absolute
	 * filesystem path. `~` is expanded to the user's home directory; the
	 * downstream working-directory check rejects paths that end up outside
	 * the workspace. Returns `undefined` when resolution would require a
	 * working directory that isn't configured, or when the destination expands
	 * at runtime and therefore cannot be resolved from its text alone.
	 */
	private _resolveShellRedirectResource(dest: string, workingDirectory: URI | undefined): URI | undefined {
		const trimmed = untildify(dest.trim(), homedir());
		if (!trimmed) {
			return undefined;
		}
		// A destination the shell expands (e.g. `$HOME/x.txt`) would otherwise be
		// treated as a literal relative path and resolve *inside* the working
		// directory, auto-approving a write that actually lands elsewhere.
		if (SessionPermissionManager._dynamicRedirectDestRegex.test(trimmed) || containsCmdDelayedExpansion(trimmed)) {
			this._logService.trace(`[SessionPermissionManager] Redirect destination expands at runtime, requiring confirmation: ${dest}`);
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
	private async _isEditAutoApproved(resource: URI, workingDirectories: readonly URI[] | undefined, sessionKey: ProtocolURI): Promise<boolean> {
		if (!workingDirectories || workingDirectories.length === 0) {
			// A write is never auto-approved without a working directory to
			// contain it (matches the previous behaviour).
			return false;
		}
		// Resolve the write target once (literal + symlink real path); a denied
		// resolution requires confirmation.
		const resourcesToCheck = await this._resolveResourcesForApproval(resource);
		if (resourcesToCheck === undefined) {
			return false;
		}
		if (await this._matchesSensitiveEditLocations(resourcesToCheck, workingDirectories, sessionKey)) {
			return false;
		}
		// Approve if ANY root clears the write checks for every resource
		// candidate. `_checkWriteResource` is synchronous, so a plain `.some`
		// already short-circuits — there is no per-root async work to parallelize.
		return workingDirectories.some(workingDirectory => resourcesToCheck.every(candidate => this._checkWriteResource(candidate, workingDirectory)));
	}

	private async _matchesSensitiveEditLocations(resources: readonly URI[], workingDirectories: readonly URI[], sessionKey: ProtocolURI): Promise<boolean> {
		const locations = this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.SensitiveEditLocations);
		if (!locations?.length) {
			return false;
		}

		for (const workingDirectory of workingDirectories) {
			for (const location of locations) {
				const literalLocation = URI.joinPath(workingDirectory, location.path);
				const resolvedLocations = await this._resolveResourcesForApproval(literalLocation) ?? [literalLocation];
				for (const resource of resources) {
					if (resolvedLocations.some(candidate => location.isDirectory
						? extUriBiasedIgnorePathCase.isEqualOrParent(resource, candidate)
						: extUriBiasedIgnorePathCase.isEqual(resource, candidate))) {
						return true;
					}
				}
			}
		}
		return false;
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
			if (!extUri.isEqual(resolved, resource)) {
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
		return this._matchesEditAutoApprovePatterns(resource);
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

	private _matchesEditAutoApprovePatterns(resource: URI): boolean {
		let approved = true;
		const patterns = this._configService.getRootValue(platformRootSchema, AgentHostEditAutoApprovePatternsConfigKey) ?? DEFAULT_EDIT_AUTO_APPROVE_PATTERNS;
		const ignoreCase = extUriBiasedIgnorePathCase.ignorePathCasing(resource);
		for (const patternSet of [patterns, ALWAYS_CHECKED_EDIT_PATTERNS]) {
			for (const [pattern, configuredApproval] of Object.entries(patternSet)) {
				const isApproved = configuredApproval === true;
				if (isApproved !== approved && globMatch(pattern, resource.fsPath, { ignoreCase })) {
					approved = isApproved;
				}
			}
		}
		return approved;
	}

	/** Permission lists are additive across chat, owning session, and host scopes. */
	private _getPermissionRules(sessionKey: ProtocolURI): IPermissionsValue {
		const session = this._resolveSession(sessionKey);
		const values = [
			this._effectiveValue(sessionKey, SessionConfigKey.Permissions),
			session === undefined ? undefined : this._configService.getEffectiveValue(session, platformSessionSchema, SessionConfigKey.Permissions),
			this._configService.getRootValue(platformRootSchema, SessionConfigKey.Permissions),
		];
		return {
			allow: [...new Set(values.flatMap(value => value?.allow ?? []))],
			deny: [...new Set(values.flatMap(value => value?.deny ?? []))],
			ask: [...new Set(values.flatMap(value => value?.ask ?? []))],
		};
	}

	private _permissionRequest(e: IToolApprovalEvent, sessionKey: ProtocolURI): IPermissionRequest {
		return {
			kind: e.permissionKind,
			toolName: this._getToolNameForToolCall(sessionKey, e.toolCallId) ?? e.toolName ?? '',
			shellLanguage: e.shellLanguage,
			url: e.permissionUrl,
			path: e.permissionPath,
		};
	}

	private async _resolvePermissionRequests(request: IPermissionRequest): Promise<readonly IPermissionRequest[] | undefined> {
		if ((request.kind === AgentPermissionKind.Read || request.kind === AgentPermissionKind.Write) && request.path) {
			const resources = await this._resolveResourcesForApproval(URI.file(request.path));
			return resources?.map(resource => ({ ...request, path: resource.fsPath }));
		}
		return [request];
	}

	private _permissionContext(sessionKey: ProtocolURI): IPermissionRuleContext {
		const directory = getEffectiveWorkingDirectories(this._stateManager, sessionKey)?.[0];
		return { workingDirectory: directory ? URI.parse(directory).fsPath : undefined, homeDirectory: homedir(), ignorePathCase: isWindows || isMacintosh };
	}

	/** Builds file and nearest Git-root (or parent-folder) session grants without resolving symlinks. */
	async getPathConfirmationOptions(e: IAgentToolPendingConfirmationSignal): Promise<readonly ConfirmationOption[]> {
		if ((e.permissionKind !== AgentPermissionKind.Read && e.permissionKind !== AgentPermissionKind.Write) || !e.permissionPath || !e.state.confirmationTitle
			|| e.managedApprovalRequired || e.requestSandboxBypass || e.requestSandboxPermissive) {
			return [];
		}
		const tool = e.permissionKind === AgentPermissionKind.Write ? 'Edit' : 'Read';
		const fileRule = pathRule(tool, e.permissionPath, false);
		const pathLib = path.win32.isAbsolute(e.permissionPath) && !path.posix.isAbsolute(e.permissionPath) ? path.win32 : path.posix;
		const parent = pathLib.dirname(e.permissionPath);
		let folder = parent;
		if (!pathLib.isAbsolute(e.permissionPath)) {
			return [];
		}
		for (let current = parent; ; current = pathLib.dirname(current)) {
			if (await this._exists(pathLib.join(current, '.git'))) {
				folder = current;
				break;
			}
			if (pathLib.dirname(current) === current) {
				break;
			}
		}
		const folderRule = pathRule(tool, folder, true);
		const options: ConfirmationOption[] = [];
		if (fileRule) {
			const basename = pathLib.basename(e.permissionPath) || e.permissionPath;
			options.push(permissionGrantOption(e.permissionKind === AgentPermissionKind.Write
				? localize('sessionPermissions.allowFileEdits', "Allow Edits to {0} in this Session", basename)
				: localize('sessionPermissions.allowFileReads', "Allow Reading {0} in this Session", basename), [fileRule]));
		}
		if (folderRule) {
			const basename = pathLib.basename(folder) || folder;
			options.push(permissionGrantOption(e.permissionKind === AgentPermissionKind.Write
				? localize('sessionPermissions.allowFolderEdits', "Allow Edits in {0} in this Session", basename)
				: localize('sessionPermissions.allowFolderReads', "Allow Reading Files in {0} in this Session", basename), [folderRule]));
		}
		return options;
	}

	private _scopedConfirmationOptions(e: IAgentToolPendingConfirmationSignal, sessionKey: ProtocolURI, pathOptions: readonly ConfirmationOption[]): ConfirmationOption[] | undefined {
		if (e.permissionKind !== AgentPermissionKind.Shell && e.permissionKind !== AgentPermissionKind.Url && e.permissionKind !== AgentPermissionKind.Read && e.permissionKind !== AgentPermissionKind.Write) {
			return undefined;
		}
		const options: ConfirmationOption[] = [ALLOW_ONCE_OPTION];
		const add = (label: string, rules: string[]) => {
			options.push(permissionGrantOption(label, rules));
		};
		if (e.permissionKind === AgentPermissionKind.Shell && e.shellLanguage && this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveEnabledConfigKey) !== false) {
			const commandLine = e.shellCommand ?? getInlineToolInput(e.state.toolInput);
			if (commandLine) {
				const evaluation = this._commandAutoApprover.evaluate(commandLine, this._shellAutoApproveOptions(sessionKey, {
					kind: AgentPermissionKind.Shell,
					toolName: this._getToolNameForToolCall(sessionKey, e.state.toolCallId) ?? e.state.toolName,
					shellLanguage: e.shellLanguage,
				}));
				if (!evaluation.hasUnsafeSubCommand && !evaluation.hasAskRule && evaluation.unapprovedSubCommands?.length) {
					const { subCommandKeys, offerExactCommandLine } = suggestAutoApproveRuleKeys(commandLine, evaluation.unapprovedSubCommands);
					const alwaysOptions: ConfirmationOption[] = [];
					if (subCommandKeys.length) {
						const commands = subCommandKeys.map(key => `\`${key} …\``).join(', ');
						const label = subCommandKeys.length === 1 ? commands : localize('sessionPermissions.commands', "Commands {0}", commands);
						const rules = subCommandKeys.map(key => shellPrefixRule(key));
						add(localize('sessionPermissions.allowCommand', "Allow {0} in this Session", label), rules);
						alwaysOptions.push(permissionGrantOption(localize('sessionPermissions.alwaysAllowCommand', "Always Allow {0}", label), rules, PermissionGrantScope.Host));
					}
					const exactRules = evaluation.unapprovedSubCommands.map(command => shellExactRule(command));
					if (offerExactCommandLine && exactRules.every(isDefined)) {
						add(localize('sessionPermissions.allowExactCommand', "Allow Exact Command in this Session"), exactRules);
						alwaysOptions.push(permissionGrantOption(localize('sessionPermissions.alwaysAllowExactCommand', "Always Allow Exact Command"), exactRules, PermissionGrantScope.Host));
					}
					options.push(...alwaysOptions);
				}
			}
		} else if (e.permissionKind === AgentPermissionKind.Url && e.permissionUrl) {
			try {
				const hostname = new URL(e.permissionUrl).hostname;
				if (hostname) {
					const rules = [webFetchRule(hostname)];
					add(localize('sessionPermissions.allowDomain', "Allow Fetching {0} in this Session", hostname), rules);
					options.push(permissionGrantOption(localize('sessionPermissions.alwaysAllowDomain', "Always Allow Fetching {0}", hostname), rules, PermissionGrantScope.Host));
				}
			} catch {
				// Malformed URLs offer only one-time approval.
			}
		}
		if (e.permissionKind === AgentPermissionKind.Read || e.permissionKind === AgentPermissionKind.Write) {
			options.push(...pathOptions);
		}
		options.push(SKIP_OPTION);
		return options;
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

	/** Appends deduplicated grants to the session's own permissions, preserving its deny and ask rules. */
	private _addRulesToSessionPermissions(session: ProtocolURI, rules: readonly string[]): void {
		const stored = this._configService.getSessionConfigValues(session)?.[SessionConfigKey.Permissions];
		const permissions = platformSessionSchema.validate(SessionConfigKey.Permissions, stored) ? stored : { allow: [], deny: [] };
		const allow = [...new Set([...permissions.allow, ...rules])];
		if (allow.length === permissions.allow.length) {
			return;
		}
		this._configService.updateSessionConfig(session, {
			[SessionConfigKey.Permissions]: { ...permissions, allow },
		});
		this._logService.info(`[SessionPermissionManager] Added permission rules to ${session}`);
	}
}
