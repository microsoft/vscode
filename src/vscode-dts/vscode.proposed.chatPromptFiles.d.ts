/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	// #region CustomAgentProvider

	/**
	 * Represents a custom agent resource file (e.g., .agent.md) available for a repository.
	 */
	export interface CustomAgentResource {
		/**
		 * The URI to the custom agent resource file.
		 */
		readonly uri: Uri;

		/**
		 * Indicates whether the custom agent is editable. Defaults to false.
		 */
		readonly isEditable?: boolean;
	}

	/**
	 * Context for querying custom agents.
	 */
	export type CustomAgentContext = object;

	/**
	 * A provider that supplies custom agent resources (from .agent.md files) for repositories.
	 */
	export interface CustomAgentProvider {
		/**
		 * A human-readable label for this provider.
		 */
		readonly label: string;

		/**
		 * An optional event to signal that custom agents have changed.
		 */
		readonly onDidChangeCustomAgents?: Event<void>;

		/**
		 * Provide the list of custom agents available.
		 * @param context Context for the query.
		 * @param token A cancellation token.
		 * @returns An array of custom agent resources or a promise that resolves to such.
		 */
		provideCustomAgents(context: CustomAgentContext, token: CancellationToken): ProviderResult<CustomAgentResource[]>;
	}

	// #endregion

	// #region InstructionsProvider

	/**
	 * Represents an instructions resource file available for a repository.
	 */
	export interface InstructionsResource {
		/**
		 * The URI to the instructions resource file.
		 */
		readonly uri: Uri;

		/**
		 * Indicates whether the instructions are editable. Defaults to false.
		 */
		readonly isEditable?: boolean;
	}

	/**
	 * Context for querying instructions.
	 */
	export type InstructionsContext = object;

	/**
	 * A provider that supplies instructions resources for repositories.
	 */
	export interface InstructionsProvider {
		/**
		 * A human-readable label for this provider.
		 */
		readonly label: string;

		/**
		 * An optional event to signal that instructions have changed.
		 */
		readonly onDidChangeInstructions?: Event<void>;

		/**
		 * Provide the list of instructions available.
		 * @param context Context for the query.
		 * @param token A cancellation token.
		 * @returns An array of instructions resources or a promise that resolves to such.
		 */
		provideInstructions(context: InstructionsContext, token: CancellationToken): ProviderResult<InstructionsResource[]>;
	}

	// #endregion

	// #region PromptFileProvider

	/**
	 * Represents a prompt file resource (e.g., .prompt.md) available for a repository.
	 */
	export interface PromptFileResource {
		/**
		 * The URI to the prompt file resource.
		 */
		readonly uri: Uri;

		/**
		 * Indicates whether the prompt file is editable. Defaults to false.
		 */
		readonly isEditable?: boolean;
	}

	/**
	 * Context for querying prompt files.
	 */
	export type PromptFileContext = object;

	/**
	 * A provider that supplies prompt file resources (from .prompt.md files) for repositories.
	 */
	export interface PromptFileProvider {
		/**
		 * A human-readable label for this provider.
		 */
		readonly label: string;

		/**
		 * An optional event to signal that prompt files have changed.
		 */
		readonly onDidChangePromptFiles?: Event<void>;

		/**
		 * Provide the list of prompt files available.
		 * @param context Context for the query.
		 * @param token A cancellation token.
		 * @returns An array of prompt file resources or a promise that resolves to such.
		 */
		providePromptFiles(context: PromptFileContext, token: CancellationToken): ProviderResult<PromptFileResource[]>;
	}

	// #endregion

	// #region Chat Provider Registration

	export namespace chat {
		/**
		 * Register a provider for custom agents.
		 * @param provider The custom agent provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerCustomAgentProvider(provider: CustomAgentProvider): Disposable;

		/**
		 * Register a provider for instructions.
		 * @param provider The instructions provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerInstructionsProvider(provider: InstructionsProvider): Disposable;

		/**
		 * Register a provider for prompt files.
		 * @param provider The prompt file provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerPromptFileProvider(provider: PromptFileProvider): Disposable;
	}

	// #endregion
}
