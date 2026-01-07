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
import { PromptsType } from '../promptTypes.js';
import { IHandOff, ParsedPromptFile } from '../promptFileParser.js';
import { ResourceSet } from '../../../../../../base/common/map.js';

/**
 * Activation event for custom agent providers.
 */
export const CUSTOM_AGENTS_PROVIDER_ACTIVATION_EVENT = 'onCustomAgentsProvider';

/**
 * Options for querying custom agents.
 */
export interface ICustomAgentQueryOptions { }

/**
 * Represents a custom agent resource from an external provider.
 */
export interface IExternalCustomAgent {
	/**
	 * The unique identifier/name of the custom agent resource.
	 */
	readonly name: string;

	/**
	 * A description of what the custom agent resource does.
	 */
	readonly description: string;

	/**
	 * The URI to the agent or prompt resource file.
	 */
	readonly uri: URI;

	/**
	 * Indicates whether the custom agent resource is editable. Defaults to false.
	 */
	readonly isEditable?: boolean;
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
	extension = 'extension'
}

/**
 * The type of source for extension agents.
 */
export enum ExtensionAgentSourceType {
	contribution = 'contribution',
	provider = 'provider',
}

/**
 * Represents a prompt path with its type.
 * This is used for both prompt files and prompt source folders.
 */
export type IPromptPath = IExtensionPromptPath | ILocalPromptPath | IUserPromptPath;


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

	readonly name?: string;

	readonly description?: string;
}

export interface IExtensionPromptPath extends IPromptPathBase {
	readonly storage: PromptsStorage.extension;
	readonly extension: IExtensionDescription;
	readonly source: ExtensionAgentSourceType;
	readonly name?: string;
	readonly description?: string;
}
export interface ILocalPromptPath extends IPromptPathBase {
	readonly storage: PromptsStorage.local;
}
export interface IUserPromptPath extends IPromptPathBase {
	readonly storage: PromptsStorage.user;
}

export type IAgentSource = {
	readonly storage: PromptsStorage.extension;
	readonly extensionId: ExtensionIdentifier;
	readonly type: ExtensionAgentSourceType;
} | {
	readonly storage: PromptsStorage.local | PromptsStorage.user;
};

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
	readonly model?: string;

	/**
	 * Argument hint metadata in the prompt header that describes what inputs the agent expects or supports.
	 */
	readonly argumentHint?: string;

	/**
	 * Target metadata in the prompt header.
	 */
	readonly target?: string;

	/**
	 * Infer metadata in the prompt header.
	 */
	readonly infer?: boolean;

	/**
	 * Contents of the custom agent file body and other agent instructions.
	 */
	readonly agentInstructions: IChatModeInstructions;

	/**
	 * Hand-offs defined in the custom agent file.
	 */
	readonly handOffs?: readonly IHandOff[];

	/**
	 * Where the agent was loaded from.
	 */
	readonly source: IAgentSource;
}

export interface IAgentInstructions {
	readonly content: string;
	readonly toolReferences: readonly IVariableReference[];
	readonly metadata?: Record<string, boolean | string | number>;
}

export interface IChatPromptSlashCommand {
	readonly name: string;
	readonly description: string | undefined;
	readonly argumentHint: string | undefined;
	readonly promptPath: IPromptPath;
	readonly parsedPromptFile: ParsedPromptFile;
}

export interface IAgentSkill {
	readonly uri: URI;
	readonly type: 'personal' | 'project';
	readonly name: string;
	readonly description: string | undefined;
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
	getSourceFolders(type: PromptsType): readonly IPromptPath[];

	/**
	 * Validates if the provided command name is a valid prompt slash command.
	 */
	isValidSlashCommandName(name: string): boolean;

	/**
	 * Gets the prompt file for a slash command.
	 */
	resolvePromptSlashCommand(command: string, token: CancellationToken): Promise<IChatPromptSlashCommand | undefined>;

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
	registerContributedFile(type: PromptsType, uri: URI, extension: IExtensionDescription, name: string | undefined, description: string | undefined): IDisposable;


	getPromptLocationLabel(promptPath: IPromptPath): string;

	/**
	 * Gets list of all AGENTS.md files in the workspace.
	 */
	findAgentMDsInWorkspace(token: CancellationToken): Promise<URI[]>;

	/**
	 * Gets list of AGENTS.md files.
	 * @param includeNested Whether to include AGENTS.md files from subfolders, or only from the root.
	 */
	listAgentMDs(token: CancellationToken, includeNested: boolean): Promise<URI[]>;

	/**
	 * Gets list of .github/copilot-instructions.md files.
	 */
	listCopilotInstructionsMDs(token: CancellationToken): Promise<URI[]>;

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
	 * Registers a CustomAgentsProvider that can provide custom agents for repositories.
	 * This is part of the proposed API and requires the chatParticipantPrivate proposal.
	 * @param extension The extension registering the provider.
	 * @param provider The provider implementation with optional change event.
	 * @returns A disposable that unregisters the provider when disposed.
	 */
	registerCustomAgentsProvider(extension: IExtensionDescription, provider: {
		onDidChangeCustomAgents?: Event<void>;
		provideCustomAgents: (options: ICustomAgentQueryOptions, token: CancellationToken) => Promise<IExternalCustomAgent[] | undefined>;
	}): IDisposable;

	/**
	 * Gets list of agent skills files.
	 */
	findAgentSkills(token: CancellationToken): Promise<IAgentSkill[] | undefined>;
}
