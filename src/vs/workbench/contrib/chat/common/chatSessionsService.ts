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
import { IChatProgress, IChatSessionTiming } from './chatService/chatService.js';
import { Target } from './promptSyntax/promptTypes.js';

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
	readonly isReadOnly?: boolean;
	/**
	 * When set, the chat session will show a filtered mode picker with custom agents
	 * that have a matching `target` property. This enables contributed chat sessions
	 * to reuse the standard agent/mode dropdown with filtered custom agents.
	 * Custom agents without a `target` property are also shown in all filtered lists
	 */
	readonly customAgentTarget?: Target;
	readonly requiresCustomModels?: boolean;
	/**
	 * When false, the delegation picker is hidden for this session type.
	 * Defaults to true.
	 */
	readonly supportsDelegation?: boolean;
	/**
	 * Decides whether to automatically attach instruction files to chat requests
	 * for this session type. Defaults to false when not specified.
	 */
	readonly autoAttachReferences?: boolean;
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
	modelId?: string;
} | {
	type: 'response';
	parts: IChatProgress[];
	participant: string;
};

export type IChatSessionRequestHistoryItem = Extract<IChatSessionHistoryItem, { type: 'request' }>;

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

	readonly title?: string;

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

	/**
	 * Forks the session from the given request point.
	 * @param request The request history item to fork from, or undefined to fork from the end.
	 * @param token Cancellation token.
	 * @returns The forked session item. The promise is rejected if forking fails.
	 */
	forkSession?: (request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => Promise<IChatSessionItem>;
}

export interface IChatSessionContentProvider {
	provideChatSessionContent(sessionResource: URI, token: CancellationToken): Promise<IChatSession>;
}

export interface IChatNewSessionRequest {
	readonly prompt: string;
	readonly command?: string;

	readonly initialSessionOptions?: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem }>;
}

export interface IChatSessionItemsDelta {
	readonly addedOrUpdated?: readonly IChatSessionItem[];
	readonly removed?: readonly URI[];
}

export interface IChatSessionItemController {

	readonly onDidChangeChatSessionItems: Event<IChatSessionItemsDelta>;

	get items(): readonly IChatSessionItem[];

	refresh(token: CancellationToken): Promise<void>;

	newChatSessionItem?(request: IChatNewSessionRequest, token: CancellationToken): Promise<IChatSessionItem | undefined>;
}

/**
 * Event fired when session options need to be sent to the extension.
 * Extends IWaitUntil to allow listeners to register async work that will be awaited.
 */
export interface IChatSessionOptionsWillNotifyExtensionEvent extends IWaitUntil {
	readonly sessionResource: URI;
	readonly updates: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem }>;
}

export type ResolvedChatSessionsExtensionPoint = Omit<IChatSessionsExtensionPoint, 'icon'> & {
	readonly icon: ThemeIcon | URI | undefined;
};

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;

	// #region Chat session item provider support
	readonly onDidChangeItemsProviders: Event<{ readonly chatSessionType: string }>;
	readonly onDidChangeSessionItems: Event<IChatSessionItemsDelta>;

	readonly onDidChangeAvailability: Event<void>;
	readonly onDidChangeInProgress: Event<void>;

	getChatSessionContribution(chatSessionType: string): ResolvedChatSessionsExtensionPoint | undefined;
	getAllChatSessionContributions(): ResolvedChatSessionsExtensionPoint[];

	/**
	 * Programmatically register a chat session contribution (for internal session types
	 * that don't go through the extension point).
	 */
	registerChatSessionContribution(contribution: IChatSessionsExtensionPoint): IDisposable;

	registerChatSessionItemController(chatSessionType: string, controller: IChatSessionItemController): IDisposable;
	getRegisteredChatSessionItemProviders(): readonly string[];
	activateChatSessionItemProvider(chatSessionType: string): Promise<void>;

	/**
	 * Get the list of current chat session items grouped by session type.
	 *
	 * @param providerTypeFilter If specified, only returns items from the given providers. If undefined, returns items from all providers.
	 *
	 * @returns An async iterable that produces the list of session items for each provider. The order is not guaranteed. Some provider may take a long time to resolve.
	 */
	getChatSessionItems(providerTypeFilter: readonly string[] | undefined, token: CancellationToken): AsyncIterable<{ readonly chatSessionType: string; readonly items: readonly IChatSessionItem[] }>;

	/**
	 * Forces the controllers to refresh their session items, optionally filtered by provider type.
	 */
	refreshChatSessionItems(providerTypeFilter: readonly string[] | undefined, token: CancellationToken): Promise<void>;

	reportInProgress(chatSessionType: string, count: number): void;
	getInProgress(): { displayName: string; count: number }[];

	// #endregion

	// #region Content provider support
	readonly onDidChangeContentProviderSchemes: Event<{ readonly added: string[]; readonly removed: string[] }>;

	getContentProviderSchemes(): string[];

	registerChatSessionContentProvider(scheme: string, provider: IChatSessionContentProvider): IDisposable;
	canResolveChatSession(sessionType: string): Promise<boolean>;
	getOrCreateChatSession(sessionResource: URI, token: CancellationToken): Promise<IChatSession>;

	hasAnySessionOptions(sessionResource: URI): boolean;
	getSessionOptions(sessionResource: URI): Map<string, string> | undefined;
	getSessionOption(sessionResource: URI, optionId: string): string | IChatSessionProviderOptionItem | undefined;
	setSessionOption(sessionResource: URI, optionId: string, value: string | IChatSessionProviderOptionItem): boolean;

	/**
	 * Fired when options for a chat session change.
	 */
	readonly onDidChangeSessionOptions: Event<URI>;

	/**
	 * Get the capabilities for a specific session type
	 */
	getCapabilitiesForSessionType(chatSessionType: string): IChatAgentAttachmentCapabilities | undefined;

	/**
	 * Get the customAgentTarget for a specific session type.
	 * When the Target is not `Target.Undefined`, the mode picker should show filtered custom agents matching this target.
	 */
	getCustomAgentTargetForSessionType(chatSessionType: string): Target;

	/**
	 * Returns whether the session type requires custom models. When true, the model picker should show filtered custom models.
	 */
	requiresCustomModelsForSessionType(chatSessionType: string): boolean;

	/**
	 * Returns whether the session type supports delegation.
	 * Defaults to true when not explicitly set.
	 */
	supportsDelegationForSessionType(chatSessionType: string): boolean;

	/**
	 * Returns whether the loaded session supports forking conversations.
	 */
	sessionSupportsFork(sessionResource: URI): boolean;

	/**
	 * Forks a contributed chat session from the given request point.
	 * @param sessionResource The session resource to fork.
	 * @param request The request history item to fork from, or undefined to fork from the end.
	 * @param token Cancellation token.
	 * @returns The forked session item, or undefined if forking failed.
	 */
	forkChatSession(sessionResource: URI, request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken): Promise<IChatSessionItem>;

	readonly onDidChangeOptionGroups: Event<string>;

	getOptionGroupsForSessionType(chatSessionType: string): IChatSessionProviderOptionGroup[] | undefined;
	setOptionGroupsForSessionType(chatSessionType: string, handle: number, optionGroups?: IChatSessionProviderOptionGroup[]): void;

	getNewSessionOptionsForSessionType(chatSessionType: string): Record<string, string | IChatSessionProviderOptionItem> | undefined;
	setNewSessionOptionsForSessionType(chatSessionType: string, options: Record<string, string | IChatSessionProviderOptionItem>): void;
	/**
	 * Event fired when session options change and need to be sent to the extension.
	 * MainThreadChatSessions subscribes to this to forward changes to the extension host.
	 * Uses IWaitUntil pattern to allow listeners to register async work.
	 */
	readonly onRequestNotifyExtension: Event<IChatSessionOptionsWillNotifyExtensionEvent>;
	notifySessionOptionsChange(sessionResource: URI, updates: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem }>): Promise<void>;

	getInProgressSessionDescription(chatModel: IChatModel): string | undefined;

	/**
	 * Creates a new chat session item using the controller's newChatSessionItemHandler.
	 * Returns undefined if the controller doesn't have a handler or if no controller is registered.
	 */
	createNewChatSessionItem(chatSessionType: string, request: IChatNewSessionRequest, token: CancellationToken): Promise<IChatSessionItem | undefined>;

	/**
	 * Registers an alias so that session-option lookups by the real resource
	 * are redirected to the canonical (untitled) resource in the internal session map.
	 */
	registerSessionResourceAlias(untitledResource: URI, realResource: URI): void;
}

export function isSessionInProgressStatus(state: ChatSessionStatus): boolean {
	return state === ChatSessionStatus.InProgress || state === ChatSessionStatus.NeedsInput;
}

export function isIChatSessionFileChange2(obj: unknown): obj is IChatSessionFileChange2 {
	const candidate = obj as IChatSessionFileChange2;
	return candidate && candidate.uri instanceof URI && typeof candidate.insertions === 'number' && typeof candidate.deletions === 'number';
}
