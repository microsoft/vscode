/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

export const IPlanningModeService = createDecorator<IPlanningModeService>('planningModeService');

export interface IConversationEntry {
	readonly timestamp: number;
	readonly type: 'user' | 'assistant' | 'tool-call' | 'tool-result' | 'system';
	readonly content: string;
	readonly metadata?: {
		toolName?: string;
		toolParams?: Record<string, unknown>;
		toolResult?: unknown;
		error?: string;
		sessionId?: string;
		requestId?: string;
	};
}

export interface IConversationSummary {
	readonly startTime: number;
	readonly endTime: number;
	readonly totalEntries: number;
	readonly summary: string;
	readonly keyFindings: string[];
	readonly toolsUsed: string[];
	readonly recommendations: string[];
	readonly context: {
		workspace?: string;
		files?: string[];
		errors?: string[];
	};
}

export interface IPlanningModeState {
	readonly isActive: boolean;
	readonly startTime?: number;
	readonly conversationEntries: IConversationEntry[];
	readonly restrictedOperations: string[];
}

export interface IPlanningModeService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether planning mode is currently active
	 */
	readonly isActive: boolean;

	/**
	 * Event fired when planning mode state changes
	 */
	readonly onDidChange: Event<boolean>;

	/**
	 * Event fired when a new conversation entry is added
	 */
	readonly onDidAddConversationEntry: Event<IConversationEntry>;

	/**
	 * Current conversation entries
	 */
	readonly conversationEntries: readonly IConversationEntry[];

	/**
	 * Toggle planning mode on/off
	 */
	togglePlanningMode(): Promise<void>;

	/**
	 * Set planning mode state
	 */
	setActive(active: boolean): Promise<void>;

	/**
	 * Add an entry to the conversation log
	 */
	addConversationEntry(entry: Omit<IConversationEntry, 'timestamp'>): void;

	/**
	 * Generate a comprehensive summary for delegation
	 */
	generateSummary(): IConversationSummary;

	/**
	 * Clear conversation history
	 */
	clearConversation(): void;

	/**
	 * Check if a specific operation is restricted in planning mode
	 */
	isOperationRestricted(operation: string): boolean;

	/**
	 * Export conversation history as structured data
	 */
	exportConversation(): string;
}

export const enum PlanningModeSettings {
	ENABLED = 'planningMode.enabled',
	AUTO_RESTRICT_EDITING = 'planningMode.autoRestrictEditing',
	SHOW_STATUS_BAR = 'planningMode.showStatusBar',
	CONVERSATION_TRACKING = 'planningMode.conversationTracking',
	NOTIFICATION_LEVEL = 'planningMode.notificationLevel',
	EXPORT_FORMAT = 'planningMode.exportFormat',
}

export const RESTRICTED_OPERATIONS = {
	FILE_SAVE: 'file.save',
	FILE_CREATE: 'file.create',
	FILE_WRITE: 'file.write',
	FILE_DELETE: 'file.delete',
	FILE_RENAME: 'file.rename',
	EDITOR_EDIT: 'editor.edit',
	WORKSPACE_EDIT: 'workspace.edit',
} as const;

export type RestrictedOperation = typeof RESTRICTED_OPERATIONS[keyof typeof RESTRICTED_OPERATIONS];
