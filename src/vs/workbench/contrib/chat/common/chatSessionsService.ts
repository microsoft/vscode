/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event, IWaitUntil } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatAgentAttachmentCapabilities, IChatAgentRequest } from './participants/chatAgents.js';
import { IChatEditingSession } from './editing/chatEditingService.js';
import { IChatModel, IChatRequestVariableData, ISerializableChatModelInputState } from './model/chatModel.js';
import { IChatProgress, IChatService, IChatSessionTiming } from './chatService/chatService.js';

export const enum ChatSessionStatus {
	Failed = 0,
	Completed = 1,
	InProgress = 2,
	NeedsInput = 3
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
	default?: boolean;
	// [key: string]: any;
}

export interface IChatSessionProviderOptionGroupCommand {
	command: string;
	title: string;
	tooltip?: string;
	arguments?: unknown[];
}

export interface IChatSessionProviderOptionGroup {
	id: string;
	name: string;
	description?: string;
	items: IChatSessionProviderOptionItem[];
	searchable?: boolean;
	onSearch?: (query: string, token: CancellationToken) => Thenable<IChatSessionProviderOptionItem[]>;
	/**
	 * A context key expression that controls visibility of this option group picker.
	 * When specified, the picker is only visible when the expression evaluates to true.
	 * The expression can reference other option group values via `chatSessionOption.<groupId>`.
	 * Example: `"chatSessionOption.models == 'gpt-4'"`
	 */
	when?: string;
	icon?: ThemeIcon;
	/**
	 * Custom commands to show in the option group's picker UI.
	 * These will be shown in a separate section at the end of the picker.
	 */
	commands?: IChatSessionProviderOptionGroupCommand[];
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
	/**
	 * When set, the chat session will show a filtered mode picker with custom agents
	 * that have a matching `target` property. This enables contributed chat sessions
	 * to reuse the standard agent/mode dropdown with filtered custom agents.
	 * Custom agents without a `target` property are also shown in all filtered lists
	 */
	readonly customAgentTarget?: string;
}

export interface IChatSessionItem {
	resource: URI;
	label: string;
	iconPath?: ThemeIcon;
	badge?: string | IMarkdownString;
	description?: string | IMarkdownString;
	status?: ChatSessionStatus;
	tooltip?: string | IMarkdownString;
	timing: IChatSessionTiming;
	changes?: {
		files: number;
		insertions: number;
		deletions: number;
	} | readonly IChatSessionFileChange[] | readonly IChatSessionFileChange2[];
	archived?: boolean;
	metadata?: { readonly [key: string]: unknown };
}

export interface IChatSessionFileChange {
	modifiedUri: URI;
	originalUri?: URI;
	insertions: number;
	deletions: number;
}

export interface IChatSessionFileChange2 {
	readonly uri: URI;
	readonly originalUri?: URI;
	readonly modifiedUri?: URI;
	readonly insertions: number;
	readonly deletions: number;
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

/**
 * The option ID used for selecting the agent in chat sessions.
 */
export const agentOptionId = 'agent';

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
	transferredState?: {
		editingSession: IChatEditingSession | undefined;
		inputState: ISerializableChatModelInputState | undefined;
	};

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
}

export interface IChatSessionContentProvider {
	provideChatSessionContent(sessionResource: URI, token: CancellationToken): Promise<IChatSession>;
}

/**
 * Event fired when session options need to be sent to the extension.
 * Extends IWaitUntil to allow listeners to register async work that will be awaited.
 */
export interface IChatSessionOptionsWillNotifyExtensionEvent extends IWaitUntil {
	readonly sessionResource: URI;
	readonly updates: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem }>;
}

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;

	// #region Chat session item provider support
	readonly onDidChangeItemsProviders: Event<{ readonly chatSessionType: string }>;
	readonly onDidChangeSessionItems: Event<{ readonly chatSessionType: string }>;

	readonly onDidChangeAvailability: Event<void>;
	readonly onDidChangeInProgress: Event<void>;

	getChatSessionContribution(chatSessionType: string): IChatSessionsExtensionPoint | undefined;

	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable;
	activateChatSessionItemProvider(chatSessionType: string): Promise<void>;

	getAllChatSessionContributions(): IChatSessionsExtensionPoint[];
	getIconForSessionType(chatSessionType: string): ThemeIcon | URI | undefined;
	getWelcomeTitleForSessionType(chatSessionType: string): string | undefined;
	getWelcomeMessageForSessionType(chatSessionType: string): string | undefined;
	getInputPlaceholderForSessionType(chatSessionType: string): string | undefined;

	/**
	 * Get the list of chat session items grouped by session type.
	 * @param providerTypeFilter If specified, only returns items from the given providers. If undefined, returns items from all providers.
	 */
	getChatSessionItems(providerTypeFilter: readonly string[] | undefined, token: CancellationToken): Promise<Array<{ readonly chatSessionType: string; readonly items: readonly IChatSessionItem[] }>>;

	reportInProgress(chatSessionType: string, count: number): void;
	getInProgress(): { displayName: string; count: number }[];

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

	/**
	 * Get the customAgentTarget for a specific session type.
	 * When set, the mode picker should show filtered custom agents matching this target.
	 */
	getCustomAgentTargetForSessionType(chatSessionType: string): string | undefined;

	onDidChangeOptionGroups: Event<string>;

	getOptionGroupsForSessionType(chatSessionType: string): IChatSessionProviderOptionGroup[] | undefined;
	setOptionGroupsForSessionType(chatSessionType: string, handle: number, optionGroups?: IChatSessionProviderOptionGroup[]): void;
	/**
	 * Event fired when session options change and need to be sent to the extension.
	 * MainThreadChatSessions subscribes to this to forward changes to the extension host.
	 * Uses IWaitUntil pattern to allow listeners to register async work.
	 */
	readonly onRequestNotifyExtension: Event<IChatSessionOptionsWillNotifyExtensionEvent>;
	notifySessionOptionsChange(sessionResource: URI, updates: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem }>): Promise<void>;

	registerChatModelChangeListeners(chatService: IChatService, chatSessionType: string, onChange: () => void): IDisposable;
	getInProgressSessionDescription(chatModel: IChatModel): string | undefined;
}

export function isSessionInProgressStatus(state: ChatSessionStatus): boolean {
	return state === ChatSessionStatus.InProgress || state === ChatSessionStatus.NeedsInput;
}

export function isIChatSessionFileChange2(obj: unknown): obj is IChatSessionFileChange2 {
	const candidate = obj as IChatSessionFileChange2;
	return candidate && candidate.uri instanceof URI && typeof candidate.insertions === 'number' && typeof candidate.deletions === 'number';
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');
