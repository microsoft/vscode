/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {
	// #region Resource Classes

	/**
	 * Represents a chat-related resource, such as a custom agent, instructions, prompt file, or skill.
	 */
	export interface ChatResource {
		/**
		 * Uri to the chat resource. This is typically a `.agent.md`, `.instructions.md`, `.prompt.md`, or `SKILL.md` file.
		 */
		readonly uri: Uri;
	}

	// #endregion

	// #region Providers

	/**
	 * A provider that supplies custom agent resources (from .agent.md files) for repositories.
	 */
	export interface ChatCustomAgentProvider {
		/**
		 * An optional event to signal that custom agents have changed.
		 */
		readonly onDidChangeCustomAgents?: Event<void>;

		/**
		 * Provide the list of custom agents available.
		 * @param context Context for the provide call.
		 * @param token A cancellation token.
		 * @returns An array of custom agents or a promise that resolves to such.
		 */
		provideCustomAgents(context: unknown, token: CancellationToken): ProviderResult<ChatResource[]>;
	}

	/**
	 * A provider that supplies instructions resources for repositories.
	 */
	export interface ChatInstructionsProvider {
		/**
		 * An optional event to signal that instructions have changed.
		 */
		readonly onDidChangeInstructions?: Event<void>;

		/**
		 * Provide the list of instructions available.
		 * @param context Context for the provide call.
		 * @param token A cancellation token.
		 * @returns An array of instructions or a promise that resolves to such.
		 */
		provideInstructions(context: unknown, token: CancellationToken): ProviderResult<ChatResource[]>;
	}

	/**
	 * A provider that supplies prompt file resources (from .prompt.md files) for repositories.
	 */
	export interface ChatPromptFileProvider {
		/**
		 * An optional event to signal that prompt files have changed.
		 */
		readonly onDidChangePromptFiles?: Event<void>;

		/**
		 * Provide the list of prompt files available.
		 * @param context Context for the provide call.
		 * @param token A cancellation token.
		 * @returns An array of prompt files or a promise that resolves to such.
		 */
		providePromptFiles(context: unknown, token: CancellationToken): ProviderResult<ChatResource[]>;
	}

	// #endregion

	// #region SkillProvider

	/**
	 * A provider that supplies SKILL.md resources for agents.
	 */
	export interface ChatSkillProvider {
		/**
		 * An optional event to signal that skills have changed.
		 */
		readonly onDidChangeSkills?: Event<void>;

		/**
		 * Provide the list of skills available.
		 * @param context Context for the provide call.
		 * @param token A cancellation token.
		 * @returns An array of skill resources or a promise that resolves to such.
		 */
		provideSkills(context: unknown, token: CancellationToken): ProviderResult<ChatResource[]>;
	}

	// #endregion

	// #region Chat Provider Registration

	export namespace chat {
		/**
		 * Register a provider for custom agents.
		 * @param provider The custom agent provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerCustomAgentProvider(provider: ChatCustomAgentProvider): Disposable;

		/**
		 * Register a provider for instructions.
		 * @param provider The instructions provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerInstructionsProvider(provider: ChatInstructionsProvider): Disposable;

		/**
		 * Register a provider for prompt files.
		 * @param provider The prompt file provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerPromptFileProvider(provider: ChatPromptFileProvider): Disposable;

		/**
		 * Register a provider for skills.
		 * @param provider The skill provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerSkillProvider(provider: ChatSkillProvider): Disposable;
	}

	// #endregion
}
