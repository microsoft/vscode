/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type * as vscode from 'vscode';
import { CapturingToken } from '../../../../platform/requestLogger/common/capturingToken';
import { createServiceIdentifier } from '../../../../util/common/services';
import { arrayEquals } from '../../../../util/vs/base/common/equals';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import type { ClaudeFolderInfo } from '../common/claudeFolderInfo';

/**
 * Usage handler function type for reporting token usage to stream.
 */
export type UsageHandler = (usage: vscode.ChatResultUsage) => void;

export interface SessionState {
	modelId: string | undefined;
	permissionMode: PermissionMode;
	capturingToken: CapturingToken | undefined;
	folderInfo: ClaudeFolderInfo | undefined;
	usageHandler: UsageHandler | undefined;
}

/**
 * Event fired when session state changes.
 */
export interface SessionStateChangeEvent {
	readonly sessionId: string;
	readonly modelId?: string;
	readonly permissionMode?: PermissionMode;
	readonly folderInfo?: ClaudeFolderInfo;
}

export interface IClaudeSessionStateService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when session state (model or permission mode) changes.
	 */
	readonly onDidChangeSessionState: Event<SessionStateChangeEvent>;

	/**
	 * Gets the stored model ID for a session (does not apply fallback logic).
	 */
	getModelIdForSession(sessionId: string): string | undefined;

	/**
	 * Sets the model ID for a session.
	 */
	setModelIdForSession(sessionId: string, modelId: string | undefined): void;

	/**
	 * Gets the permission mode for a session.
	 */
	getPermissionModeForSession(sessionId: string): PermissionMode;

	/**
	 * Sets the permission mode for a session.
	 */
	setPermissionModeForSession(sessionId: string, mode: PermissionMode): void;

	/**
	 * Gets the capturing token for a session (used for request logging grouping).
	 */
	getCapturingTokenForSession(sessionId: string): CapturingToken | undefined;

	/**
	 * Sets the capturing token for a session.
	 */
	setCapturingTokenForSession(sessionId: string, token: CapturingToken | undefined): void;

	/**
	 * Gets the folder info for a session.
	 */
	getFolderInfoForSession(sessionId: string): ClaudeFolderInfo | undefined;

	/**
	 * Sets the folder info for a session.
	 */
	setFolderInfoForSession(sessionId: string, folderInfo: ClaudeFolderInfo): void;

	/**
	 * Gets the usage handler for a session.
	 */
	getUsageHandlerForSession(sessionId: string): UsageHandler | undefined;

	/**
	 * Sets the usage handler for a session.
	 */
	setUsageHandlerForSession(sessionId: string, handler: UsageHandler | undefined): void;
}

export const IClaudeSessionStateService = createServiceIdentifier<IClaudeSessionStateService>('IClaudeSessionStateService');

export class ClaudeSessionStateService extends Disposable implements IClaudeSessionStateService {
	declare _serviceBrand: undefined;

	private readonly _onDidChangeSessionState = this._register(new Emitter<SessionStateChangeEvent>());
	readonly onDidChangeSessionState = this._onDidChangeSessionState.event;

	// State for sessions (model and permission mode selections)
	// TODO: What about expiration of state for old sessions?
	private readonly _sessionState = new Map<string, SessionState>();

	constructor() {
		super();
	}

	getModelIdForSession(sessionId: string): string | undefined {
		const state = this._sessionState.get(sessionId);
		return state?.modelId;
	}

	setModelIdForSession(sessionId: string, modelId: string | undefined): void {
		const existing = this._sessionState.get(sessionId);
		if (existing?.modelId === modelId) {
			return;
		}
		this._sessionState.set(sessionId, {
			modelId,
			permissionMode: existing?.permissionMode ?? 'acceptEdits',
			capturingToken: existing?.capturingToken,
			folderInfo: existing?.folderInfo,
			usageHandler: existing?.usageHandler,
		});
		this._onDidChangeSessionState.fire({ sessionId, modelId });
	}

	getPermissionModeForSession(sessionId: string): PermissionMode {
		return this._sessionState.get(sessionId)?.permissionMode ?? 'acceptEdits';
	}

	setPermissionModeForSession(sessionId: string, mode: PermissionMode): void {
		const existing = this._sessionState.get(sessionId);
		if (existing?.permissionMode === mode) {
			return;
		}
		this._sessionState.set(sessionId, {
			modelId: existing?.modelId,
			permissionMode: mode,
			capturingToken: existing?.capturingToken,
			folderInfo: existing?.folderInfo,
			usageHandler: existing?.usageHandler,
		});
		this._onDidChangeSessionState.fire({ sessionId, permissionMode: mode });
	}

	getCapturingTokenForSession(sessionId: string): CapturingToken | undefined {
		return this._sessionState.get(sessionId)?.capturingToken;
	}

	setCapturingTokenForSession(sessionId: string, token: CapturingToken | undefined): void {
		const existing = this._sessionState.get(sessionId);
		this._sessionState.set(sessionId, {
			modelId: existing?.modelId,
			permissionMode: existing?.permissionMode ?? 'acceptEdits',
			capturingToken: token,
			folderInfo: existing?.folderInfo,
			usageHandler: existing?.usageHandler,
		});
	}

	getFolderInfoForSession(sessionId: string): ClaudeFolderInfo | undefined {
		return this._sessionState.get(sessionId)?.folderInfo;
	}

	setFolderInfoForSession(sessionId: string, folderInfo: ClaudeFolderInfo): void {
		const existing = this._sessionState.get(sessionId);
		if (existing?.folderInfo?.cwd === folderInfo.cwd && arrayEquals(existing?.folderInfo?.additionalDirectories ?? [], folderInfo.additionalDirectories)) {
			return;
		}
		this._sessionState.set(sessionId, {
			modelId: existing?.modelId,
			permissionMode: existing?.permissionMode ?? 'acceptEdits',
			capturingToken: existing?.capturingToken,
			folderInfo,
			usageHandler: existing?.usageHandler,
		});
		this._onDidChangeSessionState.fire({ sessionId, folderInfo });
	}

	getUsageHandlerForSession(sessionId: string): UsageHandler | undefined {
		return this._sessionState.get(sessionId)?.usageHandler;
	}

	setUsageHandlerForSession(sessionId: string, handler: UsageHandler | undefined): void {
		const existing = this._sessionState.get(sessionId);
		this._sessionState.set(sessionId, {
			modelId: existing?.modelId,
			permissionMode: existing?.permissionMode ?? 'acceptEdits',
			capturingToken: existing?.capturingToken,
			folderInfo: existing?.folderInfo,
			usageHandler: handler,
		});
	}

	override dispose(): void {
		this._sessionState.clear();
		super.dispose();
	}
}
