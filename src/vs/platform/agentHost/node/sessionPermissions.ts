/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { match as globMatch } from '../../../base/common/glob.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import type { IAgentToolReadyEvent } from '../common/agentService.js';
import { platformSessionSchema } from '../common/agentHostSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { ConfirmationOptionKind, type ConfirmationOption } from '../common/state/protocol/state.js';
import { ActionType, type IToolCallReadyAction } from '../common/state/sessionActions.js';
import {
	ResponsePartKind,
	ToolCallConfirmationReason,
	type URI as ProtocolURI,
} from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { CommandAutoApprover } from './commandAutoApprover.js';

/**
 * Event fields needed for auto-approval decisions.
 * Matches the subset of {@link IAgentToolReadyEvent} used by the
 * approval pipeline.
 */
export interface IToolApprovalEvent {
	readonly toolCallId: string;
	readonly session: URI;
	readonly permissionKind?: IAgentToolReadyEvent['permissionKind'];
	readonly permissionPath?: string;
	readonly toolInput?: string;
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

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IAgentConfigurationService private readonly _configService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._commandAutoApprover = this._register(new CommandAutoApprover(this._logService));
	}

	/**
	 * Initializes async resources (tree-sitter WASM) used for shell command
	 * auto-approval. Await this before any session events can arrive to
	 * guarantee that {@link getAutoApproval} is fully synchronous.
	 */
	initialize(): Promise<void> {
		return this._commandAutoApprover.initialize();
	}

	// ---- Auto-approval (analogous to getPreConfirmAction) -------------------

	/**
	 * Synchronously checks whether a `tool_ready` event should be
	 * auto-approved. Returns a {@link ToolCallConfirmationReason} when the
	 * tool call should proceed without user interaction, or `undefined`
	 * when user confirmation is required.
	 *
	 * Checks are evaluated in order:
	 * 1. Session-level bypass (`autoApprove` / `autopilot` config)
	 * 2. Per-tool session permissions (`permissions.allow`)
	 * 3. Read path rules (within working directory)
	 * 4. Write path rules (within working directory + glob patterns)
	 * 5. Shell command rules (tree-sitter parsed, default allow/deny)
	 */
	getAutoApproval(e: IToolApprovalEvent, sessionKey: ProtocolURI): ToolCallConfirmationReason | undefined {
		const autoApproveLevel = this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove);
		const workDir = this._configService.getEffectiveWorkingDirectory(sessionKey);

		// 1. Session-level auto-approve
		if (autoApproveLevel === 'autoApprove' || autoApproveLevel === 'autopilot') {
			this._logService.trace(`[SessionPermissionManager] Auto-approving tool call (session autoApprove=${autoApproveLevel})`);
			return ToolCallConfirmationReason.Setting;
		}

		// 2. Per-tool session permissions
		if (this._isToolAllowedByPermissions(sessionKey, e.toolCallId)) {
			return ToolCallConfirmationReason.Setting;
		}

		// 3. Read auto-approval
		if (e.permissionKind === 'read' && e.permissionPath) {
			if (this._isPathInWorkingDirectory(e.permissionPath, workDir)) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving read of ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			return undefined;
		}

		// 4. Write auto-approval
		if (e.permissionKind === 'write' && e.permissionPath) {
			if (this._isPathInWorkingDirectory(e.permissionPath, workDir) && this._isEditAutoApproved(e.permissionPath)) {
				this._logService.trace(`[SessionPermissionManager] Auto-approving write to ${e.permissionPath}`);
				return ToolCallConfirmationReason.NotNeeded;
			}
			return undefined;
		}

		// 5. Shell auto-approval
		if (e.permissionKind === 'shell' && e.toolInput) {
			const result = this._commandAutoApprover.shouldAutoApprove(e.toolInput);
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

	// ---- Action construction (analogous to getPreConfirmActions) -------------

	/**
	 * Constructs a `SessionToolCallReady` action from an agent `tool_ready`
	 * event. When the tool needs user confirmation (`confirmationTitle` is
	 * set), the standard confirmation options are included in the action so
	 * clients can render them directly.
	 */
	createToolReadyAction(e: IAgentToolReadyEvent, sessionKey: ProtocolURI, turnId: string): IToolCallReadyAction {
		if (e.confirmationTitle) {
			return {
				type: ActionType.SessionToolCallReady,
				session: sessionKey,
				turnId,
				toolCallId: e.toolCallId,
				invocationMessage: e.invocationMessage,
				toolInput: e.toolInput,
				confirmationTitle: e.confirmationTitle,
				edits: e.edits,
				options: CONFIRMATION_OPTIONS.slice(),
			};
		}
		return {
			type: ActionType.SessionToolCallReady,
			session: sessionKey,
			turnId,
			toolCallId: e.toolCallId,
			invocationMessage: e.invocationMessage,
			toolInput: e.toolInput,
			confirmed: ToolCallConfirmationReason.NotNeeded,
		};
	}

	// ---- Post-confirmation side effects -------------------------------------

	/**
	 * Handles the side effect of a `SessionToolCallConfirmed` action when the
	 * user selected "Allow in this Session". Adds the tool to the session's
	 * permission allow list so future calls are auto-approved.
	 */
	handleToolCallConfirmed(sessionKey: ProtocolURI, toolCallId: string, selectedOptionId: string | undefined): void {
		if (selectedOptionId === ALLOW_SESSION_OPTION_ID) {
			const toolName = this._getToolNameForToolCall(sessionKey, toolCallId);
			if (toolName) {
				this._addToolToSessionPermissions(sessionKey, toolName);
			}
		}
	}

	// ---- Internal helpers ---------------------------------------------------

	private _isPathInWorkingDirectory(filePath: string, workDir: string | undefined): boolean {
		if (!workDir) {
			return false;
		}
		const workingDirectory = URI.parse(workDir);
		return extUriBiasedIgnorePathCase.isEqualOrParent(normalizePath(URI.file(filePath)), workingDirectory);
	}

	private _isEditAutoApproved(filePath: string): boolean {
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
		const permissions = this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Permissions);
		const allowed = permissions?.allow.includes(toolName) ?? false;
		if (allowed) {
			this._logService.trace(`[SessionPermissionManager] Auto-approving "${toolName}" via session permissions`);
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
