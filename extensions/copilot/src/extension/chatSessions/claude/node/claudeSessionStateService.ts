/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EffortLevel, PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { CapturingToken } from '../../../../platform/requestLogger/common/capturingToken';
import { arrayEquals } from '../../../../util/vs/base/common/equals';
import { Emitter } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import type { ClaudeFolderInfo } from '../common/claudeFolderInfo';
import type { ParsedClaudeModelId } from '../common/claudeModelId';
import type { IClaudeSessionStateService, SessionState, SessionStateChangeEvent, UsageHandler } from '../common/claudeSessionStateService';

export class ClaudeSessionStateService extends Disposable implements IClaudeSessionStateService {
	declare _serviceBrand: undefined;

	private readonly _onDidChangeSessionState = this._register(new Emitter<SessionStateChangeEvent>());
	readonly onDidChangeSessionState = this._onDidChangeSessionState.event;

	// State for sessions (model and permission mode selections)
	// TODO: What about expiration of state for old sessions?
	// TODO: Refactor setters to use a single `updateSession(id, patch)` method or spread
	// pattern (`{ ...existing, field: value }`) so that adding a new field to SessionState
	// doesn't require touching every existing setter.
	private readonly _sessionState = new Map<string, SessionState>();

	constructor() {
		super();
	}

	getModelIdForSession(sessionId: string): ParsedClaudeModelId | undefined {
		const state = this._sessionState.get(sessionId);
		return state?.modelId;
	}

	setModelIdForSession(sessionId: string, modelId: ParsedClaudeModelId | undefined): void {
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
			reasoningEffort: existing?.reasoningEffort,
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
			reasoningEffort: existing?.reasoningEffort,
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
			reasoningEffort: existing?.reasoningEffort,
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
			reasoningEffort: existing?.reasoningEffort,
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
			reasoningEffort: existing?.reasoningEffort,
		});
	}

	getReasoningEffortForSession(sessionId: string): EffortLevel | undefined {
		return this._sessionState.get(sessionId)?.reasoningEffort;
	}

	setReasoningEffortForSession(sessionId: string, effort: EffortLevel | undefined): void {
		const existing = this._sessionState.get(sessionId);
		if (existing?.reasoningEffort === effort) {
			return;
		}
		this._sessionState.set(sessionId, {
			modelId: existing?.modelId,
			permissionMode: existing?.permissionMode ?? 'acceptEdits',
			capturingToken: existing?.capturingToken,
			folderInfo: existing?.folderInfo,
			usageHandler: existing?.usageHandler,
			reasoningEffort: effort,
		});
	}

	override dispose(): void {
		this._sessionState.clear();
		super.dispose();
	}
}
