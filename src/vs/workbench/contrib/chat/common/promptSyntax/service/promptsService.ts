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
	readonly name: string;
	readonly description: string;
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
	 * Returns a prompt command if the command name.
	 * Undefined is returned if the name does not look like a file name of a prompt file.
	 */
	asPromptSlashCommand(name: string): IChatPromptSlashCommand | undefined;

	/**
	 * Gets the prompt file for a slash command.
	 */
	resolvePromptSlashCommand(data: IChatPromptSlashCommand, _token: CancellationToken): Promise<ParsedPromptFile | undefined>;

	/**
	 * Gets the prompt file for a slash command from cache if available.
	 * @param command - name of the prompt command without slash
	 */
	resolvePromptSlashCommandFromCache(command: string): ParsedPromptFile | undefined;

	/**
	 * Event that is triggered when slash command -> ParsedPromptFile cache is updated.
	 * Event handler can call resolvePromptSlashCommandFromCache in case there is new value populated.
	 */
	readonly onDidChangeParsedPromptFilesCache: Event<void>;

	/**
	 * Returns a prompt command if the command name is valid.
	 */
	findPromptSlashCommands(): Promise<IChatPromptSlashCommand[]>;

	/**
	 * Returns the prompt command name for the given URI.
	 */
	getPromptCommandName(uri: URI): Promise<string>;

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
	 * Returns the prompt file type for the given URI.
	 * @param resource the URI of the resource
	 */
	getPromptFileType(resource: URI): PromptsType | undefined;

	/**
	 * Internal: register a contributed file. Returns a disposable that removes the contribution.
	 * Not intended for extension authors; used by contribution point handler.
	 */
	registerContributedFile(type: PromptsType, name: string, description: string, uri: URI, extension: IExtensionDescription): IDisposable;


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
}

export interface IChatPromptSlashCommand {
	readonly command: string;
	readonly detail: string;
	readonly promptPath?: IPromptPath;
}
