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
		InProgress = 2
	}

	/**
	 * Provides a list of information about chat sessions.
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

		/**
		 * DEPRECATED: Will be removed!
		 * Creates a new chat session.
		 *
		 * @param options Options for the new session including an optional initial prompt and history
		 * @param token A cancellation token
		 * @returns Metadata for the chat session
		 */
		provideNewChatSessionItem?(options: {
			/**
			 * The chat request that initiated the session creation
			 */
			readonly request: ChatRequest;

			/**
			 * Additional metadata to use for session creation
			 */
			metadata?: any;
		}, token: CancellationToken): ProviderResult<ChatSessionItem>;

		// #endregion
	}

	export interface ChatSessionItem {
		/**
		 * The resource associated with the chat session.
		 *
		 * This is uniquely identifies the chat session and is used to open the chat session.
		 */
		resource: Uri;

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
		 * The times at which session started and ended
		 */
		timing?: {
			/**
			 * Session start timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
			 */
			startTime: number;
			/**
			 * Session end timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
			 */
			endTime?: number;
		};

		/**
		 * Statistics about the chat session.
		 */
		changes?: readonly ChatSessionChangedFile[] | {
			/**
			 * Number of files edited during the session.
			 */
			files: number;

			/**
			 * Number of insertions made during the session.
			 */
			insertions: number;

			/**
			 * Number of deletions made during the session.
			 */
			deletions: number;
		};
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

	export interface ChatSession {
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
		provideChatSessionProviderOptions?(token: CancellationToken): Thenable<ChatSessionProviderOptions> | ChatSessionProviderOptions;
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
		 * Registers a new {@link ChatSessionItemProvider chat session item provider}.
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
		readonly isUntitled: boolean;
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
	}

	export interface ChatSessionProviderOptions {
		/**
		 * Provider-defined option groups (0-2 groups supported).
		 * Examples: models picker, sub-agents picker, etc.
		 */
		optionGroups?: ChatSessionProviderOptionGroup[];
	}
}
