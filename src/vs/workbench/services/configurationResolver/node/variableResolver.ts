/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import { IStringDictionary } from 'vs/base/common/collections';
import { relative } from 'path';
import { IProcessEnvironment, isWindows } from 'vs/base/common/platform';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { localize } from 'vs/nls';
import uri from 'vs/base/common/uri';


export interface IVariableAccessor {
	getFolderUri(folderName: string): uri | undefined;
	getWorkspaceFolderCount(): number;
	getConfigurationValue(folderUri: uri, section: string): string | undefined;
	getEnvironmentService(name: string): string | undefined;
	getFilePath(): string | undefined;
	getSelectedText(): string | undefined;
	getLineNumber(): string;
}

export class VariableResolver {

	static VARIABLE_REGEXP = /\$\{(.*?)\}/g;

	private envVariables: IProcessEnvironment;

	constructor(
		private accessor: IVariableAccessor,
		envVariables: IProcessEnvironment
	) {
		if (isWindows) {
			this.envVariables = Object.create(null);
			Object.keys(envVariables).forEach(key => {
				this.envVariables[key.toLowerCase()] = envVariables[key];
			});
		} else {
			this.envVariables = envVariables;
		}
	}

	resolveAny(folderUri: uri, value: any): any {
		if (types.isString(value)) {
			return this.resolve(folderUri, value);
		} else if (types.isArray(value)) {
			return value.map(s => this.resolveAny(folderUri, s));
		} else if (types.isObject(value)) {
			let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
			Object.keys(value).forEach(key => {
				result[key] = this.resolveAny(folderUri, value[key]);
			});
			return result;
		}
		return value;
	}

	resolve(folderUri: uri, value: string): string {

		const filePath = this.accessor.getFilePath();

		return value.replace(VariableResolver.VARIABLE_REGEXP, (match: string, variable: string) => {

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
						const env = this.envVariables[argument];
						if (types.isString(env)) {
							return env;
						}
						// For `env` we should do the same as a normal shell does - evaluates missing envs to an empty string #46436
						return '';
					}
					throw new Error(localize('missingEnvVarName', "'{0}' can not be resolved because no environment variable is given.", match));

				case 'config':
					if (argument) {
						const config = this.accessor.getConfigurationValue(folderUri, argument);
						if (!types.isUndefinedOrNull(config) && !types.isObject(config)) {
							return config;
						}
						throw new Error(localize('configNoString', "'{0}' can not be resolved because '{1}' is a structured value.", match, argument));
					}
					throw new Error(localize('missingConfigName', "'{0}' can not be resolved because no settings name is given.", match));

				default: {

					if (argument) {
						const folder = this.accessor.getFolderUri(argument);
						if (folder) {
							folderUri = folder;
						}
					}

					switch (variable) {
						case 'workspaceRoot':
						case 'workspaceFolder':
							if (folderUri) {
								return normalizeDriveLetter(folderUri.fsPath);
							}
							if (this.accessor.getWorkspaceFolderCount() > 1) {
								throw new Error(localize('canNotResolveWorkspaceFolderMultiRoot', "'{0}' can not be resolved in a multi folder workspace. Scope this variable using ':' and a workspace folder name.", match));
							}
							throw new Error(localize('canNotResolveWorkspaceFolder', "'{0}' can not be resolved. Please open a folder.", match));

						case 'cwd':
							return folderUri ? normalizeDriveLetter(folderUri.fsPath) : process.cwd();

						case 'workspaceRootFolderName':
						case 'workspaceFolderBasename':
							if (folderUri) {
								return paths.basename(folderUri.fsPath);
							}
							if (this.accessor.getWorkspaceFolderCount() > 1) {
								throw new Error(localize('canNotResolveFolderBasenameMultiRoot', "'{0}' can not be resolved in a multi folder workspace. Scope this variable using ':' and a workspace folder name.", match));
							}
							throw new Error(localize('canNotResolveFolderBasename', "'{0}' can not be resolved. Please open a folder.", match));

						case 'lineNumber':
							const lineNumber = this.accessor.getLineNumber();
							if (lineNumber) {
								return lineNumber;
							}
							throw new Error(localize('canNotResolveLineNumber', "'{0}' can not be resolved. Please open an editor.", match));

						case 'selectedText':
							const selectedText = this.accessor.getSelectedText();
							if (selectedText) {
								return selectedText;
							}
							throw new Error(localize('canNotResolveSelectedText', "'{0}' can not be resolved. Please open an editor and select some text.", match));

						case 'file':
							if (filePath) {
								return filePath;
							}
							throw new Error(localize('canNotResolveFile', "'{0}' can not be resolved. Please open an editor.", match));

						case 'relativeFile':
							if (folderUri && filePath) {
								return paths.normalize(relative(folderUri.fsPath, filePath));
							}
							if (filePath) {
								return filePath;
							}
							throw new Error(localize('canNotResolveRelativeFile', "'{0}' can not be resolved. Please open an editor.", match));

						case 'fileDirname':
							if (filePath) {
								return paths.dirname(filePath);
							}
							throw new Error(localize('canNotResolveFileDirname', "'{0}' can not be resolved. Please open an editor.", match));

						case 'fileExtname':
							if (filePath) {
								return paths.extname(filePath);
							}
							throw new Error(localize('canNotResolveFileExtname', "'{0}' can not be resolved. Please open an editor.", match));

						case 'fileBasename':
							if (filePath) {
								return paths.basename(filePath);
							}
							throw new Error(localize('canNotResolveFileBasename', "'{0}' can not be resolved. Please open an editor.", match));

						case 'fileBasenameNoExtension':
							if (filePath) {
								const basename = paths.basename(filePath);
								return basename.slice(0, basename.length - paths.extname(basename).length);
							}
							throw new Error(localize('canNotResolveFileBasenameNoExtension', "'{0}' can not be resolved. Please open an editor.", match));

						case 'execPath':
							return this.accessor.getEnvironmentService('execPath');

						default:
							return match;
					}
				}
			}
		});
	}
}
