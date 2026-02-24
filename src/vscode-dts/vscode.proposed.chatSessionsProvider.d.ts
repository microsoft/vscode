/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 3

declare module 'vscode' {
	/**
	 * Represents the status of a chat session.
	 */
	export enum ChatSessionStatus {
		/**
		 * The chat session failed to complete.
		 */
		Failed = 0,

		/**
		 * The chat session completed successfully.
		 */
		Completed = 1,

		/**
		 * The chat session is currently in progress.
		 */
		InProgress = 2,

		/**
		 * The chat session needs user input (e.g. an unresolved confirmation).
		 */
		NeedsInput = 3
	}

	export namespace chat {
		/**
		 * Registers a new {@link ChatSessionItemProvider chat session item provider}.
		 *
		 * @deprecated Use {@linkcode createChatSessionItemController} instead.
		 *
		 * To use this, also make sure to also add `chatSessions` contribution in the `package.json`.
		 *
		 * @param chatSessionType The type of chat session the provider is for.
		 * @param provider The provider to register.
		 *
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerChatSessionItemProvider(chatSessionType: string, provider: ChatSessionItemProvider): Disposable;

		/**
		 * Creates a new {@link ChatSessionItemController chat session item controller} with the given unique identifier.
		 *
		 * To use this, also make sure to also add `chatSessions` contribution in the `package.json`.
		 *
		 * @param chatSessionType The type of chat session the provider is for.
		 * @param refreshHandler The controller's {@link ChatSessionItemController.refreshHandler refresh handler}.
		 *
		 * @returns A new controller instance that can be used to manage chat session items for the given chat session type.
		 */
		export function createChatSessionItemController(chatSessionType: string, refreshHandler: ChatSessionItemControllerRefreshHandler): ChatSessionItemController;
	}

	/**
	 * Provides a list of information about chat sessions.
	 *
	 * @deprecated Use {@linkcode ChatSessionItemController} instead.
	 */
	export interface ChatSessionItemProvider {
		/**
		 * Event that the provider can fire to signal that chat sessions have changed.
		 */
		readonly onDidChangeChatSessionItems: Event<void>;

		/**
		 * Provides a list of chat sessions.
		 */
		// TODO: Do we need a flag to try auth if needed?
		provideChatSessionItems(token: CancellationToken): ProviderResult<ChatSessionItem[]>;

		// #region Unstable parts of API

		/**
		 * Event that the provider can fire to signal that the current (original) chat session should be replaced with a new (modified) chat session.
		 * The UI can use this information to gracefully migrate the user to the new session.
		 */
		readonly onDidCommitChatSessionItem: Event<{ original: ChatSessionItem /** untitled */; modified: ChatSessionItem /** newly created */ }>;

		// #endregion
	}

	/**
	 * Extension callback invoked to refresh the collection of chat session items for a {@linkcode ChatSessionItemController}.
	 */
	export type ChatSessionItemControllerRefreshHandler = (token: CancellationToken) => Thenable<void>;

	export interface ChatSessionItemControllerNewItemHandlerContext {
		readonly request: ChatRequest;
	}

	/**
	 * Extension callback invoked when a new chat session is started.
	 */
	export type ChatSessionItemControllerNewItemHandler = (context: ChatSessionItemControllerNewItemHandlerContext, token: CancellationToken) => Thenable<ChatSessionItem>;

	/**
	 * Manages chat sessions for a specific chat session type
	 */
	export interface ChatSessionItemController {
		readonly id: string;

		/**
		 * Unregisters the controller, disposing of its associated chat session items.
		 */
		dispose(): void;

		/**
		 * Managed collection of chat session items
		 */
		readonly items: ChatSessionItemCollection;

		/**
		 * Creates a new managed chat session item that can be added to the collection.
		 */
		createChatSessionItem(resource: Uri, label: string): ChatSessionItem;

		/**
		 * Handler called to refresh the collection of chat session items.
		 *
		 * This is also called on first load to get the initial set of items.
		 */
		readonly refreshHandler: ChatSessionItemControllerRefreshHandler;

		/**
		 * Invoked when a new chat session is started.
		 *
		 * This allows the controller to initialize the chat session item with information from the initial request.
		 *
		 * The returned chat session is added to the collection and shown in the UI.
		 */
		newChatSessionItemHandler?: ChatSessionItemControllerNewItemHandler;

		/**
		 * Fired when an item's archived state changes.
		 */
		readonly onDidChangeChatSessionItemState: Event<ChatSessionItem>;
	}

	/**
	 * A collection of chat session items. It provides operations for managing and iterating over the items.
	 */
	export interface ChatSessionItemCollection extends Iterable<readonly [id: Uri, chatSessionItem: ChatSessionItem]> {
		/**
		 * Gets the number of items in the collection.
		 */
		readonly size: number;

		/**
		 * Replaces the items stored by the collection.
		 *
		 * @param items Items to store. If two items have the same resource URI, the last one will be used.
		 */
		replace(items: readonly ChatSessionItem[]): void;

		/**
		 * Iterate over each entry in this collection.
		 *
		 * @param callback Function to execute for each entry.
		 * @param thisArg The `this` context used when invoking the handler function.
		 */
		forEach(callback: (item: ChatSessionItem, collection: ChatSessionItemCollection) => unknown, thisArg?: any): void;

		/**
		 * Adds the chat session item to the collection. If an item with the same resource URI already
		 * exists, it'll be replaced.
		 *
		 * @param item Item to add.
		 */
		add(item: ChatSessionItem): void;

		/**
		 * Removes a single chat session item from the collection.
		 *
		 * @param resource Item resource to delete.
		 */
		delete(resource: Uri): void;

		/**
		 * Efficiently gets a chat session item by resource, if it exists, in the collection.
		 *
		 * @param resource Item resource to get.
		 *
		 * @returns The found item or undefined if it does not exist.
		 */
		get(resource: Uri): ChatSessionItem | undefined;
	}

	/**
	 * A chat session show in the UI.
	 *
	 * This should be created by calling a {@link ChatSessionItemController.createChatSessionItem createChatSessionItem}
	 * method on the controller. The item can then be added to the controller's {@link ChatSessionItemController.items items collection}
	 * to show it in the UI.
	 */
	export interface ChatSessionItem {
		/**
		 * The resource associated with the chat session.
		 *
		 * This is uniquely identifies the chat session and is used to open the chat session.
		 */
		readonly resource: Uri;

		/**
		 * Human readable name of the session shown in the UI
		 */
		label: string;

		/**
		 * An icon for the participant shown in UI.
		 */
		iconPath?: IconPath;

		/**
		 * An optional description that provides additional context about the chat session.
		 */
		description?: string | MarkdownString;

		/**
		 * An optional badge that provides additional context about the chat session.
		 */
		badge?: string | MarkdownString;

		/**
		 * An optional status indicating the current state of the session.
		 */
		status?: ChatSessionStatus;

		/**
		 * The tooltip text when you hover over this item.
		 */
		tooltip?: string | MarkdownString;

		/**
		 * Whether the chat session has been archived.
		 */
		archived?: boolean;

		/**
		 * Timing information for the chat session
		 */
		timing?: {
			/**
			 * Timestamp when the session was created in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
			 */
			readonly created: number;

			/**
			 * Timestamp when the most recent request started in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
			 *
			 * Should be undefined if no requests have been made yet.
			 */
			readonly lastRequestStarted?: number;

			/**
			 * Timestamp when the most recent request completed in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
			 *
			 * Should be undefined if the most recent request is still in progress or if no requests have been made yet.
			 */
			readonly lastRequestEnded?: number;

			/**
			 * Session start timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
			 * @deprecated Use `created` and `lastRequestStarted` instead.
			 */
			readonly startTime?: number;

			/**
			 * Session end timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
			 * @deprecated Use `lastRequestEnded` instead.
			 */
			readonly endTime?: number;
		};

		/**
		 * Statistics about the chat session.
		 */
		changes?: readonly ChatSessionChangedFile[] | readonly ChatSessionChangedFile2[];

		/**
		 * Arbitrary metadata for the chat session. Can be anything, but must be JSON-stringifyable.
		 *
		 * To update the metadata you must re-set this property.
		 */
		metadata?: { readonly [key: string]: any };
	}

	export class ChatSessionChangedFile {
		/**
		 * URI of the file.
		 */
		modifiedUri: Uri;

		/**
		 * File opened when the user takes the 'compare' action.
		 */
		originalUri?: Uri;

		/**
		 * Number of insertions made during the session.
		 */
		insertions: number;

		/**
		 * Number of deletions made during the session.
		 */
		deletions: number;

		constructor(modifiedUri: Uri, insertions: number, deletions: number, originalUri?: Uri);
	}

	export class ChatSessionChangedFile2 {
		/**
		 * URI of the file.
		 */
		readonly uri: Uri;

		/**
		 * URI of the original file. Undefined if the file was created.
		 */
		readonly originalUri: Uri | undefined;

		/**
		 * URI of the modified file. Undefined if the file was deleted.
		 */
		readonly modifiedUri: Uri | undefined;

		/**
		 * Number of insertions made during the session.
		 */
		insertions: number;

		/**
		 * Number of deletions made during the session.
		 */
		deletions: number;

		constructor(uri: Uri, originalUri: Uri | undefined, modifiedUri: Uri | undefined, insertions: number, deletions: number);
	}

	export interface ChatSession {
		/**
		 * An optional title for the chat session.
		 *
		 * When provided, this title is used as the display name for the session
		 * (e.g. in the editor tab). When not provided, the title defaults to
		 * the first user message in the session history.
		 */
		readonly title?: string;

		/**
		 * The full history of the session
		 *
		 * This should not include any currently active responses
		 */
		// TODO: Are these the right types to use?
		// TODO: link request + response to encourage correct usage?
		readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn2>;

		/**
		 * Options configured for this session as key-value pairs.
		 * Keys correspond to option group IDs (e.g., 'models', 'subagents').
		 * Values can be either:
		 * - A string (the option item ID) for backwards compatibility
		 * - A ChatSessionProviderOptionItem object to include metadata like locked state
		 * TODO: Strongly type the keys
		 */
		readonly options?: Record<string, string | ChatSessionProviderOptionItem>;

		/**
		 * Callback invoked by the editor for a currently running response. This allows the session to push items for the
		 * current response and stream these in as them come in. The current response will be considered complete once the
		 * callback resolved.
		 *
		 * If not provided, the chat session is assumed to not currently be running.
		 */
		readonly activeResponseCallback?: (stream: ChatResponseStream, token: CancellationToken) => Thenable<void>;

		/**
		 * Handles new request for the session.
		 *
		 * If not set, then the session will be considered read-only and no requests can be made.
		 */
		// TODO: Should we introduce our own type for `ChatRequestHandler` since not all field apply to chat sessions?
		// TODO: Revisit this to align with code.
		// TODO: pass in options?
		readonly requestHandler: ChatRequestHandler | undefined;
	}

	/**
	 * Event fired when chat session options change.
	 */
	export interface ChatSessionOptionChangeEvent {
		/**
		 * Identifier of the chat session being updated.
		 */
		readonly resource: Uri;
		/**
		 * Collection of option identifiers and their new values. Only the options that changed are included.
		 */
		readonly updates: ReadonlyArray<{
			/**
			 * Identifier of the option that changed (for example `model`).
			 */
			readonly optionId: string;

			/**
			 * The new value assigned to the option. When `undefined`, the option is cleared.
			 */
			readonly value: string | ChatSessionProviderOptionItem;
		}>;
	}

	/**
	 * Provides the content for a chat session rendered using the native chat UI.
	 */
	export interface ChatSessionContentProvider {
		/**
		 * Event that the provider can fire to signal that the options for a chat session have changed.
		 */
		readonly onDidChangeChatSessionOptions?: Event<ChatSessionOptionChangeEvent>;

		/**
		 * Event that the provider can fire to signal that the available provider options have changed.
		 *
		 * When fired, the editor will re-query {@link ChatSessionContentProvider.provideChatSessionProviderOptions}
		 * and update the UI to reflect the new option groups.
		 */
		readonly onDidChangeChatSessionProviderOptions?: Event<void>;

		/**
		 * Provides the chat session content for a given uri.
		 *
		 * The returned {@linkcode ChatSession} is used to populate the history of the chat UI.
		 *
		 * @param resource The URI of the chat session to resolve.
		 * @param token A cancellation token that can be used to cancel the operation.
		 *
		 * @return The {@link ChatSession chat session} associated with the given URI.
		 */
		provideChatSessionContent(resource: Uri, token: CancellationToken): Thenable<ChatSession> | ChatSession;

		/**
		 * @param resource Identifier of the chat session being updated.
		 * @param updates Collection of option identifiers and their new values. Only the options that changed are included.
		 * @param token A cancellation token that can be used to cancel the notification if the session is disposed.
		 */
		provideHandleOptionsChange?(resource: Uri, updates: ReadonlyArray<ChatSessionOptionUpdate>, token: CancellationToken): void;

		/**
		 * Called as soon as you register (call me once)
		 * @param token
		 */
		provideChatSessionProviderOptions?(token: CancellationToken): Thenable<ChatSessionProviderOptions | ChatSessionProviderOptions>;
	}

	export interface ChatSessionOptionUpdate {
		/**
		 * Identifier of the option that changed (for example `model`).
		 */
		readonly optionId: string;

		/**
		 * The new value assigned to the option. When `undefined`, the option is cleared.
		 */
		readonly value: string | undefined;
	}

	export namespace chat {
		/**
		 * Registers a new {@link ChatSessionContentProvider chat session content provider}.
		 *
		 * @param scheme The uri-scheme to register for. This must be unique.
		 * @param provider The provider to register.
		 *
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerChatSessionContentProvider(scheme: string, provider: ChatSessionContentProvider, chatParticipant: ChatParticipant, capabilities?: ChatSessionCapabilities): Disposable;
	}

	export interface ChatContext {
		readonly chatSessionContext?: ChatSessionContext;
	}

	export interface ChatSessionContext {
		readonly chatSessionItem: ChatSessionItem; // Maps to URI of chat session editor (could be 'untitled-1', etc..)

		/** @deprecated This will be removed along with the concept of `untitled-` sessions.  */
		readonly isUntitled: boolean;

		/**
		 * The initial option selections for the session, provided with the first request.
		 * Contains the options the user selected (or defaults) before the session was created.
		 */
		readonly initialSessionOptions?: ReadonlyArray<{ optionId: string; value: string | ChatSessionProviderOptionItem }>;
	}

	export interface ChatSessionCapabilities {
		/**
		 * Whether sessions can be interrupted and resumed without side-effects.
		 */
		supportsInterruptions?: boolean;
	}

	/**
	 * Represents a single selectable item within a provider option group.
	 */
	export interface ChatSessionProviderOptionItem {
		/**
		 * Unique identifier for the option item.
		 */
		readonly id: string;

		/**
		 * Human-readable name displayed in the UI.
		 */
		readonly name: string;

		/**
		 * Optional description shown in tooltips.
		 */
		readonly description?: string;

		/**
		 * When true, this option is locked and cannot be changed by the user.
		 * The option will still be visible in the UI but will be disabled.
		 * Use this when an option is set but cannot be hot-swapped (e.g., model already initialized).
		 */
		readonly locked?: boolean;

		/**
		 * An icon for the option item shown in UI.
		 */
		readonly icon?: ThemeIcon;

		/**
		 * Indicates if this option should be selected by default.
		 * Only one item per option group should be marked as default.
		 */
		readonly default?: boolean;
	}

	/**
	 * Represents a group of related provider options (e.g., models, sub-agents).
	 */
	export interface ChatSessionProviderOptionGroup {
		/**
		 * Unique identifier for the option group (e.g., "models", "subagents").
		 */
		readonly id: string;

		/**
		 * Human-readable name for the option group.
		 */
		readonly name: string;

		/**
		 * Optional description providing context about this option group.
		 */
		readonly description?: string;

		/**
		 * The selectable items within this option group.
		 */
		readonly items: ChatSessionProviderOptionItem[];

		/**
		 * A context key expression that controls when this option group picker is visible.
		 * When specified, the picker is only shown when the expression evaluates to true.
		 * The expression can reference other option group values via `chatSessionOption.<groupId>`.
		 *
		 * Example: `"chatSessionOption.models == 'gpt-4'"` - only show this picker when
		 * the 'models' option group has 'gpt-4' selected.
		 */
		readonly when?: string;

		/**
		 * When true, displays a searchable QuickPick with a "See more..." option.
		 * Recommended for option groups with additional async items (e.g., repositories).
		 */
		readonly searchable?: boolean;

		/**
		 * An icon for the option group shown in UI.
		 */
		readonly icon?: ThemeIcon;

		/**
		 * Handler for dynamic search when `searchable` is true.
		 * Called when the user types in the searchable QuickPick or clicks "See more..." to load additional items.
		 *
		 * @param query The search query entered by the user. Empty string for initial load.
		 * @param token A cancellation token.
		 * @returns Additional items to display in the searchable QuickPick.
		 */
		readonly onSearch?: (query: string, token: CancellationToken) => Thenable<ChatSessionProviderOptionItem[]>;

		/**
		 * Optional commands.
		 *
		 * These commands will be displayed at the bottom of the group.
		 */
		readonly commands?: Command[];
	}

	export interface ChatSessionProviderOptions {
		/**
		 * Provider-defined option groups (0-2 groups supported).
		 * Examples: models picker, sub-agents picker, etc.
		 */
		optionGroups?: ChatSessionProviderOptionGroup[];
	}
}
