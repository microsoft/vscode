/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import * as objects from 'vs/base/common/objects';
import { IStringDictionary } from 'vs/base/common/collections';
import { relative } from 'path';
import { IProcessEnvironment, isWindows, isMacintosh, isLinux } from 'vs/base/common/platform';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { localize } from 'vs/nls';
import { URI as uri } from 'vs/base/common/uri';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

export interface IVariableResolveContext {
	getFolderUri(folderName: string): uri | undefined;
	getWorkspaceFolderCount(): number;
	getConfigurationValue(folderUri: uri, section: string): string | undefined;
	getExecPath(): string | undefined;
	getFilePath(): string | undefined;
	getSelectedText(): string | undefined;
	getLineNumber(): string;
}

export class AbstractVariableResolverService implements IConfigurationResolverService {

	static VARIABLE_REGEXP = /\$\{(.*?)\}/g;

	_serviceBrand: any;

	constructor(
		private _context: IVariableResolveContext,
		private _envVariables: IProcessEnvironment = process.env
	) {
		if (isWindows) {
			this._envVariables = Object.create(null);
			Object.keys(_envVariables).forEach(key => {
				this._envVariables[key.toLowerCase()] = _envVariables[key];
			});
		}
	}

	public resolve(root: IWorkspaceFolder, value: string): string;
	public resolve(root: IWorkspaceFolder, value: string[]): string[];
	public resolve(root: IWorkspaceFolder, value: IStringDictionary<string>): IStringDictionary<string>;
	public resolve(root: IWorkspaceFolder, value: any): any {
		return this.recursiveResolve(root ? root.uri : undefined, value);
	}

	public resolveAnyBase(workspaceFolder: IWorkspaceFolder, config: any, commandValueMapping?: IStringDictionary<string>, resolvedVariables?: Map<string, string>): any {

		const result = objects.deepClone(config) as any;

		// hoist platform specific attributes to top level
		if (isWindows && result.windows) {
			Object.keys(result.windows).forEach(key => result[key] = result.windows[key]);
		} else if (isMacintosh && result.osx) {
			Object.keys(result.osx).forEach(key => result[key] = result.osx[key]);
		} else if (isLinux && result.linux) {
			Object.keys(result.linux).forEach(key => result[key] = result.linux[key]);
		}

		// delete all platform specific sections
		delete result.windows;
		delete result.osx;
		delete result.linux;

		// substitute all variables recursively in string values
		return this.recursiveResolve(workspaceFolder ? workspaceFolder.uri : undefined, result, commandValueMapping, resolvedVariables);
	}

	public resolveAny(workspaceFolder: IWorkspaceFolder, config: any, commandValueMapping?: IStringDictionary<string>): any {
		return this.resolveAnyBase(workspaceFolder, config, commandValueMapping);
	}

	public resolveAnyMap(workspaceFolder: IWorkspaceFolder, config: any, commandValueMapping?: IStringDictionary<string>): { newConfig: any, resolvedVariables: Map<string, string> } {
		const resolvedVariables = new Map<string, string>();
		const newConfig = this.resolveAnyBase(workspaceFolder, config, commandValueMapping, resolvedVariables);
		return { newConfig, resolvedVariables };
	}

	public resolveWithInteractionReplace(folder: IWorkspaceFolder, config: any): Promise<any> {
		throw new Error('resolveWithInteractionReplace not implemented.');
	}

	public resolveWithInteraction(folder: IWorkspaceFolder, config: any): Promise<any> {
		throw new Error('resolveWithInteraction not implemented.');
	}

	private recursiveResolve(folderUri: uri, value: any, commandValueMapping?: IStringDictionary<string>, resolvedVariables?: Map<string, string>): any {
		if (types.isString(value)) {
			const resolved = this.resolveString(folderUri, value, commandValueMapping);
			if (resolvedVariables) {
				resolvedVariables.set(resolved.variableName, resolved.resolvedValue);
			}
			return resolved.replaced;
		} else if (types.isArray(value)) {
			return value.map(s => this.recursiveResolve(folderUri, s, commandValueMapping, resolvedVariables));
		} else if (types.isObject(value)) {
			let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
			Object.keys(value).forEach(key => {
				const resolvedKey = this.resolveString(folderUri, key, commandValueMapping);
				if (resolvedVariables) {
					resolvedVariables.set(resolvedKey.variableName, resolvedKey.resolvedValue);
				}
				result[resolvedKey.replaced] = this.recursiveResolve(folderUri, value[key], commandValueMapping, resolvedVariables);
			});
			return result;
		}
		return value;
	}

	private resolveString(folderUri: uri, value: string, commandValueMapping: IStringDictionary<string>): { replaced: string, variableName: string, resolvedValue: string } {

		const filePath = this._context.getFilePath();
		let variableName: string;
		let resolvedValue: string;
		const replaced = value.replace(AbstractVariableResolverService.VARIABLE_REGEXP, (match: string, variable: string) => {

			variableName = variable;
			let argument: string;
			const parts = variable.split(':');
			if (parts && parts.length > 1) {
				variable = parts[0];
				argument = parts[1];
			}

			switch (variable) {

				case 'env':
					if (argument) {
						if (isWindows) {
							argument = argument.toLowerCase();
						}
						const env = this._envVariables[argument];
						if (types.isString(env)) {
							return resolvedValue = env;
						}
						// For `env` we should do the same as a normal shell does - evaluates missing envs to an empty string #46436
						return resolvedValue = '';
					}
					throw new Error(localize('missingEnvVarName', "'{0}' can not be resolved because no environment variable name is given.", match));

				case 'config':
					if (argument) {
						const config = this._context.getConfigurationValue(folderUri, argument);
						if (types.isUndefinedOrNull(config)) {
							throw new Error(localize('configNotFound', "'{0}' can not be resolved because setting '{1}' not found.", match, argument));
						}
						if (types.isObject(config)) {
							throw new Error(localize('configNoString', "'{0}' can not be resolved because '{1}' is a structured value.", match, argument));
						}
						return resolvedValue = config;
					}
					throw new Error(localize('missingConfigName', "'{0}' can not be resolved because no settings name is given.", match));

				case 'command':
					return resolvedValue = this.resolveFromMap(match, argument, commandValueMapping, 'command');
				case 'input':
					return resolvedValue = this.resolveFromMap(match, argument, commandValueMapping, 'input');

				default: {

					// common error handling for all variables that require an open folder and accept a folder name argument
					switch (variable) {
						case 'workspaceRoot':
						case 'workspaceFolder':
						case 'workspaceRootFolderName':
						case 'workspaceFolderBasename':
						case 'relativeFile':
							if (argument) {
								const folder = this._context.getFolderUri(argument);
								if (folder) {
									folderUri = folder;
								} else {
									throw new Error(localize('canNotFindFolder', "'{0}' can not be resolved. No such folder '{1}'.", match, argument));
								}
							}
							if (!folderUri) {
								if (this._context.getWorkspaceFolderCount() > 1) {
									throw new Error(localize('canNotResolveWorkspaceFolderMultiRoot', "'{0}' can not be resolved in a multi folder workspace. Scope this variable using ':' and a workspace folder name.", match));
								}
								throw new Error(localize('canNotResolveWorkspaceFolder', "'{0}' can not be resolved. Please open a folder.", match));
							}
							break;
						default:
							break;
					}

					// common error handling for all variables that require an open file
					switch (variable) {
						case 'file':
						case 'relativeFile':
						case 'fileDirname':
						case 'fileExtname':
						case 'fileBasename':
						case 'fileBasenameNoExtension':
							if (!filePath) {
								throw new Error(localize('canNotResolveFile', "'{0}' can not be resolved. Please open an editor.", match));
							}
							break;
						default:
							break;
					}

					switch (variable) {
						case 'workspaceRoot':
						case 'workspaceFolder':
							return resolvedValue = normalizeDriveLetter(folderUri.fsPath);

						case 'cwd':
							return resolvedValue = (folderUri ? normalizeDriveLetter(folderUri.fsPath) : process.cwd());

						case 'workspaceRootFolderName':
						case 'workspaceFolderBasename':
							return resolvedValue = paths.basename(folderUri.fsPath);

						case 'lineNumber':
							const lineNumber = this._context.getLineNumber();
							if (lineNumber) {
								return resolvedValue = lineNumber;
							}
							throw new Error(localize('canNotResolveLineNumber', "'{0}' can not be resolved. Make sure to have a line selected in the active editor.", match));

						case 'selectedText':
							const selectedText = this._context.getSelectedText();
							if (selectedText) {
								return resolvedValue = selectedText;
							}
							throw new Error(localize('canNotResolveSelectedText', "'{0}' can not be resolved. Make sure to have some text selected in the active editor.", match));

						case 'file':
							return resolvedValue = filePath;

						case 'relativeFile':
							if (folderUri) {
								return resolvedValue = paths.normalize(relative(folderUri.fsPath, filePath));
							}
							return resolvedValue = filePath;

						case 'fileDirname':
							return resolvedValue = paths.dirname(filePath);

						case 'fileExtname':
							return resolvedValue = paths.extname(filePath);

						case 'fileBasename':
							return resolvedValue = paths.basename(filePath);

						case 'fileBasenameNoExtension':
							const basename = paths.basename(filePath);
							return resolvedValue = (basename.slice(0, basename.length - paths.extname(basename).length));

						case 'execPath':
							const ep = this._context.getExecPath();
							if (ep) {
								return resolvedValue = ep;
							}
							return resolvedValue = match;

						default:
							return resolvedValue = match;
					}
				}
			}
		});
		return { replaced, variableName, resolvedValue };
	}

	private resolveFromMap(match: string, argument: string, commandValueMapping: IStringDictionary<string>, prefix: string): string {
		if (argument && commandValueMapping) {
			const v = commandValueMapping[prefix + ':' + argument];
			if (typeof v === 'string') {
				return v;
			}
			throw new Error(localize('noValueForCommand', "'{0}' can not be resolved because the command has no value.", match));
		}
		return match;
	}
}
