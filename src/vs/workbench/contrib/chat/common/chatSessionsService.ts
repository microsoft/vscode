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
import { IChatAgentAttachmentCapabilities, IChatAgentRequest } from './participants/chatAgents.js';
import { IChatEditingSession } from './editing/chatEditingService.js';
import { IChatRequestModeInstructions, IChatRequestVariableData, ISerializableChatModelInputState } from './model/chatModel.js';
import { IChatProgress, IChatSessionTiming } from './chatService/chatService.js';
import { Target } from './promptSyntax/promptTypes.js';

export const enum ChatSessionStatus {
	Failed = 0,
	Completed = 1,
	InProgress = 2,
	NeedsInput = 3
}

export interface IChatSessionCommandContribution {
	readonly name: string;
	readonly description: string;
	readonly when?: string;
}

export interface IChatSessionProviderOptionItem {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly detail?: string;
	readonly locked?: boolean;
	readonly icon?: ThemeIcon;
	readonly default?: boolean;
	// [key: string]: any;
}

export interface IChatSessionProviderOptionGroupCommand {
	readonly command: string;
	readonly title: string;
	readonly tooltip?: string;
	readonly arguments?: readonly unknown[];
}

export interface IChatSessionProviderOptionGroup {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly detail?: string;
	readonly selected?: IChatSessionProviderOptionItem;
	readonly items: readonly IChatSessionProviderOptionItem[];
	/**
	 * A context key expression that controls visibility of this option group picker.
	 * When specified, the picker is only visible when the expression evaluates to true.
	 * The expression can reference other option group values via `chatSessionOption.<groupId>`.
	 * Example: `"chatSessionOption.models == 'gpt-4'"`
	 */
	readonly when?: string;
	readonly icon?: ThemeIcon;
	/**
	 * Custom commands to show in the option group's picker UI.
	 * These will be shown in a separate section at the end of the picker.
	 */
	readonly commands?: readonly IChatSessionProviderOptionGroupCommand[];
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
	readonly resource: URI;
	readonly label: string;
	readonly iconPath?: ThemeIcon;
	readonly badge?: string | IMarkdownString;
	readonly description?: string | IMarkdownString;
	readonly status?: ChatSessionStatus;
	readonly tooltip?: string | IMarkdownString;
	readonly timing: IChatSessionTiming;
	readonly changes?: {
		readonly files: number;
		readonly insertions: number;
		readonly deletions: number;
	} | readonly IChatSessionFileChange[] | readonly IChatSessionFileChange2[];
	readonly archived?: boolean;
	readonly metadata?: { readonly [key: string]: unknown };
}

export interface IChatSessionFileChange {
	readonly modifiedUri: URI;
	readonly originalUri?: URI;
	readonly insertions: number;
	readonly deletions: number;
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
	modeInstructions?: IChatRequestModeInstructions;
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

export interface IChatSession extends IDisposable {
	readonly onWillDispose: Event<void>;

	readonly sessionResource: URI;

	readonly title?: string;

	readonly history: readonly IChatSessionHistoryItem[];


	readonly options?: ReadonlyChatSessionOptionsMap;

	readonly progressObs?: IObservable<IChatProgress[]>;
	readonly isCompleteObs?: IObservable<boolean>;
	readonly interruptActiveResponseCallback?: () => Promise<boolean>;

	/**
	 * Event fired when the server initiates a new request (e.g. from a consumed
	 * queued message). The consumer should create a new request+response pair in
	 * the model and prepare to receive progress via {@link progressObs}.
	 */
	readonly onDidStartServerRequest?: Event<{ prompt: string }>;

	/**
	 * Editing session transferred from a previously-untitled chat session in `onDidCommitChatSessionItem`.
	 */
	transferredState?: {
		readonly editingSession: IChatEditingSession | undefined;
		readonly inputState: ISerializableChatModelInputState | undefined;
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

	readonly initialSessionOptions?: ReadonlyChatSessionOptionsMap;
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

	getNewChatSessionInputState?(sessionResource: URI, token: CancellationToken): Promise<readonly IChatSessionProviderOptionGroup[] | undefined>;
}

export interface IChatSessionOptionsChangeEvent {
	readonly sessionResource: URI;
	readonly updates: ReadonlyMap<string, string | IChatSessionProviderOptionItem | undefined>;
}

export type ResolvedChatSessionsExtensionPoint = Omit<IChatSessionsExtensionPoint, 'icon'> & {
	readonly icon: ThemeIcon | URI | undefined;
};

/**
 * Session options as key-value pairs.
 *
 * Keys correspond to option group IDs (e.g., 'models', 'subagents') and values are either the selected option item IDs (string) or full option items (for locked state).
 */
export type ChatSessionOptionsMap = Map<string, string | IChatSessionProviderOptionItem>;

export namespace ChatSessionOptionsMap {
	export function fromRecord(obj: { [key: string]: string | IChatSessionProviderOptionItem }): ChatSessionOptionsMap {
		return new Map(Object.entries(obj));
	}

	export function toRecord(map: ReadonlyChatSessionOptionsMap): Record<string, string | IChatSessionProviderOptionItem> {
		const record: Record<string, string | IChatSessionProviderOptionItem> = Object.create(null);
		const entries = ensureIterable(map);
		for (const [key, value] of entries) {
			record[key] = value;
		}
		return record;
	}

	export function toStrValueArray(map: ReadonlyChatSessionOptionsMap | undefined): Array<{ optionId: string; value: string }> | undefined {
		if (!map) {
			return undefined;
		}
		const entries = ensureIterable(map);
		return Array.from(entries, ([optionId, value]) => ({ optionId, value: typeof value === 'string' ? value : value.id }));
	}

	/**
	 * Ensures the input is iterable. If a plain object is passed (e.g. due to
	 * serialization across process boundaries losing the Map prototype), it is
	 * converted to Map entries on the fly.
	 */
	function ensureIterable(map: ReadonlyChatSessionOptionsMap): Iterable<[string, string | IChatSessionProviderOptionItem]> {
		if (map instanceof Map) {
			return map;
		}
		// Fallback: treat as a plain record (e.g. from JSON deserialization)
		return Object.entries(map as unknown as Record<string, string | IChatSessionProviderOptionItem>);
	}
}

/**
 * Readonly version of {@link ChatSessionOptionsMap}
 */
export type ReadonlyChatSessionOptionsMap = ReadonlyMap<string, string | IChatSessionProviderOptionItem>;

export interface IChatSessionCustomizationItem {
	readonly label: string;
	readonly description?: string;
	readonly uri: URI;
	readonly storageLocation: number;
	readonly icon?: ThemeIcon;
}

export interface IChatSessionCustomizationItemGroup {
	readonly id: string;
	readonly items: IChatSessionCustomizationItem[];
	readonly commands?: readonly { readonly id: string; readonly title: string; readonly arguments?: readonly unknown[] }[];
	readonly itemCommands?: readonly { readonly id: string; readonly title: string; readonly arguments?: readonly unknown[] }[];
}

export interface IChatSessionCustomizationsProvider {
	readonly onDidChangeCustomizations: Event<void>;
	provideCustomizations(token: CancellationToken): Promise<IChatSessionCustomizationItemGroup[] | undefined>;
}


export interface IChatSessionCommitEvent {
	/** The original (untitled) session resource. */
	readonly original: URI;
	/** The committed (real) session resource. */
	readonly committed: URI;
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;

	// #region Chat session item provider support
	readonly onDidChangeItemsProviders: Event<{ readonly chatSessionType: string }>;
	readonly onDidChangeSessionItems: Event<IChatSessionItemsDelta>;

	/**
	 * Fired when an untitled session is committed (URI swapped to a real resource)
	 * after the first turn completes.
	 */
	readonly onDidCommitSession: Event<IChatSessionCommitEvent>;

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

	/** @deprecated Use `getChatSessionItems` */
	getInProgress(): { chatSessionType: string; count: number }[];

	// #endregion

	// #region Content provider support
	readonly onDidChangeContentProviderSchemes: Event<{ readonly added: string[]; readonly removed: string[] }>;

	getContentProviderSchemes(): string[];

	registerChatSessionContentProvider(scheme: string, provider: IChatSessionContentProvider): IDisposable;
	canResolveChatSession(sessionType: string): Promise<boolean>;
	getOrCreateChatSession(sessionResource: URI, token: CancellationToken): Promise<IChatSession>;

	getSessionOptions(sessionResource: URI): ReadonlyChatSessionOptionsMap | undefined;
	getSessionOption(sessionResource: URI, optionId: string): string | IChatSessionProviderOptionItem | undefined;
	setSessionOption(sessionResource: URI, optionId: string, value: string | IChatSessionProviderOptionItem): boolean;
	updateSessionOptions(sessionResource: URI, updates: ReadonlyChatSessionOptionsMap): boolean;

	/**
	 * Fired when options for a chat session change.
	 */
	readonly onDidChangeSessionOptions: Event<IChatSessionOptionsChangeEvent>;

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
	setOptionGroupsForSessionType(chatSessionType: string, handle: number, optionGroups?: readonly IChatSessionProviderOptionGroup[]): void;

	/**
	 * Get the default options for new sessions of this type, derived from option groups'
	 * `selected` or `default` items.
	 */
	getNewChatSessionInputState(chatSessionType: string, sessionResource: URI): Promise<readonly IChatSessionProviderOptionGroup[] | undefined>;

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

	/**
	 * Fires {@link onDidCommitSession} to notify listeners that an untitled
	 * session has been committed with a real resource URI.
	 */
	fireSessionCommitted(original: URI, committed: URI): void;

	// #region Customizations provider support
	readonly onDidChangeCustomizations: Event<{ readonly chatSessionType: string }>;
	registerCustomizationsProvider(chatSessionType: string, provider: IChatSessionCustomizationsProvider): IDisposable;
	hasCustomizationsProvider(chatSessionType: string): boolean;
	getCustomizations(chatSessionType: string, token: CancellationToken): Promise<IChatSessionCustomizationItemGroup[] | undefined>;
	// #endregion
}

export function isSessionInProgressStatus(state: ChatSessionStatus): boolean {
	return state === ChatSessionStatus.InProgress || state === ChatSessionStatus.NeedsInput;
}

export function isIChatSessionFileChange2(obj: unknown): obj is IChatSessionFileChange2 {
	const candidate = obj as IChatSessionFileChange2;
	return candidate && candidate.uri instanceof URI && typeof candidate.insertions === 'number' && typeof candidate.deletions === 'number';
}
