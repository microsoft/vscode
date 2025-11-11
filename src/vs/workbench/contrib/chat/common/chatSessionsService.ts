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
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditableData } from '../../../common/views.js';
import { IChatAgentAttachmentCapabilities, IChatAgentRequest } from './chatAgents.js';
import { IChatEditingSession } from './chatEditingService.js';
import { IChatRequestVariableData } from './chatModel.js';
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
	readonly when?: string;
	readonly icon?: string | { light: string; dark: string };
	readonly order?: number;
	readonly alternativeIds?: string[];
	readonly welcomeTitle?: string;
	readonly welcomeMessage?: string;
	readonly welcomeTips?: string;
	readonly inputPlaceholder?: string;
	readonly capabilities?: IChatAgentAttachmentCapabilities;
	readonly commands?: IChatSessionCommandContribution[];
}
export interface IChatSessionItem {
	/** @deprecated Use {@link resource} instead */
	id: string;
	resource: URI;
	label: string;
	iconPath?: ThemeIcon;
	description?: string | IMarkdownString;
	status?: ChatSessionStatus;
	tooltip?: string | IMarkdownString;
	timing: {
		startTime: number;
		endTime?: number;
	};
	statistics?: {
		files: number;
		insertions: number;
		deletions: number;
	};

}

export type IChatSessionHistoryItem = {
	type: 'request';
	prompt: string;
	participant: string;
	command?: string;
	variableData?: IChatRequestVariableData;
} | {
	type: 'response';
	parts: IChatProgress[];
	participant: string;
};

/**
 * The session type used for local agent chat sessions.
 */
export const localChatSessionType = 'local';

export interface IChatSession extends IDisposable {
	readonly onWillDispose: Event<void>;

	readonly sessionResource: URI;

	readonly history: readonly IChatSessionHistoryItem[];

	/**
	 * Session options as key-value pairs. Keys correspond to option group IDs (e.g., 'models', 'subagents')
	 * and values are the selected option item IDs.
	 */
	readonly options?: Record<string, string>;

	readonly progressObs?: IObservable<IChatProgress[]>;
	readonly isCompleteObs?: IObservable<boolean>;
	readonly interruptActiveResponseCallback?: () => Promise<boolean>;

	/**
	 * Editing session transferred from a previously-untitled chat session in `onDidCommitChatSessionItem`.
	 */
	initialEditingSession?: IChatEditingSession;

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
	provideChatSessionContent(sessionResource: URI, token: CancellationToken): Promise<IChatSession>;
}

export type SessionOptionsChangedCallback = (sessionResource: URI, updates: ReadonlyArray<{
	optionId: string;
	value: string;
}>) => Promise<void>;

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;

	// #region Chat session item provider support
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider>;
	readonly onDidChangeSessionItems: Event<string>;

	readonly onDidChangeAvailability: Event<void>;
	readonly onDidChangeInProgress: Event<void>;

	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable;
	hasChatSessionItemProvider(chatSessionType: string): Promise<boolean>;
	getAllChatSessionItemProviders(): IChatSessionItemProvider[];

	getAllChatSessionContributions(): IChatSessionsExtensionPoint[];
	getIconForSessionType(chatSessionType: string): ThemeIcon | URI | undefined;
	getWelcomeTitleForSessionType(chatSessionType: string): string | undefined;
	getWelcomeMessageForSessionType(chatSessionType: string): string | undefined;
	getInputPlaceholderForSessionType(chatSessionType: string): string | undefined;

	/**
	 * Get the list of chat session items grouped by session type.
	 */
	getAllChatSessionItems(token: CancellationToken): Promise<Array<{ readonly chatSessionType: string; readonly items: IChatSessionItem[] }>>;

	getNewChatSessionItem(chatSessionType: string, options: {
		request: IChatAgentRequest;
		metadata?: any;
	}, token: CancellationToken): Promise<IChatSessionItem>;

	reportInProgress(chatSessionType: string, count: number): void;
	getInProgress(): { displayName: string; count: number }[];

	// Notify providers about session items changes
	notifySessionItemsChanged(chatSessionType: string): void;
	// #endregion

	// #region Content provider support
	readonly onDidChangeContentProviderSchemes: Event<{ readonly added: string[]; readonly removed: string[] }>;

	getContentProviderSchemes(): string[];

	registerChatSessionContentProvider(scheme: string, provider: IChatSessionContentProvider): IDisposable;
	canResolveChatSession(sessionResource: URI): Promise<boolean>;
	getOrCreateChatSession(sessionResource: URI, token: CancellationToken): Promise<IChatSession>;

	hasAnySessionOptions(sessionResource: URI): boolean;
	getSessionOption(sessionResource: URI, optionId: string): string | undefined;
	setSessionOption(sessionResource: URI, optionId: string, value: string): boolean;

	/**
	 * Get the capabilities for a specific session type
	 */
	getCapabilitiesForSessionType(chatSessionType: string): IChatAgentAttachmentCapabilities | undefined;

	getOptionGroupsForSessionType(chatSessionType: string): IChatSessionProviderOptionGroup[] | undefined;
	setOptionGroupsForSessionType(chatSessionType: string, handle: number, optionGroups?: IChatSessionProviderOptionGroup[]): void;
	setOptionsChangeCallback(callback: SessionOptionsChangedCallback): void;
	notifySessionOptionsChange(sessionResource: URI, updates: ReadonlyArray<{ optionId: string; value: string }>): Promise<void>;

	// Editable session support
	setEditableSession(sessionResource: URI, data: IEditableData | null): Promise<void>;
	getEditableData(sessionResource: URI): IEditableData | undefined;
	isEditable(sessionResource: URI): boolean;
	// #endregion
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');
