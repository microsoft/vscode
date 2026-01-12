/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	// #region Resource Classes

	/**
	 * Options for creating a custom agent resource.
	 */
	export interface CustomAgentOptions {
		/**
		 * Indicates whether the custom agent is editable. Defaults to false.
		 */
		isEditable?: boolean;
	}

	/**
	 * Represents a custom agent resource file (e.g., .agent.md).
	 */
	export class CustomAgentChatResource {
		/**
		 * The URI to the custom agent resource file.
		 */
		readonly uri: Uri;

		/**
		 * Indicates whether the custom agent is editable. Defaults to false.
		 */
		readonly isEditable?: boolean;

		/**
		 * Creates a new custom agent resource from an existing file.
		 * @param uri The URI to the custom agent resource file.
		 * @param options Optional settings for the custom agent.
		 */
		constructor(uri: Uri, options?: CustomAgentOptions);

		/**
		 * Creates a new custom agent resource from content. A virtual URI will be generated
		 * and the markdown content will be constructed from the provided content.
		 * @param id The unique identifier for this custom agent resource.
		 * @param content The content for creating the custom agent - either a string (body only)
		 *                or a structured PromptFileContent object with header and body.
		 * @param options Optional settings for the custom agent.
		 */
		constructor(id: string, content: string, options?: CustomAgentOptions);
	}

	/**
	 * Options for creating an instructions resource.
	 */
	export interface InstructionsOptions {
		/**
		 * Indicates whether the instructions are editable. Defaults to false.
		 */
		isEditable?: boolean;
	}

	/**
	 * Represents an instructions resource file.
	 */
	export class InstructionsChatResource {
		/**
		 * The URI to the instructions resource file.
		 */
		readonly uri: Uri;

		/**
		 * Indicates whether the instructions are editable. Defaults to false.
		 */
		readonly isEditable?: boolean;

		/**
		 * Creates a new instructions resource from an existing file.
		 * @param uri The URI to the instructions resource file.
		 * @param options Optional settings for the instructions.
		 */
		constructor(uri: Uri, options?: InstructionsOptions);

		/**
		 * Creates a new instructions resource from content. A virtual URI will be generated
		 * and the markdown content will be constructed from the provided content.
		 * @param id The unique identifier for this instructions resource.
		 * @param content The content for creating the instructions - either a string (body only)
		 *                or a structured PromptFileContent object with header and body.
		 * @param options Optional settings for the instructions.
		 */
		constructor(id: string, content: string, options?: InstructionsOptions);
	}

	/**
	 * Options for creating a prompt file resource.
	 */
	export interface PromptFileOptions {
		/**
		 * Indicates whether the prompt file is editable. Defaults to false.
		 */
		isEditable?: boolean;
	}

	/**
	 * Represents a prompt file resource (e.g., .prompt.md).
	 */
	export class PromptFileChatResource {
		/**
		 * The URI to the prompt file resource.
		 */
		readonly uri: Uri;

		/**
		 * Indicates whether the prompt file is editable. Defaults to false.
		 */
		readonly isEditable?: boolean;

		/**
		 * Creates a new prompt file resource from an existing file.
		 * @param uri The URI to the prompt file resource file.
		 * @param options Optional settings for the prompt file.
		 */
		constructor(uri: Uri, options?: PromptFileOptions);

		/**
		 * Creates a new prompt file resource from content. A virtual URI will be generated
		 * and the markdown content will be constructed from the provided content.
		 * @param id The unique identifier for this prompt file resource.
		 * @param content The content for creating the prompt file - either a string (body only)
		 *                or a structured PromptFileContent object with header and body.
		 * @param options Optional settings for the prompt file.
		 */
		constructor(id: string, content: string, options?: PromptFileOptions);
	}

	// #endregion

	// #region Providers

	/**
	 * Options for querying custom agents.
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
		 * @returns An array of custom agents or a promise that resolves to such.
		 */
		provideCustomAgents(context: CustomAgentContext, token: CancellationToken): ProviderResult<CustomAgentChatResource[]>;
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
		 * @returns An array of instructions or a promise that resolves to such.
		 */
		provideInstructions(context: InstructionsContext, token: CancellationToken): ProviderResult<InstructionsChatResource[]>;
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
		 * @returns An array of prompt files or a promise that resolves to such.
		 */
		providePromptFiles(context: PromptFileContext, token: CancellationToken): ProviderResult<PromptFileChatResource[]>;
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
