/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 2

declare module 'vscode' {
	// #region Resource Classes

	/**
	 * Indicates where a chat resource was loaded from.
	 */
	export type ChatResourceSource = 'local' | 'user' | 'extension' | 'plugin';

	/**
	 * Represents a chat-related resource, such as a custom agent, instructions, prompt file, skill, or slash command.
	 */
	export interface ChatResource {
		/**
		 * Uri to the chat resource. This is typically a `.agent.md`, `.instructions.md`, `.prompt.md`, or `SKILL.md` file.
		 */
		readonly uri: Uri;

		/**
		 * Optional condition that must evaluate to true for the resource to be offered.
		 */
		readonly when?: string;

		/**
		 * Optional session types that describe when the resource should be offered.
		 */
		readonly sessionTypes?: readonly string[];
	}

	/**
	 * Represents a custom chat agent resource.
	 */
	export interface ChatCustomAgent {
		/**
		 * Uri to the custom agent. This is typically a `.agent.md` file.
		 */
		readonly uri: Uri;

		/**
		 * Display name of the custom agent.
		 */
		readonly name: string;

		/**
		 * Optional description of the custom agent.
		 */
		readonly description?: string;

		/**
		 * Where the custom agent was loaded from.
		 */
		readonly source: ChatResourceSource;

		/**
		 * Optional session types that describe when the custom agent should be offered.
		 */
		readonly sessionTypes?: readonly string[];

		/**
		 * The contributing extension identifier when {@link source} is `extension`.
		 */
		readonly extensionId?: string;

		/**
		 * The contributing plugin URI when {@link source} is `plugin`.
		 */
		readonly pluginUri?: Uri;

		/**
		 * Optional hint that describes what arguments the custom agent accepts.
		 */
		readonly argumentHint?: string;

		/**
		 * Optional tool restrictions declared by the custom agent.
		 */
		readonly tools?: readonly string[];

		/**
		 * Optional model preferences declared by the custom agent.
		 */
		readonly model?: readonly string[];

		/**
		 * Whether this custom agent should be shown to users as invocable.
		 */
		readonly userInvocable: boolean;

		/**
		 * Whether this custom agent should be excluded from model invocation.
		 */
		readonly disableModelInvocation: boolean;

		/**
		 * Whether this custom agent is enabled. Disabled agents are included in the list
		 * but should not be offered to users or used in automated flows.
		 */
		readonly enabled: boolean;
	}

	/**
	 * Represents an instruction file resource.
	 */
	export interface ChatInstruction {
		/**
		 * Uri to the instruction.
		 */
		readonly uri: Uri;

		/**
		 * Display name of the instruction.
		 */
		readonly name: string;

		/**
		 * Optional description of the instruction.
		 */
		readonly description?: string;

		/**
		 * Where the instruction was loaded from.
		 */
		readonly source: ChatResourceSource;

		/**
		 * Optional session types that describe when the instruction should be offered.
		 */
		readonly sessionTypes?: readonly string[];

		/**
		 * The contributing extension identifier when {@link source} is `extension`.
		 */
		readonly extensionId?: string;

		/**
		 * The contributing plugin URI when {@link source} is `plugin`.
		 */
		readonly pluginUri?: Uri;

		/**
		 * The optional apply pattern used to scope the instruction.
		 */
		readonly pattern?: string;
	}

	/**
	 * Represents a skill resource.
	 */
	export interface ChatSkill {
		/**
		 * Uri to the chat resource. This is typically a `.agent.md`, `.instructions.md`, `.prompt.md`, or `SKILL.md` file.
		 */
		readonly uri: Uri;

		/**
		 * Display name of the skill.
		 */
		readonly name: string;

		/**
		 * Optional description of the skill.
		 */
		readonly description?: string;

		/**
		 * Where the skill was loaded from.
		 */
		readonly source: ChatResourceSource;

		/**
		 * Optional session types that describe when the skill should be offered.
		 */
		readonly sessionTypes?: readonly string[];

		/**
		 * The contributing extension identifier when {@link source} is `extension`.
		 */
		readonly extensionId?: string;

		/**
		 * The contributing plugin URI when {@link source} is `plugin`.
		 */
		readonly pluginUri?: Uri;

		/**
		 * Whether this skill should be shown to users as invocable.
		 */
		readonly userInvocable?: boolean;

		/**
		 * Whether this skill should be excluded from model invocation.
		 * When true, the skill can only be triggered manually via `/name`.
		 */
		readonly disableModelInvocation: boolean;
	}

	/**
	 * Represents a slash command resource.
	 */
	export interface ChatSlashCommand {
		/**
		 * Uri to the chat resource.
		 */
		readonly uri: Uri;

		/**
		 * Display name of the chat resource.
		 */
		readonly name: string;

		/**
		 * Optional description of the chat resource.
		 */
		readonly description?: string;

		/**
		 * Where the chat resource was loaded from.
		 */
		readonly source: ChatResourceSource;

		/**
		 * Optional session types that describe when the slash command should be offered.
		 */
		readonly sessionTypes?: readonly string[];

		/**
		 * The contributing extension identifier when {@link source} is `extension`.
		 */
		readonly extensionId?: string;

		/**
		 * The contributing plugin URI when {@link source} is `plugin`.
		 */
		readonly pluginUri?: Uri;

		/**
		 * Optional hint that describes what arguments the slash command accepts.
		 */
		readonly argumentHint?: string;

		/**
		 * Whether this slash command should be shown to users as invocable.
		 */
		readonly userInvocable?: boolean;
	}

	export interface ChatHook {
		readonly uri: Uri;
		/**
		 * Optional session types that describe when the hook should be offered.
		 */
		readonly sessionTypes?: readonly string[];

		/**
		 * Where the chat resource was loaded from.
		 */
		readonly source: ChatResourceSource;

		/**
		 * The contributing extension identifier when {@link source} is `extension`.
		 */
		readonly extensionId?: string;

		/**
		 * The contributing plugin URI when {@link source} is `plugin`.
		 */
		readonly pluginUri?: Uri;

	}

	export interface ChatPlugin {
		readonly uri: Uri;
		/**
		 * Optional session types that describe when the plugin should be offered.
		 */
		readonly sessionTypes?: readonly string[];

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

	// #region HookProvider

	/**
	 * A provider that supplies hook configuration resources (from hooks JSON files).
	 */
	export interface ChatHookProvider {
		/**
		 * An optional event to signal that hooks have changed.
		 */
		readonly onDidChangeHooks?: Event<void>;

		/**
		 * Provide the list of hook configuration files available.
		 * @param context Context for the provide call.
		 * @param token A cancellation token.
		 * @returns An array of hook resources or a promise that resolves to such.
		 */
		provideHooks(context: unknown, token: CancellationToken): ProviderResult<ChatResource[]>;
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
		 * An event that fires when the list of {@link customAgents custom agents} changes.
		 */
		export const onDidChangeCustomAgents: Event<void>;


		/**
		 * Provide the list of currently available custom agents. These are `.agent.md` files
		 * from all sources (workspace, user, and extension-provided).
		 * @param token A cancellation token.
		 */
		export function getCustomAgents(token: CancellationToken): Thenable<readonly ChatCustomAgent[]>;

		/**
		 * An event that fires when the list of {@link instructions instructions} changes.
		 */
		export const onDidChangeInstructions: Event<void>;


		/**
		 * Provide the list of currently available instructions. These are `.instructions.md` files
		 * from all sources (workspace, user, and extension-provided).
		 * @param token A cancellation token.
		 */
		export function getInstructions(token: CancellationToken): Thenable<readonly ChatInstruction[]>;

		/**
		 * An event that fires when the list of {@link skills skills} changes.
		 */
		export const onDidChangeSkills: Event<void>;


		/**
		 * Provide the list of currently available skills. These are `SKILL.md` files
		 * from all sources (workspace, user, and extension-provided).
		 * @param token A cancellation token.
		 */
		export function getSkills(token: CancellationToken): Thenable<readonly ChatSkill[]>;

		/**
		 * An event that fires when the list of {@link slashCommands slash commands} changes.
		 */
		export const onDidChangeSlashCommands: Event<void>;


		/**
		 * Provide the list of currently available slash commands. These are `.prompt.md` files and
		 * user-invocable `SKILL.md` files from all sources (workspace, user, and extension-provided).
		 * @param token A cancellation token.
		 */
		export function getSlashCommands(token: CancellationToken): Thenable<readonly ChatSlashCommand[]>;

		/**
		 * An event that fires when the list of {@link hooks hooks} changes.
		 */
		export const onDidChangeHooks: Event<void>;


		/**
		 * Provide the list of currently available hook configuration files. These are JSON files that define lifecycle hooks from all sources (workspace, user, and extension-provided).
		 * @param token A cancellation token.
		 */
		export function getHooks(token: CancellationToken): Thenable<readonly ChatHook[]>;

		/**
		 * An event that fires when the list of {@link plugins plugins} changes.
		 */
		export const onDidChangePlugins: Event<void>;


		/**
		 * Provide the list of currently installed agent plugins.
		 * @param token A cancellation token.
		 */
		export function getPlugins(token: CancellationToken): Thenable<readonly ChatPlugin[]>;

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

		/**
		 * Register a provider for hooks.
		 * @param provider The hook provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerHookProvider(provider: ChatHookProvider): Disposable;
	}

	// #endregion
}
