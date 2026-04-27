/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatCustomAgent, ChatHook, ChatInstruction, ChatPlugin, ChatSkill, ChatSlashCommand } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { ParsedPromptFile } from '../../../util/vs/workbench/contrib/chat/common/promptSyntax/promptFileParser';

export * from '../../../util/vs/workbench/contrib/chat/common/promptSyntax/promptFileParser';

export const IPromptsService = createServiceIdentifier<IPromptsService>('IPromptsService');

export namespace PromptFileLangageId {
	export const prompt = 'prompt';
	export const instructions = 'instructions';
	export const agent = 'chatagent';
}

/**
 * A service that provides prompt file related functionalities: agents, instructions and prompt files.
 */
export interface IPromptsService {
	readonly _serviceBrand: undefined;
	/**
	 * Reads and parses the provided URI
	 * @param uris
	 */
	parseFile(uri: URI, token: CancellationToken): Promise<ParsedPromptFile>;

	/**
	 * An event that fires when the list of {@link customAgents custom agents} changes.
	 */
	readonly onDidChangeCustomAgents: Event<void>;

	/**
	 * The list of currently available custom agents. These are `.agent.md` files
	 * from all sources (workspace, user, and extension-provided).
	 */
	getCustomAgents(token: CancellationToken): Promise<readonly ChatCustomAgent[]>;

	/**
	 * Returns the slash command prompt files. These are prompts and skills
	 * from all sources (workspace, user, and extension-provided).
	 */
	getSlashCommands(token: CancellationToken): Promise<readonly ChatSlashCommand[]>;

	/**
	 * An event that fires when the list of {@link instructions instructions} changes.
	 */
	readonly onDidChangeInstructions: Event<void>;

	/**
	 * The list of currently available instructions. These are `.instructions.md` files
	 * from all sources (workspace, user, and extension-provided).
	 */
	getInstructions(token: CancellationToken): Promise<readonly ChatInstruction[]>;

	/**
	 * An event that fires when the list of {@link skills skills} changes.
	 */
	readonly onDidChangeSkills: Event<void>;

	/**
	 * The list of currently available skills. These are `SKILL.md` files
	 * from all sources (workspace, user, and extension-provided).
	 */
	getSkills(token: CancellationToken): Promise<readonly ChatSkill[]>;

	/**
	 * An event that fires when the list of {@link hooks hooks} changes.
	 */
	readonly onDidChangeHooks: Event<void>;

	/**
	 * The list of currently available hook configuration files.
	 * These are JSON files that define lifecycle hooks from all sources
	 * (workspace, user, and extension-provided).
	 */
	getHooks(token: CancellationToken): Promise<readonly ChatHook[]>;

	/**
	 * An event that fires when the list of {@link plugins plugins} changes.
	 */
	readonly onDidChangePlugins: Event<void>;

	/**
	 * The list of currently installed agent plugins.
	 */
	getPlugins(token: CancellationToken): Promise<readonly ChatPlugin[]>;


}
