/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { realpath as fsRealpath } from 'fs';
import { homedir } from 'os';
import { promisify } from 'util';
import { DeferredPromise, firstParallel } from '../../../base/common/async.js';
import { match as globMatch } from '../../../base/common/glob.js';
import { untildify } from '../../../base/common/labels.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import * as path from '../../../base/common/path.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../base/common/resources.js';
import { isDefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { containsCmdDelayedExpansion } from '../../terminal/common/autoApprove/cmdDelayedExpansion.js';
import { AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, platformRootSchema, platformSessionSchema, type AutoApproveLevel } from '../common/agentHostSchema.js';
import type { IAgentToolPendingConfirmationSignal } from '../common/agentService.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { AgentHostSubsessionPermissionInheritanceConfigKey, getSubsessionInheritanceChoice, SUBSESSION_INHERITANCE_QUESTION_ID, SubsessionInheritanceOptionId, SubsessionPermissionInheritance, toSubsessionPermissionInheritance } from '../common/subsessionPermissions.js';
import { ConfirmationOptionKind, type ConfirmationOption } from '../common/state/protocol/state.js';
import { ActionType, type IToolCallReadyAction } from '../common/state/sessionActions.js';
import {
	buildDefaultChatUri,
	ChatInputAnswerState,
	ChatInputAnswerValueKind,
	ChatInputQuestionKind,
	ChatInputRequestPurpose,
	ChatInputResponseKind,
	isAhpChatChannel,
	parseRequiredSessionUriFromChatUri,
	ResponsePartKind,
	ToolCallConfirmationReason,
	type ChatInputAnswer,
	type ChatInputRequest,
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

/** One subsession waiting on the user's inheritance decision. */
interface IInheritanceAsk {
	/** Short identifier of the session being created, so the user knows what they are approving. */
	readonly description: string | undefined;
	readonly deferred: DeferredPromise<boolean>;
}

/**
 * The question shown for one or more subsessions being created at once.
 * Descriptions identify them; unnamed sessions fall back to a plain count.
 */
function buildInheritanceQuestion(levelLabel: string, descriptions: readonly (string | undefined)[]): string {
	const named = descriptions.filter((d): d is string => !!d);
	if (descriptions.length === 1) {
		return named.length === 1
			? localize('sessionPermissions.subsession.questionNamed', "This session runs with \"{0}\" permissions. Use \"{0}\" for the new session ({1})?", levelLabel, named[0])
			: localize('sessionPermissions.subsession.question', "This session runs with \"{0}\" permissions. Use \"{0}\" for the new session?", levelLabel);
	}
	return named.length === descriptions.length
		? localize('sessionPermissions.subsession.questionManyNamed', "This session runs with \"{0}\" permissions. Use \"{0}\" for the {1} new sessions ({2})?", levelLabel, descriptions.length, named.join(', '))
		: localize('sessionPermissions.subsession.questionMany', "This session runs with \"{0}\" permissions. Use \"{0}\" for the {1} new sessions?", levelLabel, descriptions.length);
}

/** Human-readable name of an elevated approval level, used when asking about inheritance. */
function getApprovalLevelLabel(level: AutoApproveLevel): string {
	return level === 'autoApprove'
		? localize('sessionPermissions.level.allowAll', "Allow All")
		: localize('sessionPermissions.level.assisted', "Assisted Permissions");
}

/** Default write-path glob rules applied to auto-approved edits. */
const DEFAULT_EDIT_AUTO_APPROVE_PATTERNS: Readonly<Record<string, boolean>> = {
	'**/*': true,
	'**/.vscode/*.json': false,
	'**/.git/**': false,
	'**/{package.json,server.xml,build.rs,web.config,.gitattributes,.env}': false,
	'**/{.npmrc,.yarnrc,.yarnrc.yml,.pnpmfile.js,.pnpmfile.cjs,.pnpmfile.mjs,pnpm-workspace.yaml}': false,
	'**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props}': false,
	'**/*.lock': false,
	'**/*-lock.{yaml,json}': false,
	// Files that can register lifecycle hooks running arbitrary shell commands.
	// Writing them must never be auto-approved. Keep in sync with the hook and
	// agent source locations in `promptFileLocations.ts`.
	'**/.github/agents/**': false,
	'**/.github/hooks/**': false,
	'**/.claude/agents/**': false,
	'**/.claude/settings.json': false,
	'**/.claude/settings.local.json': false,
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

	/** Subsessions waiting to be asked about, keyed by chat channel. */
	private readonly _inheritanceAsks = new Map<ProtocolURI, IInheritanceAsk[]>();
	/** The question currently on screen for a chat channel, if any. */
	private readonly _outstandingInheritanceAsks = new Map<ProtocolURI, { readonly requestId: string; readonly asks: readonly IInheritanceAsk[]; readonly level: AutoApproveLevel }>();

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
		// A pending question must never leave its `create_session` call hanging.
		this._register(toDisposable(() => {
			for (const chatChannel of [...this._outstandingInheritanceAsks.keys(), ...this._inheritanceAsks.keys()]) {
				const outstanding = this._outstandingInheritanceAsks.get(chatChannel);
				this._outstandingInheritanceAsks.delete(chatChannel);
				for (const ask of outstanding?.asks ?? []) {
					ask.deferred.complete(false);
				}
				this._resolveQueuedInheritanceAsks(chatChannel, false);
			}
		}));
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
		// `sessionKey` is the chat channel URI (see `_handleToolReady`), so the
		// state manager returns that chat's *effective* working-directory set
		// (its own subset override when present, else the session's full set —
		// peer chats inherit). A read/write/shell destination auto-approves when
		// contained by *any* root. Today the set has exactly one entry (the
		// create-time length guard), so this is behaviour-identical to the
		// previous single-directory logic.
		const workDirs = this._configService.getEffectiveWorkingDirectories(sessionKey);
		const workingDirectories = workDirs?.map(d => URI.parse(d));

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
			if (await this._isReadAutoApproved(URI.file(e.permissionPath), workingDirectories)) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving read of ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			return undefined;
		}

		// 5. Write auto-approval
		if (e.permissionKind === 'write' && e.permissionPath) {
			if (await this._isEditAutoApproved(URI.file(e.permissionPath), workingDirectories)) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving write to ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			return undefined;
		}

		// 6. Shell auto-approval
		if (e.permissionKind === 'shell' && e.toolInput) {
			// Terminal-rule analysis needs an explicit shell dialect. Producers
			// that omit `shellLanguage` (or fail to correlate one) must prompt.
			if (!e.shellLanguage) {
				this._logService.trace('[SessionPermissionManager] Shell language is missing, requiring confirmation');
				return undefined;
			}
			if (this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveEnabledConfigKey) === false) {
				return undefined;
			}
			const result = this._commandAutoApprover.shouldAutoApprove(e.toolInput, {
				autoApproveRules: this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveRulesConfigKey),
				isWriteDestApproved: dest => this._isShellWriteDestApproved(dest, workingDirectories),
				language: e.shellLanguage,
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

	/** Whether adding a persistent terminal auto-approve rule can suppress future prompts for this shell event. */
	isAutoApproveRuleResolvable(e: IToolApprovalEvent, sessionKey: ProtocolURI): boolean {
		if (e.permissionKind !== 'shell' || !e.toolInput || e.requestSandboxBypass || !e.shellLanguage) {
			return false;
		}
		if (this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveEnabledConfigKey) === false) {
			return false;
		}
		const workDirs = this._configService.getEffectiveWorkingDirectories(sessionKey);
		const workingDirectories = workDirs?.map(d => URI.parse(d));
		return this._commandAutoApprover.evaluate(e.toolInput, {
			autoApproveRules: this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveRulesConfigKey),
			isWriteDestApproved: dest => this._isShellWriteDestApproved(dest, workingDirectories),
			language: e.shellLanguage,
		}).autoApproveRuleResolvable;
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

	// ---- Subsession permission inheritance ----------------------------------

	/** The configured subsession inheritance behavior, forwarded from the renderer's setting. */
	private _getSubsessionInheritancePolicy(): SubsessionPermissionInheritance {
		return toSubsessionPermissionInheritance(this._configService.getRootValue(platformRootSchema, AgentHostSubsessionPermissionInheritanceConfigKey));
	}

	/**
	 * The parent's approval level when it is elevated *and* expressed on the
	 * portable `autoApprove` axis, else `undefined`. Providers that model
	 * approvals on their own axis (Claude's `permissionMode`, Codex's
	 * `permissionsPreset`) omit `autoApprove` from their session schema, so
	 * their level is deliberately not inheritable.
	 */
	private _getInheritableApprovalLevel(sessionKey: ProtocolURI): AutoApproveLevel | undefined {
		const schema = this._stateManager.getSessionState(sessionKey)?.config?.schema;
		if (!schema?.properties?.[SessionConfigKey.AutoApprove]) {
			return undefined;
		}
		const level = this.getEffectiveApprovalLevel(sessionKey);
		return level === 'assisted' || level === 'autoApprove' ? level : undefined;
	}

	/**
	 * The approval level a subsession starts at, or `undefined` to leave it at
	 * the provider default.
	 *
	 * Under `once` the user is asked, and the tool call blocks until they
	 * answer — the question is the consent gate, so it must not be reduced to a
	 * tool confirmation, which an elevated session never surfaces.
	 *
	 * `childWorkingDirectory` is the directory the new session will run in.
	 * Under `always` — the only path that never asks — an elevated level is
	 * carried over only when that directory is already covered by the parent's
	 * roots, so an unattended subsession cannot widen the blast radius.
	 */
	async resolveInheritedApprovalLevel(chatChannel: ProtocolURI, childWorkingDirectory: URI | undefined, description?: string): Promise<AutoApproveLevel | undefined> {
		const policy = this._getSubsessionInheritancePolicy();
		if (policy === SubsessionPermissionInheritance.Never) {
			return undefined;
		}
		const level = this._getInheritableApprovalLevel(chatChannel);
		if (!level) {
			return undefined;
		}
		if (policy === SubsessionPermissionInheritance.Always) {
			return this._isWithinSessionRoots(chatChannel, childWorkingDirectory) ? level : undefined;
		}
		return await this._askInheritanceDecision(chatChannel, level, description) ? level : undefined;
	}

	/**
	 * Asks whether a subsession should inherit `level`, resolving once the user
	 * answers. Questions for one chat are asked one at a time: an agent can
	 * spawn several sessions at once, and stacking a card per session would be
	 * both noisy and ambiguous.
	 */
	private _askInheritanceDecision(chatChannel: ProtocolURI, level: AutoApproveLevel, description: string | undefined): Promise<boolean> {
		const ask: IInheritanceAsk = { description, deferred: new DeferredPromise<boolean>() };
		const queue = this._inheritanceAsks.get(chatChannel) ?? [];
		queue.push(ask);
		this._inheritanceAsks.set(chatChannel, queue);
		this._pumpInheritanceQueue(chatChannel, level);
		return ask.deferred.p;
	}

	/** Asks about every queued subsession for `chatChannel`, unless a question is already outstanding. */
	private _pumpInheritanceQueue(chatChannel: ProtocolURI, level: AutoApproveLevel): void {
		const queue = this._inheritanceAsks.get(chatChannel);
		if (!queue?.length || this._outstandingInheritanceAsks.has(chatChannel)) {
			return;
		}
		const asked = queue.splice(0, queue.length);
		const requestId = generateUuid();
		this._outstandingInheritanceAsks.set(chatChannel, { requestId, asks: asked, level });
		const request: ChatInputRequest = {
			id: requestId,
			purpose: ChatInputRequestPurpose.Elicitation,
			questions: [{
				kind: ChatInputQuestionKind.SingleSelect,
				id: SUBSESSION_INHERITANCE_QUESTION_ID,
				message: buildInheritanceQuestion(getApprovalLevelLabel(level), asked.map(ask => ask.description)),
				required: true,
				options: [
					{ id: SubsessionInheritanceOptionId.InheritOnce, label: localize('sessionPermissions.subsession.inheritOnce', "Yes, for this new session.") },
					{ id: SubsessionInheritanceOptionId.AllowWithoutInheriting, label: localize('sessionPermissions.subsession.allow', "No, use default permissions.") },
					{ id: SubsessionInheritanceOptionId.InheritAlways, label: localize('sessionPermissions.subsession.inheritAlways', "Always, don't ask again.") },
					{ id: SubsessionInheritanceOptionId.InheritNever, label: localize('sessionPermissions.subsession.inheritNever', "Never, don't ask again.") },
				],
				// A freeform reply cannot express a permission decision.
				allowFreeformInput: false,
			}],
		};
		// Questions live on a chat channel; callers may hand us the owning
		// session URI instead (server tools are addressed either way).
		const target = isAhpChatChannel(chatChannel) ? chatChannel : buildDefaultChatUri(chatChannel);
		this._stateManager.dispatchServerAction(target, { type: ActionType.ChatInputRequested, request });
	}

	/**
	 * Resolves a pending subsession-inheritance question. Returns `false` when
	 * the completion belongs to another consumer (e.g. an agent's own request).
	 */
	tryResolveInheritanceDecision(requestId: string, response: ChatInputResponseKind, answers: Record<string, ChatInputAnswer> | undefined): boolean {
		const entry = [...this._outstandingInheritanceAsks].find(([, outstanding]) => outstanding.requestId === requestId);
		if (!entry) {
			return false;
		}
		const [chatChannel, outstanding] = entry;
		this._outstandingInheritanceAsks.delete(chatChannel);

		const answer = answers?.[SUBSESSION_INHERITANCE_QUESTION_ID];
		const value = answer?.state === ChatInputAnswerState.Skipped ? undefined : answer?.value;
		const selected = response === ChatInputResponseKind.Accept && value?.kind === ChatInputAnswerValueKind.Selected
			? value.value
			: undefined;
		const choice = getSubsessionInheritanceChoice(selected);
		const inherit = choice?.inherit === true;
		for (const ask of outstanding.asks) {
			ask.deferred.complete(inherit);
		}

		// A settled behavior answers everything already queued; otherwise the
		// remaining sessions are asked about together.
		if (choice?.persist) {
			this._resolveQueuedInheritanceAsks(chatChannel, inherit);
			return true;
		}
		this._pumpInheritanceQueue(chatChannel, outstanding.level);
		return true;
	}

	/** Settles every queued (not yet asked) subsession for `chatChannel`. */
	private _resolveQueuedInheritanceAsks(chatChannel: ProtocolURI, inherit: boolean): void {
		const queue = this._inheritanceAsks.get(chatChannel);
		this._inheritanceAsks.delete(chatChannel);
		for (const ask of queue ?? []) {
			ask.deferred.complete(inherit);
		}
	}

	/** Whether `directory` is covered by one of the session's effective working directories. */
	private _isWithinSessionRoots(sessionKey: ProtocolURI, directory: URI | undefined): boolean {
		if (!directory) {
			return false;
		}
		const roots = this._configService.getEffectiveWorkingDirectories(sessionKey);
		return !!roots?.some(root => this._isResourceInDirectory(directory, URI.parse(root)));
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
				...(state.contributor ? { contributor: state.contributor } : {}),
				...(state.intention !== undefined ? { intention: state.intention } : {}),
				invocationMessage: state.invocationMessage,
				toolInput: state.toolInput,
				confirmationTitle: state.confirmationTitle,
				riskAssessment: state.riskAssessment,
				edits: state.edits,
				editable: state.editable,
				...(state._meta ? { _meta: state._meta } : {}),
				// Managed asks are one-time only. Other agents can supply tool-specific
				// buttons (e.g. ExitPlanMode's `Approve`/`Deny`) via `state.options`;
				// otherwise the standard session/once/skip set is used.
				options: e.managedApprovalRequired
					? MANAGED_CONFIRMATION_OPTIONS.slice()
					: state.options
						? state.options.slice()
						: CONFIRMATION_OPTIONS.slice(),
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
	private _isShellWriteDestApproved(dest: string, workingDirectories: readonly URI[] | undefined): boolean {
		// A shell command runs in exactly one process cwd = the primary root
		// (index 0), so a *relative* redirect can only resolve against that cwd.
		const resource = this._resolveShellRedirectResource(dest, workingDirectories?.[0]);
		if (!resource) {
			return false;
		}
		// The resolved (absolute) destination auto-approves when contained by
		// any root — the same "any root" rule as read/write. Unlike read/write,
		// this path is synchronous and does not resolve symlinks on the
		// destination (pre-existing behaviour, unchanged here).
		return (workingDirectories ?? []).some(workingDirectory => this._checkWriteResource(resource, workingDirectory));
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
	private async _isEditAutoApproved(resource: URI, workingDirectories: readonly URI[] | undefined): Promise<boolean> {
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
		// Approve if ANY root clears the write checks for every resource
		// candidate. `_checkWriteResource` is synchronous, so a plain `.some`
		// already short-circuits — there is no per-root async work to parallelize.
		return workingDirectories.some(workingDirectory => resourcesToCheck.every(candidate => this._checkWriteResource(candidate, workingDirectory)));
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
