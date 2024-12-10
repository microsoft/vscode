/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IProcessEnvironment } from '../../../../base/common/platform.js';
import { ErrorNoTelemetry } from '../../../../base/common/errors.js';

export const IConfigurationResolverService = createDecorator<IConfigurationResolverService>('configurationResolverService');

export interface IConfigurationResolverService {
	readonly _serviceBrand: undefined;

	resolveWithEnvironment(environment: IProcessEnvironment, folder: IWorkspaceFolder | undefined, value: string): Promise<string>;

	resolveAsync(folder: IWorkspaceFolder | undefined, value: string): Promise<string>;
	resolveAsync(folder: IWorkspaceFolder | undefined, value: string[]): Promise<string[]>;
	resolveAsync(folder: IWorkspaceFolder | undefined, value: IStringDictionary<string>): Promise<IStringDictionary<string>>;

	/**
	 * Recursively resolves all variables in the given config and returns a copy of it with substituted values.
	 * Command variables are only substituted if a "commandValueMapping" dictionary is given and if it contains an entry for the command.
	 */
	resolveAnyAsync(folder: IWorkspaceFolder | undefined, config: any, commandValueMapping?: IStringDictionary<string>): Promise<any>;

	/**
	 * Recursively resolves all variables in the given config.
	 * Returns a copy of it with substituted values and a map of variables and their resolution.
	 * Keys in the map will be of the format input:variableName or command:variableName.
	 */
	resolveAnyMap(folder: IWorkspaceFolder | undefined, config: any, commandValueMapping?: IStringDictionary<string>): Promise<{ newConfig: any; resolvedVariables: Map<string, string> }>;

	/**
	 * Recursively resolves all variables (including commands and user input) in the given config and returns a copy of it with substituted values.
	 * If a "variables" dictionary (with names -> command ids) is given, command variables are first mapped through it before being resolved.
	 *
	 * @param section For example, 'tasks' or 'debug'. Used for resolving inputs.
	 * @param variables Aliases for commands.
	 */
	resolveWithInteractionReplace(folder: IWorkspaceFolder | undefined, config: any, section?: string, variables?: IStringDictionary<string>, target?: ConfigurationTarget): Promise<any>;

	/**
	 * Similar to resolveWithInteractionReplace, except without the replace. Returns a map of variables and their resolution.
	 * Keys in the map will be of the format input:variableName or command:variableName.
	 */
	resolveWithInteraction(folder: IWorkspaceFolder | undefined, config: any, section?: string, variables?: IStringDictionary<string>, target?: ConfigurationTarget): Promise<Map<string, string> | undefined>;

	/**
	 * Contributes a variable that can be resolved later. Consumers that use resolveAny, resolveWithInteraction,
	 * and resolveWithInteractionReplace will have contributed variables resolved.
	 */
	contributeVariable(variable: string, resolution: () => Promise<string | undefined>): void;
}

interface PromptStringInputInfo {
	id: string;
	type: 'promptString';
	description: string;
	default?: string;
	password?: boolean;
}

interface PickStringInputInfo {
	id: string;
	type: 'pickString';
	description: string;
	options: (string | { value: string; label?: string })[];
	default?: string;
}

interface CommandInputInfo {
	id: string;
	type: 'command';
	command: string;
	args?: any;
}

export type ConfiguredInput = PromptStringInputInfo | PickStringInputInfo | CommandInputInfo;

export enum VariableKind {
	Unknown = 'unknown',

	Env = 'env',
	Config = 'config',
	Command = 'command',
	Input = 'input',
	ExtensionInstallFolder = 'extensionInstallFolder',

	WorkspaceFolder = 'workspaceFolder',
	Cwd = 'cwd',
	WorkspaceFolderBasename = 'workspaceFolderBasename',
	UserHome = 'userHome',
	LineNumber = 'lineNumber',
	ColumnNumber = 'columnNumber',
	SelectedText = 'selectedText',
	File = 'file',
	FileWorkspaceFolder = 'fileWorkspaceFolder',
	FileWorkspaceFolderBasename = 'fileWorkspaceFolderBasename',
	RelativeFile = 'relativeFile',
	RelativeFileDirname = 'relativeFileDirname',
	FileDirname = 'fileDirname',
	FileExtname = 'fileExtname',
	FileBasename = 'fileBasename',
	FileBasenameNoExtension = 'fileBasenameNoExtension',
	FileDirnameBasename = 'fileDirnameBasename',
	ExecPath = 'execPath',
	ExecInstallFolder = 'execInstallFolder',
	PathSeparator = 'pathSeparator',
	PathSeparatorAlias = '/'
}

export class VariableError extends ErrorNoTelemetry {
	constructor(public readonly variable: VariableKind, message?: string) {
		super(message);
	}
}
