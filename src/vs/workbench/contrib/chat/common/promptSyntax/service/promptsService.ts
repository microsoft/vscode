/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatModeKind } from '../../constants.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Event } from '../../../../../../base/common/event.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { PromptsType } from '../promptTypes.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { YamlNode, YamlParseError } from '../../../../../../base/common/yaml.js';
import { IChatModeInstructions } from '../../chatModes.js';
import { ParsedPromptFile } from './newPromptsParser.js';

/**
 * Provides prompt services.
 */
export const IPromptsService = createDecorator<IPromptsService>('IPromptsService');

/**
 * Where the prompt is stored.
 */
export type TPromptsStorage = 'local' | 'user';

/**
 * Represents a prompt path with its type.
 * This is used for both prompt files and prompt source folders.
 */
export interface IPromptPath {
	/**
	 * URI of the prompt.
	 */
	readonly uri: URI;

	/**
	 * Storage of the prompt.
	 */
	readonly storage: TPromptsStorage;

	/**
	 * Type of the prompt (e.g. 'prompt' or 'instructions').
	 */
	readonly type: PromptsType;
}


export interface ICustomChatMode {
	/**
	 * URI of a custom chat mode file.
	 */
	readonly uri: URI;

	/**
	 * Name of the custom chat mode as used in prompt files or contexts
	 */
	readonly name: string;

	/**
	 * Description of the mode
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
	 * Contents of the custom chat mode file body and other mode instructions.
	 */
	readonly modeInstructions: IChatModeInstructions;
}

/**
 * Type of combined tools metadata for the case
 * when the prompt is in the agent mode.
 */
interface ICombinedAgentToolsMetadata {
	/**
	 * List of combined tools metadata for
	 * the entire tree of prompt references.
	 */
	readonly tools: readonly string[] | undefined;

	/**
	 * Resulting chat mode of a prompt, based on modes
	 * used in the entire tree of prompt references.
	 */
	readonly mode: ChatModeKind.Agent;
}

/**
 * Type of combined tools metadata for the case
 * when the prompt is in non-agent mode.
 */
interface ICombinedNonAgentToolsMetadata {
	/**
	 * List of combined tools metadata is empty
	 * when the prompt is in non-agent mode.
	 */
	readonly tools: undefined;

	/**
	 * Resulting chat mode of a prompt, based on modes
	 * used in the entire tree of prompt references.
	 */
	readonly mode?: ChatModeKind.Ask | ChatModeKind.Edit;
}

/**
 * General type of the combined tools metadata.
 */
export type TCombinedToolsMetadata = ICombinedAgentToolsMetadata | ICombinedNonAgentToolsMetadata;

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
	 * Returns a prompt command if the command name is valid.
	 */
	findPromptSlashCommands(): Promise<IChatPromptSlashCommand[]>;

	/**
	 * Event that is triggered when the list of custom chat modes changes.
	 */
	readonly onDidChangeCustomChatModes: Event<void>;

	/**
	 * Finds all available custom chat modes
	 */
	getCustomChatModes(token: CancellationToken): Promise<readonly ICustomChatMode[]>;

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
}

export interface IChatPromptSlashCommand {
	readonly command: string;
	readonly detail: string;
	readonly promptPath?: IPromptPath;
}

export interface IPromptHeader {
	readonly node: YamlNode | undefined;
	readonly errors: YamlParseError[];
}
