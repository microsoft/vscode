/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatModeInstructions, IVariableReference } from '../../chatModes.js';
import { PromptFileSource, PromptsType, Target } from '../promptTypes.js';
import { IHandOff, ParsedPromptFile } from '../promptFileParser.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { IResolvedPromptSourceFolder } from '../config/promptFileLocations.js';
import { ChatRequestHooks } from '../hookSchema.js';

/**
 * A single structured debug detail entry from the instructions context computer.
 */
export interface InstructionsCollectionDebugEntry {
	readonly category: 'applying' | 'skipped' | 'referenced' | 'skill' | 'custom-agent' | 'hook';
	readonly name: string;
	readonly uri?: URI;
	readonly reason?: string;
}

export type InstructionsCollectionEvent = {
	applyingInstructionsCount: number;
	referencedInstructionsCount: number;
	agentInstructionsCount: number;
	listedInstructionsCount: number;
	totalInstructionsCount: number;
	claudeRulesCount: number;
	claudeMdCount: number;
	claudeAgentsCount: number;
};

/**
 * Debug-only information collected alongside {@link InstructionsCollectionEvent}.
 * This data is used for debug logging and is not sent as telemetry.
 */
export type InstructionsCollectionDebugInfo = {
	/** Per-file detail entries for debug logging. */
	debugDetails: InstructionsCollectionDebugEntry[];
	/** Total wall-clock time of the collect() call in milliseconds. */
	durationInMillis: number;
};

export function newInstructionsCollectionEvent(): InstructionsCollectionEvent {
	return { applyingInstructionsCount: 0, referencedInstructionsCount: 0, agentInstructionsCount: 0, listedInstructionsCount: 0, totalInstructionsCount: 0, claudeRulesCount: 0, claudeMdCount: 0, claudeAgentsCount: 0 };
}

export function newInstructionsCollectionDebugInfo(): InstructionsCollectionDebugInfo {
	return { debugDetails: [], durationInMillis: 0 };
}

/**
 * Activation events for prompt file providers.
 */
export const CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT = 'onCustomAgentProvider';
export const INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT = 'onInstructionsProvider';
export const PROMPT_FILE_PROVIDER_ACTIVATION_EVENT = 'onPromptFileProvider';
export const SKILL_PROVIDER_ACTIVATION_EVENT = 'onSkillProvider';

/**
 * Context for querying prompt files.
 */
export interface IPromptFileContext { }

/**
 * Represents a prompt file resource from an external provider.
 */
export interface IPromptFileResource {
	/**
	 * The URI to the agent or prompt resource file.
	 */
	readonly uri: URI;
	/**
	 * Optional externally provided prompt command name.
	 */
	readonly name?: string;
	/**
	 * Optional externally provided prompt command description.
	 */
	readonly description?: string;
	/**
	 * Optional condition that must evaluate to true for this resource to be offered.
	 */
	readonly when?: string;
	/**
	 * Optional session types that describe when this resource should be offered.
	 */
	readonly sessionTypes?: readonly string[];
}

/**
 * Returns whether a customization can be used in the provided chat session type.
 */
export function matchesSessionType(sessionTypes: readonly string[] | undefined, currentSessionType: string | undefined): boolean {
	return sessionTypes === undefined || currentSessionType === undefined || sessionTypes.includes(currentSessionType);
}

/**
 * Provides prompt services.
 */
export const IPromptsService = createDecorator<IPromptsService>('IPromptsService');

/**
 * Where the prompt is stored.
 */
export enum PromptsStorage {
	local = 'local',
	user = 'user',
	extension = 'extension',
	plugin = 'plugin',
}

/**
 * Represents a prompt path with its type.
 * This is used for both prompt files and prompt source folders.
 */
export type IPromptPath = IExtensionPromptPath | ILocalPromptPath | IUserPromptPath | IPluginPromptPath;


export interface IPromptPathBase {
	/**
	 * URI of the prompt.
	 */
	readonly uri: URI;

	/**
	 * Storage of the prompt.
	 */
	readonly storage: PromptsStorage;

	/**
	 * Type of the prompt (e.g. 'prompt' or 'instructions').
	 */
	readonly type: PromptsType;

	/**
	 * Identifier of the contributing extension (only when storage === PromptsStorage.extension).
	 */
	readonly extension?: IExtensionDescription;

	/**
	 * Identifier of the contributing plugin (only when storage === PromptsStorage.plugin).
	 */
	readonly pluginUri?: URI;

	/**
	 * The source that produced this prompt path.
	 */
	readonly source?: PromptFileSource;

	readonly name?: string;

	readonly description?: string;

	/**
	 * Optional session types that describe when this resource should be offered.
	 */
	readonly sessionTypes?: readonly string[];
}

export interface IExtensionPromptPath extends IPromptPathBase {
	readonly storage: PromptsStorage.extension;
	readonly extension: IExtensionDescription;
	readonly source: PromptFileSource.ExtensionContribution | PromptFileSource.ExtensionAPI;
	readonly name?: string;
	readonly description?: string;
	readonly when?: string;
}

export function isExtensionPromptPath(obj: IPromptPath): obj is IExtensionPromptPath {
	return obj.storage === PromptsStorage.extension;
}

export interface ILocalPromptPath extends IPromptPathBase {
	readonly storage: PromptsStorage.local;
}
export interface IUserPromptPath extends IPromptPathBase {
	readonly storage: PromptsStorage.user;
}

export interface IPluginPromptPath extends IPromptPathBase {
	readonly storage: PromptsStorage.plugin;
	readonly pluginUri: URI;
	readonly source: PromptFileSource.Plugin;
}

export type IAgentSource = {
	readonly storage: PromptsStorage.extension;
	readonly extensionId: ExtensionIdentifier;
} | {
	readonly storage: PromptsStorage.local | PromptsStorage.user;
} | {
	readonly storage: PromptsStorage.plugin;
	readonly pluginUri: URI;
};

/**
 * The visibility/availability of an agent.
 * - 'all': available as custom agent in picker AND can be used as subagent
 * - 'user': only available in the custom agent picker
 * - 'agent': only usable as subagent by the subagent tool
 * - 'hidden': neither in picker nor usable as subagent
 */
export type ICustomAgentVisibility = {
	readonly userInvocable: boolean;
	readonly agentInvocable: boolean;
};

export function isCustomAgentVisibility(obj: unknown): obj is ICustomAgentVisibility {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const v = obj as { userInvocable?: unknown; agentInvocable?: unknown };
	return typeof v.userInvocable === 'boolean' && typeof v.agentInvocable === 'boolean';
}

export interface ICustomAgent {
	/**
	 * URI of a custom agent file.
	 */
	readonly uri: URI;

	/**
	 * Name of the custom agent as used in prompt files or contexts
	 */
	readonly name: string;

	/**
	 * Description of the agent
	 */
	readonly description?: string;

	/**
	 * Tools metadata in the prompt header.
	 */
	readonly tools?: readonly string[];

	/**
	 * Model metadata in the prompt header.
	 */
	readonly model?: readonly string[];

	/**
	 * Argument hint metadata in the prompt header that describes what inputs the agent expects or supports.
	 */
	readonly argumentHint?: string;

	/**
	 * Target of the agent: Copilot, VSCode, Claude, or undefined if not specified.
	 */
	readonly target: Target;

	/**
	 * What visibility the agent has (user invocable, subagent invocable).
	 */
	readonly visibility: ICustomAgentVisibility;

	/**
	 * Contents of the custom agent file body and other agent instructions.
	 */
	readonly agentInstructions: IChatModeInstructions;

	/**
	 * Hand-offs defined in the custom agent file.
	 */
	readonly handOffs?: readonly IHandOff[];

	/**
	 * List of subagent names that can be used by the agent.
	 * If empty, no subagents are available. If ['*'] or undefined, all agents can be used.
	 */
	readonly agents?: readonly string[];

	/**
	 * Lifecycle hooks scoped to this subagent.
	 */
	readonly hooks?: ChatRequestHooks;

	/**
	 * Where the agent was loaded from.
	 */
	readonly source: IAgentSource;

	/**
	 * Optional session types that describe when this agent should be offered.
	 */
	readonly sessionTypes?: readonly string[];

	/**
	 * Whether this agent is enabled. Disabled agents are included in the list
	 * but should not be offered to users or used in automated flows.
	 */
	readonly enabled: boolean;
}

export interface IAgentInstructions {
	readonly content: string;
	readonly toolReferences: readonly IVariableReference[];
	readonly metadata?: Record<string, boolean | string | number>;
}

export interface IChatPromptSlashCommand {
	readonly uri: URI;
	readonly name: string;
	readonly type: PromptsType;
	readonly storage: PromptsStorage;
	readonly source?: PromptFileSource;
	readonly description?: string;
	readonly argumentHint?: string;
	readonly userInvocable: boolean;
	readonly extension?: IExtensionDescription;
	readonly pluginUri?: URI;
	/**
	 * Optional session types that describe when this slash command should be offered.
	 */
	readonly sessionTypes?: readonly string[];
}

export interface IResolvedChatPromptSlashCommand extends IChatPromptSlashCommand {
	readonly parsedPromptFile: ParsedPromptFile;
}


/**
 * A fully resolved instruction file with parsed header metadata and provenance information.
 */
export interface IInstructionFile {
	/**
	 * URI of the instruction file.
	 */
	readonly uri: URI;
	/**
	 * Name as listed in the instruction file header or derived from the file name
	 */
	readonly name: string;
	/**
	 * Description as listed in the instruction file header. Used to load the instruction on-demand and for display in the UI.
	 */
	readonly description: string | undefined;
	/**
	 * Storage of the prompt.
	 */
	readonly storage: PromptsStorage;
	/**
	 * The "applyTo" pattern (or `paths` when in a Claude rules file) from the instruction file header.
	 * Describes when this instruction file should be applied.
	 */
	readonly pattern: string | undefined;
	/**
	 * Identifier of the contributing extension (only when storage === PromptsStorage.extension).
	 */
	readonly extension?: IExtensionDescription;

	/**
	 * Identifier of the contributing plugin (only when storage === PromptsStorage.plugin).
	 */
	readonly pluginUri?: URI;

	/**
	 * The source that produced this prompt path.
	 */
	readonly source?: PromptFileSource;

	/**
	 * Optional session types that describe when this instruction should be offered.
	 */
	readonly sessionTypes?: readonly string[];
}

/**
 * Supply-chain metadata describing where a skill originated.
 */
export interface IAgentSkill {
	readonly uri: URI;
	readonly storage: PromptsStorage;
	readonly name: string;
	readonly description: string | undefined;
	/**
	 * If true, the skill should not be automatically loaded by the agent.
	 * Use for workflows you want to trigger manually with /name.
	 */
	readonly disableModelInvocation: boolean;
	/**
	 * If false, the skill is hidden from the / menu.
	 * Use for background knowledge users shouldn't invoke directly.
	 */
	readonly userInvocable: boolean;
	/**
	 * Optional plugin URI describing where this skill originated.
	 */
	readonly pluginUri?: URI;
	/**
	 * Optional extension metadata describing where this skill originated.
	 */
	readonly extension?: IExtensionDescription;
	/**
	 * Optional session types that describe when this skill should be offered.
	 */
	readonly sessionTypes?: readonly string[];
}

/**
 * Type of agent instruction file.
 */
export enum AgentInstructionFileType {
	agentsMd = 'agentsMd',
	claudeMd = 'claudeMd',
	copilotInstructionsMd = 'copilotInstructionsMd',
}

/**
 * Represents a resolved agent instruction file with its real path for duplicate detection.
 * Used by listAgentInstructions to filter out symlinks pointing to the same file.
 */
export interface IAgentInstructionFile {
	readonly uri: URI;
	/**
	 * The real path of the file, if it is a symlink.
	 */
	readonly realPath: URI | undefined;
	readonly type: AgentInstructionFileType;
}

export interface Logger {
	logInfo(message: string): void;
}

/**
 * Reason why a prompt file was skipped during discovery.
 */
export type PromptFileSkipReason =
	| 'missing-name'
	| 'missing-description'
	| 'name-mismatch'
	| 'duplicate-name'
	| 'parse-error'
	| 'disabled'
	| 'all-hooks-disabled'
	| 'claude-hooks-disabled'
	| 'workspace-untrusted';

/**
 * Result of discovering a single prompt file.
 */
export interface IPromptFileDiscoveryResult {
	readonly status: 'loaded' | 'skipped';
	readonly skipReason?: PromptFileSkipReason;
	/** Error message if parse-error */
	readonly errorMessage?: string;
	/** For duplicates, the URI of the file that took precedence */
	readonly duplicateOf?: URI;
	/** Prompt path for the discovered file. */
	readonly promptPath: IPromptPath;
	/** Whether the skill is user-invocable in the / menu (set user-invocable: false to hide it) */
	readonly userInvocable?: boolean;
	/** If true, the skill won't be automatically loaded by the agent (disable-model-invocation: true) */
	readonly disableModelInvocation?: boolean;
}

/**
 * Diagnostic information about a source folder that was searched during discovery.
 */
export interface IPromptSourceFolderResult {
	readonly uri: URI;
	readonly storage: PromptsStorage;
}

/**
 * Summary of prompt file discovery for a specific type.
 */
export interface IPromptDiscoveryInfo {
	readonly type: PromptsType;
	readonly files: readonly IPromptFileDiscoveryResult[];
	/** Time in milliseconds required to compute this discovery result. */
	readonly durationInMillis: number;
	/** Source folders that were searched */
	readonly sourceFolders?: readonly IPromptSourceFolderResult[];
}

/**
 * Discovery result for a slash command file, including the parsed prompt file.
 */
export interface ISlashCommandDiscoveryResult extends IPromptFileDiscoveryResult {
	readonly userInvocable?: boolean;
	readonly argumentHint?: string;
}

/**
 * Summary of slash command discovery, including parsed prompt files.
 */
export interface ISlashCommandDiscoveryInfo extends IPromptDiscoveryInfo {
	readonly files: readonly ISlashCommandDiscoveryResult[];
}

/**
 * Discovery result for an instruction file, including the resolved applyTo metadata.
 */
export interface IInstructionDiscoveryResult extends IPromptFileDiscoveryResult {
	readonly pattern?: string;
}

/**
 * Summary of instruction discovery, including resolved metadata.
 */
export interface IInstructionDiscoveryInfo extends IPromptDiscoveryInfo {
	readonly files: readonly IInstructionDiscoveryResult[];
}

/**
 * Discovery result for an agent file, including the fully resolved agent.
 */
export interface IAgentDiscoveryResult extends IPromptFileDiscoveryResult {
	readonly agent?: ICustomAgent;
}

/**
 * Summary of agent discovery, including resolved agents.
 */
export interface IAgentDiscoveryInfo extends IPromptDiscoveryInfo {
	readonly files: readonly IAgentDiscoveryResult[];
}

export interface IConfiguredHooksInfo {
	readonly hooks: ChatRequestHooks;
	readonly hasDisabledClaudeHooks: boolean;
}

/**
 * Summary of hook discovery, including the resolved hooks info.
 */
export interface IHookDiscoveryInfo extends IPromptDiscoveryInfo {
	readonly hooksInfo: IConfiguredHooksInfo | undefined;
}

/**
 * Provides prompt services.
 */
export interface IPromptsService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * The parsed prompt file for the provided text model.
	 * @param textModel Returns the parsed prompt file.
	 */
	getParsedPromptFile(textModel: ITextModel): ParsedPromptFile;

	/**
	 * List all available prompt files.
	 */
	listPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IPromptPath[]>;

	/**
	 * List all available prompt files.
	 */
	listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, token: CancellationToken): Promise<readonly IPromptPath[]>;

	/**
	 * Get a list of prompt source folders based on the provided prompt type.
	 */
	getSourceFolders(type: PromptsType): Promise<readonly IPromptPath[]>;

	/**
	 * Get a list of resolved prompt source folders with full metadata.
	 * This includes displayPath, isDefault, and storage information.
	 * Used for diagnostics and config-info displays.
	 */
	getResolvedSourceFolders(type: PromptsType): Promise<readonly IResolvedPromptSourceFolder[]>;

	/**
	 * Validates if the provided command name is a valid prompt slash command.
	 */
	isValidSlashCommandName(name: string): boolean;

	/**
	 * Gets the prompt file for a slash command.
	 */
	resolvePromptSlashCommand(command: string, sessionType: string | undefined, token: CancellationToken): Promise<IResolvedChatPromptSlashCommand | undefined>;

	/**
	 * Event that is triggered when the slash command to ParsedPromptFile cache is updated.
	 * Event handlers can use {@link resolvePromptSlashCommand} to retrieve the latest data.
	 */
	readonly onDidChangeSlashCommands: Event<void>;

	/**
	 * Returns a prompt command if the command name is valid.
	 */
	getPromptSlashCommands(token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]>;

	/**
	 * Returns the prompt command name for the given URI.
	 */
	getPromptSlashCommandName(uri: URI, token: CancellationToken): Promise<string>;

	/**
	 * Event that is triggered when the list of custom agents changes.
	 */
	readonly onDidChangeCustomAgents: Event<void>;

	/**
	 * Event that is triggered when the list of instruction files changes.
	 */
	readonly onDidChangeInstructions: Event<void>;

	/**
	 * Finds all available custom agents
	 */
	getCustomAgents(token: CancellationToken): Promise<readonly ICustomAgent[]>;

	/**
	 * Parses the provided URI
	 * @param uris
	 */
	parseNew(uri: URI, token: CancellationToken): Promise<ParsedPromptFile>;

	/**
	 * Internal: register a contributed file. Returns a disposable that removes the contribution.
	 * Not intended for extension authors; used by contribution point handler.
	 */
	registerContributedFile(type: PromptsType, uri: URI, extension: IExtensionDescription, name: string | undefined, description: string | undefined, when?: string, sessionTypes?: readonly string[]): IDisposable;


	getPromptLocationLabel(promptPath: IPromptPath): string;

	/**
	 * Gets list of AGENTS.md files, including optionally nested ones from subfolders.
	 */
	listNestedAgentMDs(token: CancellationToken): Promise<IAgentInstructionFile[]>;

	/**
	 * Gets combined list of agent instruction files (AGENTS.md, CLAUDE.md, copilot-instructions.md).
	 * Combines results from listAgentMDs (non-nested), listClaudeMDs, and listCopilotInstructionsMDs.
	 */
	listAgentInstructions(token: CancellationToken, logger?: Logger): Promise<IAgentInstructionFile[]>;

	/**
	 * For a chat mode file URI, return the name of the agent file that it should use.
	 * @param oldURI
	 */
	getAgentFileURIFromModeFile(oldURI: URI): URI | undefined;

	/**
	 * Returns the list of disabled prompt file URIs for a given type. By default no prompt files are disabled.
	 */
	getDisabledPromptFiles(type: PromptsType): ResourceSet;

	/**
	 * Persists the set of disabled prompt file URIs for the given type.
	 */
	setDisabledPromptFiles(type: PromptsType, uris: ResourceSet): void;

	/**
	 * Registers a prompt file provider that can provide prompt files for repositories.
	 * @param extension The extension registering the provider.
	 * @param type The type of contribution.
	 * @param provider The provider implementation with optional change event.
	 * @returns A disposable that unregisters the provider when disposed.
	 */
	registerPromptFileProvider(extension: IExtensionDescription, type: PromptsType, provider: {
		onDidChangePromptFiles?: Event<void>;
		providePromptFiles: (context: IPromptFileContext, token: CancellationToken) => Promise<IPromptFileResource[] | undefined>;
	}): IDisposable;

	/**
	 * Gets list of agent skills files.
	 */
	findAgentSkills(token: CancellationToken): Promise<IAgentSkill[] | undefined>;

	/**
	 * Event that is triggered when the list of skills changes.
	 */
	readonly onDidChangeSkills: Event<void>;

	/**
	 * Event that is triggered when the effective hook availability or configuration changes.
	 */
	readonly onDidChangeHooks: Event<void>;

	/**
	 * Gets all hooks collected from hooks.json files.
	 * The result is cached and invalidated when the effective hook availability or configuration changes.
	 */
	getHooks(token: CancellationToken): Promise<IConfiguredHooksInfo | undefined>;

	/**
	 * Gets all instruction files
	 */
	getInstructionFiles(token: CancellationToken): Promise<readonly IInstructionFile[]>;

	/**
	 * Returns the cached discovery info for the given prompt type.
	 */
	getDiscoveryInfo(type: PromptsType, token: CancellationToken): Promise<IPromptDiscoveryInfo>;
}
