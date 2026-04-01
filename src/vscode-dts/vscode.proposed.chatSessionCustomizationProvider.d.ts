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
		/** Plugin customization (agent runtime plugins). */
		static readonly Plugins: ChatSessionCustomizationType;

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
	 * Describes a file that was found during customization discovery but
	 * could not be loaded (e.g. invalid format, missing required fields).
	 */
	export interface ChatSessionCustomizationSkippedFile {
		/**
		 * URI of the file that was skipped.
		 */
		readonly uri: Uri;

		/**
		 * Human-readable reason why this file was skipped
		 * (e.g. `'missing "name" property'`, `'invalid YAML front-matter'`).
		 */
		readonly reason: string;
	}

	/**
	 * Diagnostic information about the customization discovery process.
	 *
	 * Returned alongside the customization items from
	 * {@link ChatSessionCustomizationProvider.provideChatSessionCustomizations}
	 * to aid debugging when customizations are not discovered as expected.
	 */
	export interface ChatSessionCustomizationDiagnostics {
		/**
		 * Directories that were scanned for customization files.
		 * Includes paths that did not yield any customizations.
		 */
		readonly scannedPaths?: readonly Uri[];

		/**
		 * Files that were found but skipped due to invalid
		 * properties, format, or other issues.
		 */
		readonly skippedFiles?: readonly ChatSessionCustomizationSkippedFile[];
	}

	/**
	 * The result returned by
	 * {@link ChatSessionCustomizationProvider.provideChatSessionCustomizations}.
	 */
	export interface ChatSessionCustomizationResult {
		/**
		 * The discovered customization items.
		 */
		readonly items: ChatSessionCustomizationItem[];

		/**
		 * Optional diagnostic information about the discovery process.
		 * When provided, the data is forwarded to the debug log so that
		 * scanned paths and skipped files are visible in the
		 * Agent Debug Logs view.
		 */
		readonly diagnostics?: ChatSessionCustomizationDiagnostics;
	}

	/**
	 * Describes what changed when a customization provider fires
	 * {@link ChatSessionCustomizationProvider.onDidChange}.
	 */
	export interface ChatSessionCustomizationChangeEvent {
		/**
		 * The customization types that were affected by the change.
		 * When `undefined`, all types should be considered changed.
		 */
		readonly changedTypes?: readonly ChatSessionCustomizationType[];
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
		 *
		 * The event payload describes what changed so that debug tooling can
		 * report which customization types were affected.
		 */
		readonly onDidChange?: Event<ChatSessionCustomizationChangeEvent>;

		/**
		 * Provide the customization items this provider supports.
		 *
		 * The result is cached by the UI until {@link onDidChange} fires.
		 *
		 * @param token A cancellation token.
		 * @returns The customization result including items and optional diagnostics,
		 *   or `undefined` if unavailable.
		 */
		provideChatSessionCustomizations(token: CancellationToken): ProviderResult<ChatSessionCustomizationResult>;
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
