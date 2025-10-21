/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 2

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

		/**
		 * Provides a list of chat sessions.
		 */
		// TODO: Do we need a flag to try auth if needed?
		provideChatSessionItems(token: CancellationToken): ProviderResult<ChatSessionItem[]>;
	}

	export interface ChatSessionItem {
		/**
		 * Unique identifier for the chat session.
		 *
		 * @deprecated Will be replaced by `resource`
		 */
		id: string;

		/**
		 * The resource associated with the chat session.
		 *
		 * This is uniquely identifies the chat session and is used to open the chat session.
		 */
		resource: Uri | undefined;

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
		statistics?: {
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
		 * Keys correspond to option group IDs (e.g., 'models', 'subagents')
		 * and values are the selected option item IDs.
		 * TODO: Strongly type the keys
		 */
		readonly options?: Record<string, string>;

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

	export interface ChatSessionContentProvider {
		/**
		 * Resolves a chat session into a full `ChatSession` object.
		 *
		 * @param sessionId The id of the chat session to open.
		 * @param token A cancellation token that can be used to cancel the operation.
		 */
		provideChatSessionContent(sessionId: string, token: CancellationToken): Thenable<ChatSession> | ChatSession;

		/**
		 *
		 * @param sessionId Identifier of the chat session being updated.
		 * @param updates Collection of option identifiers and their new values. Only the options that changed are included.
		 * @param token A cancellation token that can be used to cancel the notification if the session is disposed.
		 */
		provideHandleOptionsChange?(sessionId: string, updates: ReadonlyArray<ChatSessionOptionUpdate>, token: CancellationToken): void;

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
		 * @param chatSessionType A unique identifier for the chat session type. This is used to differentiate between different chat session providers.
		 * @param provider The provider to register.
		 *
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerChatSessionContentProvider(chatSessionType: string, provider: ChatSessionContentProvider, chatParticipant: ChatParticipant, capabilities?: ChatSessionCapabilities): Disposable;
	}

	export interface ChatContext {
		readonly chatSessionContext?: ChatSessionContext;
		readonly chatSummary?: {
			readonly prompt?: string;
			readonly history?: string;
		};
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

	/**
	 * @deprecated
	 */
	export interface ChatSessionShowOptions {
		/**
		 * The editor view column to show the chat session in.
		 *
		 * If not provided, the chat session will be shown in the chat panel instead.
		 */
		readonly viewColumn?: ViewColumn;
	}

	export namespace window {
		/**
		 * Shows a chat session in the panel or editor.
		 *
		 * @deprecated
		 */
		export function showChatSession(chatSessionType: string, sessionId: string, options: ChatSessionShowOptions): Thenable<void>;
	}
}
