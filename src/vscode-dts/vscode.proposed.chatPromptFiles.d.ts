/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	// #region Resource Classes

	/**
	 * Represents a hand-off action that allows an agent to delegate to another agent.
	 */
	export interface CustomAgentHandoff {
		/**
		 * The display label for the hand-off action.
		 */
		label: string;

		/**
		 * The name of the agent to hand off to.
		 */
		agent: string;

		/**
		 * The prompt to send when handing off.
		 */
		prompt: string;

		/**
		 * Whether to automatically send the prompt. Defaults to false.
		 */
		send?: boolean;

		/**
		 * Whether to show the "Continue on" option. Defaults to undefined.
		 */
		showContinueOn?: boolean;
	}

	/**
	 * Properties for creating a custom agent without a URI.
	 * The markdown content will be generated from these properties.
	 */
	export interface CustomAgentProperties {
		/**
		 * The body/instructions content of the custom agent.
		 */
		body: string;

		/**
		 * Optional model to use for the custom agent.
		 */
		model?: string;

		/**
		 * Optional list of tools available to the custom agent.
		 */
		tools?: string[];

		/**
		 * Optional argument hint that describes what inputs the agent expects or supports.
		 */
		argumentHint?: string;

		/**
		 * Optional target platform for the agent ('vscode' or 'github-copilot').
		 */
		target?: string;

		/**
		 * Whether the agent should be inferred/suggested automatically based on context.
		 */
		infer?: boolean;

		/**
		 * Optional hand-off actions that allow this agent to delegate to other agents.
		 */
		handoffs?: CustomAgentHandoff[];
	}

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
		 * The unique identifier/name of the custom agent.
		 */
		readonly name: string;

		/**
		 * A description of what the custom agent does.
		 */
		readonly description: string;

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
		 * @param name The unique identifier/name of the custom agent.
		 * @param description A description of what the custom agent does.
		 * @param uri The URI to the custom agent resource file.
		 * @param options Optional settings for the custom agent.
		 */
		constructor(name: string, description: string, uri: Uri, options?: CustomAgentOptions);

		/**
		 * Creates a new custom agent resource from properties. A virtual URI will be generated
		 * and the markdown content will be constructed from the provided properties.
		 * @param name The unique identifier/name of the custom agent.
		 * @param description A description of what the custom agent does.
		 * @param properties The properties for creating the custom agent.
		 * @param options Optional settings for the custom agent.
		 */
		constructor(name: string, description: string, properties: CustomAgentProperties, options?: CustomAgentOptions);
	}

	/**
	 * Properties for creating instructions without a URI.
	 * The markdown content will be generated from these properties.
	 */
	export interface InstructionsProperties {
		/**
		 * The body content of the instructions.
		 */
		body: string;

		/**
		 * Optional glob pattern specifying which files these instructions apply to.
		 */
		applyTo?: string;
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
		 * The unique identifier/name of the instructions.
		 */
		readonly name: string;

		/**
		 * A description of what the instructions provide.
		 */
		readonly description: string;

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
		 * @param name The unique identifier/name of the instructions.
		 * @param description A description of what the instructions provide.
		 * @param uri The URI to the instructions resource file.
		 * @param options Optional settings for the instructions.
		 */
		constructor(name: string, description: string, uri: Uri, options?: InstructionsOptions);

		/**
		 * Creates a new instructions resource from properties. A virtual URI will be generated
		 * and the markdown content will be constructed from the provided properties.
		 * @param name The unique identifier/name of the instructions.
		 * @param description A description of what the instructions provide.
		 * @param properties The properties for creating the instructions.
		 * @param options Optional settings for the instructions.
		 */
		constructor(name: string, description: string, properties: InstructionsProperties, options?: InstructionsOptions);
	}

	/**
	 * Properties for creating a prompt file without a URI.
	 * The markdown content will be generated from these properties.
	 */
	export interface PromptFileProperties {
		/**
		 * The body content of the prompt file.
		 */
		body: string;

		/**
		 * Optional agent to use for the prompt file.
		 */
		agent?: string;

		/**
		 * Optional model to use for the prompt file.
		 */
		model?: string;

		/**
		 * Optional list of tools available to the prompt file.
		 */
		tools?: string[];
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
		 * The unique identifier/name of the prompt file.
		 */
		readonly name: string;

		/**
		 * A description of what the prompt file does.
		 */
		readonly description: string;

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
		 * @param name The unique identifier/name of the prompt file.
		 * @param description A description of what the prompt file does.
		 * @param uri The URI to the prompt file resource file.
		 * @param options Optional settings for the prompt file.
		 */
		constructor(name: string, description: string, uri: Uri, options?: PromptFileOptions);

		/**
		 * Creates a new prompt file resource from properties. A virtual URI will be generated
		 * and the markdown content will be constructed from the provided properties.
		 * @param name The unique identifier/name of the prompt file.
		 * @param description A description of what the prompt file does.
		 * @param properties The properties for creating the prompt file.
		 * @param options Optional settings for the prompt file.
		 */
		constructor(name: string, description: string, properties: PromptFileProperties, options?: PromptFileOptions);
	}

	// #endregion

	// #region Providers

	/**
	 * Options for querying custom agents.
	 */
	export type CustomAgentQueryOptions = object;

	/**
	 * A provider that supplies custom agent resources (from .agent.md files) for repositories.
	 */
	export interface CustomAgentProvider {
		/**
		 * An optional event to signal that custom agents have changed.
		 */
		readonly onDidChangeCustomAgents?: Event<void>;

		/**
		 * Provide the list of custom agents available.
		 * @param options Optional query parameters.
		 * @param token A cancellation token.
		 * @returns An array of custom agents or a promise that resolves to such.
		 */
		provideCustomAgents(options: CustomAgentQueryOptions, token: CancellationToken): ProviderResult<CustomAgentChatResource[]>;
	}

	/**
	 * Options for querying instructions.
	 */
	export type InstructionsQueryOptions = object;

	/**
	 * A provider that supplies instructions resources for repositories.
	 */
	export interface InstructionsProvider {
		/**
		 * An optional event to signal that instructions have changed.
		 */
		readonly onDidChangeInstructions?: Event<void>;

		/**
		 * Provide the list of instructions available.
		 * @param options Optional query parameters.
		 * @param token A cancellation token.
		 * @returns An array of instructions or a promise that resolves to such.
		 */
		provideInstructions(options: InstructionsQueryOptions, token: CancellationToken): ProviderResult<InstructionsChatResource[]>;
	}

	/**
	 * Options for querying prompt files.
	 */
	export type PromptFileQueryOptions = object;

	/**
	 * A provider that supplies prompt file resources (from .prompt.md files) for repositories.
	 */
	export interface PromptFileProvider {
		/**
		 * An optional event to signal that prompt files have changed.
		 */
		readonly onDidChangePromptFiles?: Event<void>;

		/**
		 * Provide the list of prompt files available.
		 * @param options Optional query parameters.
		 * @param token A cancellation token.
		 * @returns An array of prompt files or a promise that resolves to such.
		 */
		providePromptFiles(options: PromptFileQueryOptions, token: CancellationToken): ProviderResult<PromptFileChatResource[]>;
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
