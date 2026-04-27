/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EffortLevel, PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type * as vscode from 'vscode';
import { CapturingToken } from '../../../../platform/requestLogger/common/capturingToken';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Event } from '../../../../util/vs/base/common/event';
import type { ClaudeFolderInfo } from './claudeFolderInfo';
import type { ParsedClaudeModelId } from './claudeModelId';

/**
 * Usage handler function type for reporting token usage to stream.
 */
export type UsageHandler = (usage: vscode.ChatResultUsage) => void;

export interface SessionState {
	modelId: ParsedClaudeModelId | undefined;
	permissionMode: PermissionMode;
	capturingToken: CapturingToken | undefined;
	folderInfo: ClaudeFolderInfo | undefined;
	usageHandler: UsageHandler | undefined;
	reasoningEffort: EffortLevel | undefined;
}

/**
 * Event fired when session state changes.
 */
export interface SessionStateChangeEvent {
	readonly sessionId: string;
	readonly modelId?: ParsedClaudeModelId;
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
	getModelIdForSession(sessionId: string): ParsedClaudeModelId | undefined;

	/**
	 * Sets the model ID for a session.
	 */
	setModelIdForSession(sessionId: string, modelId: ParsedClaudeModelId | undefined): void;

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

	/**
	 * Gets the reasoning effort for a session (user's per-request selection from the model picker).
	 */
	getReasoningEffortForSession(sessionId: string): EffortLevel | undefined;

	/**
	 * Sets the reasoning effort for a session.
	 */
	setReasoningEffortForSession(sessionId: string, effort: EffortLevel | undefined): void;
}

export const IClaudeSessionStateService = createServiceIdentifier<IClaudeSessionStateService>('IClaudeSessionStateService');
