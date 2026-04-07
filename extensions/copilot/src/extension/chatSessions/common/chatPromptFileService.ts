/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatResource } from 'vscode';
import { ParsedPromptFile } from '../../../platform/promptFiles/common/promptsService';
import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';

export const IChatPromptFileService = createServiceIdentifier<IChatPromptFileService>('IChatPromptFileService');

export interface IChatPromptFileService extends IDisposable {
	readonly _serviceBrand: undefined;
	/**
	 * An event that fires when the list of {@link customAgents custom agents} changes.
	 */
	readonly onDidChangeCustomAgents: Event<void>;

	/**
	 * The list of currently available custom agents. These are `.agent.md` files
	 * from all sources (workspace, user, and extension-provided).
	 */
	readonly customAgents: readonly ChatResource[];

	/**
	 * Returns the parsed prompt files for the custom agent.
	 */
	readonly customAgentPromptFiles: readonly ParsedPromptFile[];

	/**
	 * An event that fires when the list of {@link instructions instructions} changes.
	 */
	readonly onDidChangeInstructions: Event<void>;

	/**
	 * The list of currently available instructions. These are `.instructions.md` files
	 * from all sources (workspace, user, and extension-provided).
	 */
	readonly instructions: readonly ChatResource[];

	/**
	 * An event that fires when the list of {@link skills skills} changes.
	 */
	readonly onDidChangeSkills: Event<void>;

	/**
	 * The list of currently available skills. These are `SKILL.md` files
	 * from all sources (workspace, user, and extension-provided).
	 */
	readonly skills: readonly ChatResource[];

	/**
	 * An event that fires when the list of {@link hooks hooks} changes.
	 */
	readonly onDidChangeHooks: Event<void>;

	/**
	 * The list of currently available hook configuration files.
	 * These are JSON files that define lifecycle hooks from all sources
	 * (workspace, user, and extension-provided).
	 */
	readonly hooks: readonly ChatResource[];

	/**
	 * An event that fires when the list of {@link plugins plugins} changes.
	 */
	readonly onDidChangePlugins: Event<void>;

	/**
	 * The list of currently installed agent plugins.
	 */
	readonly plugins: readonly ChatResource[];
}
