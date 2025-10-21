/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IRelaxedExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditableData } from '../../../common/views.js';
import { IChatAgentAttachmentCapabilities, IChatAgentRequest } from './chatAgents.js';
import { IChatProgress } from './chatService.js';

export const enum ChatSessionStatus {
	Failed = 0,
	Completed = 1,
	InProgress = 2
}

export interface IChatSessionCommandContribution {
	name: string;
	description: string;
	when?: string;
}

export interface IChatSessionProviderOptionItem {
	id: string;
	name: string;
	// [key: string]: any;
}

export interface IChatSessionProviderOptionGroup {
	id: string;
	name: string;
	description?: string;
	items: IChatSessionProviderOptionItem[];
}

export interface IChatSessionsExtensionPoint {
	readonly type: string;
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly extensionDescription: IRelaxedExtensionDescription;
	readonly when?: string;
	readonly icon?: string;
	readonly welcomeTitle?: string;
	readonly welcomeMessage?: string;
	readonly welcomeTips?: string;
	readonly inputPlaceholder?: string;
	readonly capabilities?: IChatAgentAttachmentCapabilities;
	readonly commands?: IChatSessionCommandContribution[];
}
export interface IChatSessionItem {
	id: string; // TODO: remove
	resource: URI;
	label: string;
	iconPath?: ThemeIcon;
	description?: string | IMarkdownString;
	status?: ChatSessionStatus;
	tooltip?: string | IMarkdownString;
	timing?: {
		startTime: number;
		endTime?: number;
	};
	statistics?: {
		insertions: number;
		deletions: number;
	};

}

export type IChatSessionHistoryItem = { type: 'request'; prompt: string; participant: string } | { type: 'response'; parts: IChatProgress[]; participant: string };

export interface ChatSession extends IDisposable {
	readonly sessionId: string;
	readonly sessionResource: URI;
	readonly onWillDispose: Event<void>;
	history: Array<IChatSessionHistoryItem>;
	/**
	 * Session options as key-value pairs. Keys correspond to option group IDs (e.g., 'models', 'subagents')
	 * and values are the selected option item IDs.
	 */
	options?: Record<string, string>;

	readonly progressObs?: IObservable<IChatProgress[]>;
	readonly isCompleteObs?: IObservable<boolean>;
	readonly interruptActiveResponseCallback?: () => Promise<boolean>;

	requestHandler?: (
		request: IChatAgentRequest,
		progress: (progress: IChatProgress[]) => void,
		history: any[], // TODO: Nail down types
		token: CancellationToken
	) => Promise<void>;
}

export interface IChatSessionItemProvider {
	readonly chatSessionType: string;
	readonly onDidChangeChatSessionItems: Event<void>;
	provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]>;
	provideNewChatSessionItem?(options: {
		request: IChatAgentRequest;
		metadata?: any;
	}, token: CancellationToken): Promise<IChatSessionItem>;
}

export interface IChatSessionContentProvider {
	provideChatSessionContent(sessionId: string, sessionResource: URI, token: CancellationToken): Promise<ChatSession>;
}

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider>;
	readonly onDidChangeSessionItems: Event<string>;
	readonly onDidChangeAvailability: Event<void>;
	readonly onDidChangeInProgress: Event<void>;

	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable;
	getAllChatSessionContributions(): IChatSessionsExtensionPoint[];
	canResolveItemProvider(chatSessionType: string): Promise<boolean>;
	getAllChatSessionItemProviders(): IChatSessionItemProvider[];
	getIconForSessionType(chatSessionType: string): ThemeIcon | undefined;
	getWelcomeTitleForSessionType(chatSessionType: string): string | undefined;
	getWelcomeMessageForSessionType(chatSessionType: string): string | undefined;
	/**
	 * Get the input placeholder for a specific session type
	 */
	getInputPlaceholderForSessionType(chatSessionType: string): string | undefined;

	/**
	 * Get the welcome tips for a specific session type
	 */
	getWelcomeTipsForSessionType(chatSessionType: string): string | undefined;
	provideNewChatSessionItem(chatSessionType: string, options: {
		request: IChatAgentRequest;
		metadata?: any;
	}, token: CancellationToken): Promise<IChatSessionItem>;
	provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]>;
	reportInProgress(chatSessionType: string, count: number): void;
	getInProgress(): { displayName: string; count: number }[];

	registerChatSessionContentProvider(chatSessionType: string, provider: IChatSessionContentProvider): IDisposable;
	canResolveContentProvider(chatSessionType: string): Promise<boolean>;
	provideChatSessionContent(chatSessionType: string, id: string, sessionResource: URI, token: CancellationToken): Promise<ChatSession>;

	// Get available option groups for a session type
	getOptionGroupsForSessionType(chatSessionType: string): IChatSessionProviderOptionGroup[] | undefined;

	// Set available option groups for a session type (called by MainThreadChatSessions)
	setOptionGroupsForSessionType(chatSessionType: string, handle: number, optionGroups?: IChatSessionProviderOptionGroup[]): void;

	// Set callback for notifying extensions about option changes
	setOptionsChangeCallback(callback: (chatSessionType: string, sessionId: string, updates: ReadonlyArray<{ optionId: string; value: string }>) => Promise<void>): void;

	// Notify extension about option changes
	notifySessionOptionsChange(chatSessionType: string, sessionId: string, updates: ReadonlyArray<{ optionId: string; value: string }>): Promise<void>;

	// Editable session support
	setEditableSession(sessionId: string, data: IEditableData | null): Promise<void>;
	getEditableData(sessionId: string): IEditableData | undefined;
	isEditable(sessionId: string): boolean;

	// Notify providers about session items changes
	notifySessionItemsChanged(chatSessionType: string): void;

	getSessionOption(chatSessionType: string, sessionId: string, optionId: string): string | undefined;
	setSessionOption(chatSessionType: string, sessionId: string, optionId: string, value: string): boolean;

	/**
	 * Get the capabilities for a specific session type
	 */
	getCapabilitiesForSessionType(chatSessionType: string): IChatAgentAttachmentCapabilities | undefined;
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');
