/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	// #region Customization Provider Types

	/**
	 * The types of customizations that a provider can report.
	 */
	export enum ChatCustomizationType {
		Agent = 1,
		Skill = 2,
		Instructions = 3,
		Prompt = 4,
		Hook = 5,
	}

	/**
	 * Metadata describing a customization provider and its capabilities.
	 * This drives UI presentation (label, icon) and filtering (unsupported types,
	 * workspace sub-paths).
	 */
	export interface ChatCustomizationProviderMetadata {
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
		readonly unsupportedTypes?: readonly ChatCustomizationType[];

		/**
		 * Workspace sub-paths that this provider recognizes for customization files.
		 * When set, only workspace files under these paths are shown in the UI.
		 * For example, `['.claude']` for Claude or `['.github', '.copilot']` for CLI.
		 * When `undefined`, all workspace paths are shown.
		 */
		readonly workspaceSubpaths?: readonly string[];
	}

	/**
	 * Represents a single customization item reported by a provider.
	 */
	export interface ChatCustomizationItem {
		/**
		 * URI to the customization file (e.g. an `.agent.md`, `SKILL.md`, or `.instructions.md` file).
		 */
		readonly uri: Uri;

		/**
		 * The type of customization this item represents.
		 */
		readonly type: ChatCustomizationType;

		/**
		 * Display name for this customization.
		 */
		readonly name: string;

		/**
		 * Optional description of this customization.
		 */
		readonly description?: string;
	}

	/**
	 * A provider that reports which customizations a harness or runtime supports.
	 *
	 * Implementing extensions (e.g. Copilot CLI, Claude) register a provider to
	 * report the customizations they have loaded from their SDKs. This replaces
	 * core-based harness filtering with extension-driven discovery.
	 */
	export interface ChatCustomizationProvider {
		/**
		 * An optional event that fires when the provider's customizations change.
		 * The UI will re-query {@link provideCustomizations} when this fires.
		 */
		readonly onDidChange?: Event<void>;

		/**
		 * Provide the customization items this provider supports.
		 *
		 * Called when the workspace changes and when {@link onDidChange} fires.
		 *
		 * @param token A cancellation token.
		 * @returns The list of customization items, or `undefined` if unavailable.
		 */
		provideCustomizations(token: CancellationToken): ProviderResult<ChatCustomizationItem[]>;
	}

	// #endregion

	// #region Registration

	export namespace chat {
		/**
		 * Register a customization provider that reports what customizations
		 * a harness or runtime supports. The provider's metadata drives UI
		 * presentation and filtering, while {@link ChatCustomizationProvider.provideCustomizations}
		 * supplies the actual items.
		 *
		 * @param id A unique identifier for this provider (e.g. `'cli'`, `'claude'`).
		 * @param metadata Metadata describing the provider's capabilities and UI presentation.
		 * @param provider The customization provider implementation.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerCustomizationProvider(id: string, metadata: ChatCustomizationProviderMetadata, provider: ChatCustomizationProvider): Disposable;
	}

	// #endregion
}
