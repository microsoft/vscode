/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Types used by the chatSessionsProvider proposal for chat customizations.

declare module 'vscode' {

	/**
	 * Well-known customization type identifiers.
	 *
	 * Extensions may use these as the {@link ChatSessionCustomizationItemGroup.id id}
	 * of a {@link ChatSessionCustomizationItemGroup} to place items into standard
	 * sections in the management UI.
	 *
	 * TODO: How granular should we be? Consider removing the sub-instruction
	 * types (ContextInstructions, OnDemandInstructions) and collapsing to a
	 * single 'instructions' type.
	 */
	export enum ChatSessionCustomizationType {
		Agents = 'agents',
		Skills = 'skills',
		AgentInstructions = 'agentInstructions',
		ContextInstructions = 'contextInstructions',
		OnDemandInstructions = 'onDemandInstructions',
		Prompts = 'prompts',
	}

	/**
	 * Where a customization item originates from.
	 *
	 * Controls default behaviour in the management UI (grouping, delete-ability).
	 *
	 * TODO: Should this be inferred by core itself depending on the URI
	 * scheme/path rather than declared by the extension?
	 */
	export enum ChatSessionCustomizationStorageLocation {
		/** From the current workspace (`.github/` folder, workspace root, etc.) */
		Workspace = 1,
		/** From user-level configuration (`~/.copilot/`, `~/.config/`, etc.) */
		User = 2,
		/** From an extension's contribution */
		Extension = 3,
		/** From an installed plugin */
		Plugin = 4,
		/** Built into the session provider itself */
		BuiltIn = 5,
	}

	/**
	 * A single customization item such as an agent, skill, instruction, or prompt.
	 */
	export interface ChatSessionCustomizationItem {
		/**
		 * Display label for the item.
		 */
		readonly label: string;

		/**
		 * Optional description shown as secondary text or tooltip.
		 */
		readonly description?: string;

		/**
		 * URI pointing to the underlying resource
		 * (`.agent.md`, `.instructions.md`, `SKILL.md`, etc.).
		 * Also serves as the unique identity for this item.
		 */
		readonly uri: Uri;

		/**
		 * Where this item comes from. The management UI uses this to
		 * group items under "Workspace", "User", "Extensions", etc.
		 */
		readonly storageLocation: ChatSessionCustomizationStorageLocation;

		/**
		 * Optional icon for the item. Overrides the default icon derived
		 * from the customization type.
		 */
		readonly icon?: ThemeIcon;
	}

	/**
	 * A named group of customization items of a single type.
	 *
	 * Use a well-known {@link ChatSessionCustomizationType} as the
	 * {@link id} to place items into a standard management UI section.
	 */
	export interface ChatSessionCustomizationItemGroup {
		/**
		 * Identifier for this group. Use a value from
		 * {@link ChatSessionCustomizationType} to map to a built-in section,
		 * or a custom string for extension-defined sections.
		 */
		readonly id: string;

		/**
		 * The items in this group.
		 */
		readonly items: ChatSessionCustomizationItem[];

		/**
		 * Commands shown in the toolbar / "New" dropdown for this group.
		 *
		 * @example A "New Agent" command that opens a scaffold wizard.
		 */
		readonly commands?: Command[];

		/**
		 * Commands shown in the context menu for individual items.
		 * Each command receives the item's {@link ChatSessionCustomizationItem.uri uri}
		 * as its first argument.
		 *
		 * @example A "Run Prompt" command, a "Disable Skill" command.
		 */
		readonly itemCommands?: Command[];
	}

	/**
	 * Provides customization items for a chat session type.
	 *
	 * Registered via {@link chat.registerChatSessionCustomizationsProvider}.
	 * The provider is called when the management UI needs to display
	 * customizations, and re-called whenever
	 * {@link onDidChangeCustomizations} fires.
	 */
	export interface ChatSessionCustomizationsProvider {
		/**
		 * Fired when customization items have changed and the UI should
		 * re-fetch them.
		 */
		readonly onDidChangeCustomizations: Event<void>;

		/**
		 * Provide the current customization groups.
		 *
		 * @param token A cancellation token.
		 * @returns An array of customization groups, or a thenable that resolves to one.
		 */
		provideCustomizations(token: CancellationToken): ProviderResult<ChatSessionCustomizationItemGroup[]>;

	}
}
