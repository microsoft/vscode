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
import { IChatModel, IChatRequestVariableData } from './chatModel.js';
import { IChatProgress, IChatService } from './chatService.js';

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
	description?: string;
	locked?: boolean;
	icon?: ThemeIcon;
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
	readonly canDelegate?: boolean;
}
export interface IChatSessionItem {
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
	changes?: {
		files: number;
		insertions: number;
		deletions: number;
	} | readonly IChatSessionFileChange[];
	archived?: boolean;
	// TODO:@osortega remove once the single-view is default
	/** @deprecated */
	history?: boolean;
}

export interface IChatSessionFileChange {
	modifiedUri: URI;
	originalUri?: URI;
	insertions: number;
	deletions: number;
}

export type IChatSessionHistoryItem = {
	id?: string;
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
	 * and values are either the selected option item IDs (string) or full option items (for locked state).
	 */
	readonly options?: Record<string, string | IChatSessionProviderOptionItem>;

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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		metadata?: any;
	}, token: CancellationToken): Promise<IChatSessionItem>;
}

export interface IChatSessionContentProvider {
	provideChatSessionContent(sessionResource: URI, token: CancellationToken): Promise<IChatSession>;
}

export type SessionOptionsChangedCallback = (sessionResource: URI, updates: ReadonlyArray<{
	optionId: string;
	value: string | IChatSessionProviderOptionItem;
}>) => Promise<void>;

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;

	// #region Chat session item provider support
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider>;
	readonly onDidChangeSessionItems: Event<string>;

	readonly onDidChangeAvailability: Event<void>;
	readonly onDidChangeInProgress: Event<void>;

	getChatSessionContribution(chatSessionType: string): IChatSessionsExtensionPoint | undefined;

	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable;
	activateChatSessionItemProvider(chatSessionType: string): Promise<IChatSessionItemProvider | undefined>;
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
	getSessionOption(sessionResource: URI, optionId: string): string | IChatSessionProviderOptionItem | undefined;
	setSessionOption(sessionResource: URI, optionId: string, value: string | IChatSessionProviderOptionItem): boolean;

	/**
	 * Fired when options for a chat session change.
	 */
	onDidChangeSessionOptions: Event<URI>;

	/**
	 * Get the capabilities for a specific session type
	 */
	getCapabilitiesForSessionType(chatSessionType: string): IChatAgentAttachmentCapabilities | undefined;

	getOptionGroupsForSessionType(chatSessionType: string): IChatSessionProviderOptionGroup[] | undefined;
	setOptionGroupsForSessionType(chatSessionType: string, handle: number, optionGroups?: IChatSessionProviderOptionGroup[]): void;
	setOptionsChangeCallback(callback: SessionOptionsChangedCallback): void;
	notifySessionOptionsChange(sessionResource: URI, updates: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem }>): Promise<void>;

	// Editable session support
	setEditableSession(sessionResource: URI, data: IEditableData | null): Promise<void>;
	getEditableData(sessionResource: URI): IEditableData | undefined;
	isEditable(sessionResource: URI): boolean;
	// #endregion
	registerChatModelChangeListeners(chatService: IChatService, chatSessionType: string, onChange: () => void): IDisposable;
	getSessionDescription(chatModel: IChatModel): string | undefined;
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');
