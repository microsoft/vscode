/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	// #region Resource Classes

	/**
	 * Describes a chat resource file.
	 */
	export type ChatResourceDescriptor =
		| Uri
		| {
			uri: Uri;
			isEditable?: boolean;
		}
		| {
			id: string;
			content: string;
		};

	/**
	 * Represents a custom agent resource file (e.g., .agent.md).
	 */
	export class CustomAgentChatResource {
		/**
		 * The custom agent resource descriptor.
		 */
		readonly resource: ChatResourceDescriptor;

		/**
		 * Creates a new custom agent resource from the specified resource.
		 * @param resource The chat resource descriptor.
		 */
		constructor(resource: ChatResourceDescriptor);
	}

	/**
	 * Represents an instructions resource file.
	 */
	export class InstructionsChatResource {
		/**
		 * The instructions resource descriptor.
		 */
		readonly resource: ChatResourceDescriptor;

		/**
		 * Creates a new instructions resource from the specified resource.
		 * @param resource The chat resource descriptor.
		 */
		constructor(resource: ChatResourceDescriptor);
	}

	/**
	 * Represents a prompt file resource (e.g., .prompt.md).
	 */
	export class PromptFileChatResource {
		/**
		 * The prompt file resource descriptor.
		 */
		readonly resource: ChatResourceDescriptor;

		/**
		 * Creates a new prompt file resource from the specified resource.
		 * @param resource The chat resource descriptor.
		 */
		constructor(resource: ChatResourceDescriptor);
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
		provideCustomAgents(
			context: CustomAgentContext,
			token: CancellationToken
		): ProviderResult<CustomAgentChatResource[]>;
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
		provideInstructions(
			context: InstructionsContext,
			token: CancellationToken
		): ProviderResult<InstructionsChatResource[]>;
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
		providePromptFiles(
			context: PromptFileContext,
			token: CancellationToken
		): ProviderResult<PromptFileChatResource[]>;
	}

	// #endregion

	// #region Chat Provider Registration

	export namespace chat {
		/**
		 * Register a provider for custom agents.
		 * @param provider The custom agent provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerCustomAgentProvider(
			provider: CustomAgentProvider
		): Disposable;

		/**
		 * Register a provider for instructions.
		 * @param provider The instructions provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerInstructionsProvider(
			provider: InstructionsProvider
		): Disposable;

		/**
		 * Register a provider for prompt files.
		 * @param provider The prompt file provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerPromptFileProvider(
			provider: PromptFileProvider
		): Disposable;
	}

	// #endregion
}
