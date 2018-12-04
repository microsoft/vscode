/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IStringDictionary } from 'vs/base/common/collections';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

export const IConfigurationResolverService = createDecorator<IConfigurationResolverService>('configurationResolverService');

export interface IConfigurationResolverService {
	_serviceBrand: any;

	resolve(folder: IWorkspaceFolder, value: string): string;
	resolve(folder: IWorkspaceFolder, value: string[]): string[];
	resolve(folder: IWorkspaceFolder, value: IStringDictionary<string>): IStringDictionary<string>;

	/**
	 * Recursively resolves all variables in the given config and returns a copy of it with substituted values.
	 * Command variables are only substituted if a "commandValueMapping" dictionary is given and if it contains an entry for the command.
	 */
	resolveAny(folder: IWorkspaceFolder, config: any, commandValueMapping?: IStringDictionary<string>): any;

	/**
	 * Recursively resolves all variables (including commands and user input) in the given config and returns a copy of it with substituted values.
	 * If a "variables" dictionary (with names -> command ids) is given, command variables are first mapped through it before being resolved.
	 * @param folder
	 * @param config
	 * @param section For example, 'tasks' or 'debug'. Used for resolving inputs.
	 * @param variables Aliases for commands.
	 */
	resolveWithInteractionReplace(folder: IWorkspaceFolder, config: any, section?: string, variables?: IStringDictionary<string>): TPromise<any>;

	/**
	 * Similar to resolveWithInteractionReplace, except without the replace. Returns a map of variables and their resolution.
	 * Keys in the map will be of the format input:variableName or command:variableName.
	 */
	resolveWithInteraction(folder: IWorkspaceFolder, config: any, section?: string, variables?: IStringDictionary<string>): TPromise<Map<string, string>>;
}

export const enum ConfiguredInputType {
	Prompt,
	Pick
}

export interface ConfiguredInput {
	label: string;
	description: string;
	default?: string;
	type: ConfiguredInputType;
	options?: string[];
}