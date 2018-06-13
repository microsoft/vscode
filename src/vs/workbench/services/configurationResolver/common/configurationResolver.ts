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
	 * Recursively resolves all variables (including commands) in the given config and returns a copy of it with substituted values.
	 * If a "variables" dictionary (with names -> command ids) is given,
	 * command variables are first mapped through it before being resolved.
	 */
	resolveWithCommands(folder: IWorkspaceFolder, config: any, variables?: IStringDictionary<string>): TPromise<any>;
}
