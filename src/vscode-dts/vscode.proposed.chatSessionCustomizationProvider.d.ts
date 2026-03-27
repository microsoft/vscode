/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// #region Customization Provider Types

	/**
	 * Identifies the kind of customization an item represents.
	 *
	 * Use the built-in static instances (e.g. {@link ChatSessionCustomizationType.Agent})
	 * for well-known customization types, or create a new instance with a custom
	 * string id for extension-defined types.
	 */
	export class ChatSessionCustomizationType {
		/** Agent customization (`.agent.md` files). */
		static readonly Agent: ChatSessionCustomizationType;
		/** Skill customization (`SKILL.md` files). */
		static readonly Skill: ChatSessionCustomizationType;
		/** Instruction customization (`.instructions.md` files). */
		static readonly Instructions: ChatSessionCustomizationType;
		/** Prompt customization (`.prompt.md` files). */
		static readonly Prompt: ChatSessionCustomizationType;
		/** Hook customization (event-driven automation). */
		static readonly Hook: ChatSessionCustomizationType;

		/**
		 * The string identifier for this customization type.
		 */
		readonly id: string;

		/**
		 * Create a new customization type.
		 *
		 * @param id A unique string identifier for this type (e.g. `'agent'`, `'skill'`).
		 */
		constructor(id: string);
	}

	/**
	 * Metadata describing a customization provider and its capabilities.
	 * This drives UI presentation (label, icon) and filtering (unsupported types,
	 * workspace sub-paths).
	 */
	export interface ChatSessionCustomizationProviderMetadata {
		/**
		 * Display label for this provider (e.g. "Copilot CLI", "Claude Code").
		 */
		readonly label: string;

		/**
		 * Optional codicon ID for this provider's icon in the UI.
		 */
		readonly iconId?: string;

		/**
		 * Customization types that this provider does **not** support.
		 * The corresponding sections will be hidden in the management UI
		 * when this provider is active.
		 */
		readonly unsupportedTypes?: readonly ChatSessionCustomizationType[];
	}

	/**
	 * Represents a single customization item reported by a provider.
	 */
	export interface ChatSessionCustomizationItem {
		/**
		 * URI to the customization file (e.g. an `.agent.md`, `SKILL.md`, or `.instructions.md` file).
		 */
		readonly uri: Uri;

		/**
		 * The type of customization this item represents.
		 */
		readonly type: ChatSessionCustomizationType;

		/**
		 * Display name for this customization.
		 */
		readonly name: string;

		/**
		 * Optional description of this customization.
		 */
		readonly description?: string;

		/**
		 * Optional group key for display grouping. Items sharing the same
		 * `groupKey` are placed under a shared collapsible header in the
		 * management UI.
		 *
		 * When omitted, items are grouped automatically by their storage
		 * source (e.g. Workspace, User) based on the item's URI.
		 */
		readonly groupKey?: string;

		/**
		 * Optional inline badge text shown next to the item name
		 * (e.g. a glob pattern like `src/vs/sessions/**`).
		 */
		readonly badge?: string;

		/**
		 * Optional tooltip text shown when hovering over the badge.
		 */
		readonly badgeTooltip?: string;
	}

	/**
	 * A provider that reports which chat customizations are available.
	 *
	 * Chat customizations are configuration artifacts — agents, skills,
	 * instructions, prompts, and hooks — that augment LLM behavior during
	 * a chat session. Extensions that manage their own customization files
	 * (e.g. from an SDK's config directory) register a provider so the
	 * management UI can discover and display them.
	 *
	 * ### Lifecycle
	 *
	 * 1. Register via {@link chat.registerChatSessionCustomizationProvider}.
	 * 2. The UI calls {@link provideChatSessionCustomizations} once and caches
	 *    the result.
	 * 3. When the underlying files change, fire {@link onDidChange} to
	 *    trigger a fresh call to {@link provideChatSessionCustomizations}.
	 */
	export interface ChatSessionCustomizationProvider {
		/**
		 * An optional event that fires when the provider's customizations change.
		 * The UI caches the result of {@link provideChatSessionCustomizations} and will
		 * only re-query the provider when this event fires.
		 */
		readonly onDidChange?: Event<void>;

		/**
		 * Provide the customization items this provider supports.
		 *
		 * The result is cached by the UI until {@link onDidChange} fires.
		 *
		 * @param token A cancellation token.
		 * @returns The list of customization items, or `undefined` if unavailable.
		 */
		provideChatSessionCustomizations(token: CancellationToken): ProviderResult<ChatSessionCustomizationItem[]>;
	}

	// #endregion

	// #region Registration

	export namespace chat {
		/**
		 * Register a customization provider that reports what customizations
		 * a harness or runtime supports. The provider's metadata drives UI
		 * presentation and filtering, while {@link ChatSessionCustomizationProvider.provideChatSessionCustomizations}
		 * supplies the actual items.
		 *
		 * @param chatSessionType The session type this provider is for (e.g. `'cli'`, `'claude'`).
		 * @param metadata Metadata describing the provider's capabilities and UI presentation.
		 * @param provider The customization provider implementation.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerChatSessionCustomizationProvider(chatSessionType: string, metadata: ChatSessionCustomizationProviderMetadata, provider: ChatSessionCustomizationProvider): Disposable;
	}

	// #endregion
}
