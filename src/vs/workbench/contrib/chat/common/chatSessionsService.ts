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
import { IPosition } from '../../../../editor/common/core/position.js';
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
	readonly slashCommand?: string;
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
	/**
	 * Optional kind hint that controls how the group is presented.
	 * - `'permissions'`: the group's items are surfaced inside the chat permission picker
	 *   instead of being rendered as a standalone picker. At most one group per provider
	 *   may use this kind; if multiple are declared, the first one (in declaration order)
	 *   wins. The group has no UI of its own — it is invisible when the permission
	 *   picker is hidden by its own `when` clauses.
	 */
	readonly kind?: 'permissions';
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
	details?: string;
};

export type IChatSessionRequestHistoryItem = Extract<IChatSessionHistoryItem, { type: 'request' }>;


/**
 * A set of well-known session types
 */
export namespace SessionType {
	export const CopilotCLI = 'copilotcli';
	export const CopilotCloud = 'copilot-cloud-agent';
	export const Local = 'local';
	export const ClaudeCode = 'claude-code';
	export const Codex = 'openai-codex';
	export const Growth = 'copilot-growth';
	export const AgentHostCopilot = 'agent-host-copilot';
}

/**
 * Returns whether the given session type is an agent host target.
 * Matches the local agent host (`agent-host-*`) and remote agent hosts (`remote-*`).
 *
 * Note: The `remote-` prefix convention is established by
 * `RemoteAgentHostContribution` which generates session types as
 * `remote-{sanitizedAddress}-{provider}`. If future remote providers that
 * are NOT agent hosts need a different prefix, this function must be updated.
 */
export function isAgentHostTarget(target: string): boolean {
	return target === SessionType.AgentHostCopilot ||
		target.startsWith('agent-host-') ||
		target.startsWith('remote-');
}

/**
 * The session type used for local agent chat sessions.
 */
export const localChatSessionType = SessionType.Local;

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

	/**
	 * Optional. Compute completion items for an input being composed in this
	 * session. Returning `undefined` lets the workbench fall back to its
	 * default in-process completion providers.
	 */
	provideChatInputCompletions?(sessionResource: URI, params: IChatInputCompletionsParams, token: CancellationToken): Promise<IChatInputCompletionsResult | undefined>;

	/**
	 * Optional. Trigger characters that, when typed in the chat input,
	 * SHOULD cause the workbench to issue a `provideChatInputCompletions`
	 * request. Used to register a Monaco completion provider scoped to
	 * sessions handled by this content provider.
	 */
	provideChatInputCompletionTriggerCharacters?(): Promise<readonly string[]>;
}

/**
 * Inputs for {@link IChatSessionContentProvider.provideChatInputCompletions}
 * and {@link IChatSessionsService.provideChatInputCompletions}.
 */
export interface IChatInputCompletionsParams {
	/**
	 * The complete text of the input being completed (e.g. the user message
	 * the user is currently composing).
	 */
	readonly text: string;
	/**
	 * The character offset within {@link text} at which the completion is
	 * requested, measured in UTF-16 code units. MUST satisfy
	 * `0 <= offset <= text.length`.
	 */
	readonly offset: number;
}

/**
 * A neutral completion-item shape returned by
 * {@link IChatSessionContentProvider.provideChatInputCompletions}. The
 * workbench-side completion glue maps these into Monaco completion items
 * and the corresponding chat-input attachment.
 */
export interface IChatInputCompletionItem {
	/** Text inserted into the input when this item is accepted. */
	readonly insertText: string;
	/**
	 * Half-open range `[start, end)` in the *current* input text that
	 * {@link insertText} replaces. Positions use 1-based `lineNumber` and
	 * `column` to match Monaco. When omitted, the workbench replaces the
	 * word at the cursor.
	 */
	readonly start?: IPosition;
	readonly end?: IPosition;
	/** Attachment associated with the item. */
	readonly attachment: IChatInputCompletionAttachment;
}

/**
 * Resource attachment associated with a completion item. The workbench
 * adds it to the input's variable model when the item is accepted.
 */
export interface IChatInputCompletionAttachment {
	readonly kind: 'resource';
	readonly uri: URI;
	readonly displayName?: string;
	readonly isDirectory?: boolean;
	/**
	 * Implementation-defined metadata that MUST be preserved by the
	 * workbench when the accepted completion is sent back as part of a
	 * user message attachment.
	 */
	readonly _meta?: Record<string, unknown>;
}

/**
 * Result of {@link IChatSessionContentProvider.provideChatInputCompletions}.
 */
export interface IChatInputCompletionsResult {
	readonly items: readonly IChatInputCompletionItem[];
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

	resolveChatSessionItem?(resource: URI, token: CancellationToken): Promise<IChatSessionItem | undefined>;
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

	/**
	 * Lazily resolves a chat session item, filling in expensive details like timing, changes, and badge.
	 * Returns the resolved item, or undefined if no resolve handler is available.
	 */
	resolveChatSessionItem(chatSessionType: string, resource: URI, token: CancellationToken): Promise<IChatSessionItem | undefined>;

	// #endregion

	// #region Content provider support
	readonly onDidChangeContentProviderSchemes: Event<{ readonly added: string[]; readonly removed: string[] }>;

	getContentProviderSchemes(): string[];

	registerChatSessionContentProvider(scheme: string, provider: IChatSessionContentProvider): IDisposable;
	canResolveChatSession(sessionType: string): Promise<boolean>;
	getOrCreateChatSession(sessionResource: URI, token: CancellationToken): Promise<IChatSession>;

	/**
	 * Compute completion items for an input being composed in the chat
	 * session identified by `sessionResource`. Delegates to the registered
	 * {@link IChatSessionContentProvider} for the session, if it implements
	 * {@link IChatSessionContentProvider.provideChatInputCompletions}.
	 * Returns `undefined` when no provider is available, in which case the
	 * workbench's default in-process providers should be used.
	 */
	provideChatInputCompletions(sessionResource: URI, params: IChatInputCompletionsParams, token: CancellationToken): Promise<IChatInputCompletionsResult | undefined>;

	/**
	 * Trigger characters announced by the content provider for the given
	 * session type. Used to dynamically register Monaco completion
	 * providers per content-provider scheme. Returns `undefined` when the
	 * scheme has no content provider, or `[]` when the provider does not
	 * announce any trigger characters.
	 */
	getChatInputCompletionTriggerCharacters(sessionType: string): Promise<readonly string[] | undefined>;

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
