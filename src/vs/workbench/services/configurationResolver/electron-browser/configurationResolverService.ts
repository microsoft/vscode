/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import { TPromise } from 'vs/base/common/winjs.base';
import { sequence } from 'vs/base/common/async';
import { IStringDictionary } from 'vs/base/common/collections';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceFolder, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { relative } from 'path';
import { IProcessEnvironment, isWindows } from 'vs/base/common/platform';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { Schemas } from 'vs/base/common/network';
import { localize } from 'vs/nls';

class VariableResolver {
	static VARIABLE_REGEXP = /\$\{(.*?)\}/g;
	private envVariables: IProcessEnvironment;

	constructor(
		envVariables: IProcessEnvironment,
		private configurationService: IConfigurationService,
		private editorService: IWorkbenchEditorService,
		private environmentService: IEnvironmentService,
		private workspaceContextService: IWorkspaceContextService
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

	resolve(context: IWorkspaceFolder, value: string): string {
		const filePath = this.getFilePath();
		return value.replace(VariableResolver.VARIABLE_REGEXP, (match: string, variable: string) => {
			const parts = variable.split(':');
			let sufix: string;
			if (parts && parts.length > 1) {
				variable = parts[0];
				sufix = parts[1];
			}

			switch (variable) {
				case 'env': {
					if (sufix) {
						if (isWindows) {
							sufix = sufix.toLowerCase();
						}

						const env = this.envVariables[sufix];
						if (types.isString(env)) {
							return env;
						}

						// For `env` we should do the same as a normal shell does - evaluates missing envs to an empty string #46436
						return '';
					}
				}
				case 'config': {
					if (sufix) {
						const config = this.configurationService.getValue<string>(sufix, context ? { resource: context.uri } : undefined);
						if (!types.isUndefinedOrNull(config) && !types.isObject(config)) {
							return config;
						}
					}
				}
				default: {
					if (sufix) {
						const folder = this.workspaceContextService.getWorkspace().folders.filter(f => f.name === sufix).pop();
						if (folder) {
							context = folder;
						}
					}

					switch (variable) {
						case 'workspaceRoot':
						case 'workspaceFolder': {
							if (context) {
								return normalizeDriveLetter(context.uri.fsPath);
							}
							if (this.workspaceContextService.getWorkspace().folders.length > 1) {
								throw new Error(localize('canNotResolveWorkspaceFolderMultiRoot', "${workspaceFolder} can not be resolved in a multi folder workspace. Scope this variables using : and a folder name."));
							}

							throw new Error(localize('canNotResolveWorkspaceFolder', "${workspaceFolder} can not be resolved. Please open a folder."));
						} case 'cwd':
							return context ? normalizeDriveLetter(context.uri.fsPath) : process.cwd();
						case 'workspaceRootFolderName':
						case 'workspaceFolderBasename': {
							if (context) {
								return paths.basename(context.uri.fsPath);
							}
							if (this.workspaceContextService.getWorkspace().folders.length > 1) {
								throw new Error(localize('canNotResolveFolderBasenameMultiRoot', "${workspaceFolderBasename} can not be resolved in a multi folder workspace. Scope this variables using : and a folder name."));
							}

							throw new Error(localize('canNotResolveFolderBasename', "${workspaceFolderBasename} can not be resolved. Please open a folder."));
						} case 'lineNumber': {
							const lineNumber = this.getLineNumber();
							if (lineNumber) {
								return lineNumber;
							}

							throw new Error(localize('canNotResolveLineNumber', "${lineNumber} can not be resolved, please open an editor."));
						} case 'selectedText': {
							const selectedText = this.getSelectedText();
							if (selectedText) {
								return selectedText;
							}

							throw new Error(localize('canNotResolveSelectedText', "${selectedText} can not be resolved, please open an editor."));
						} case 'file': {
							if (filePath) {
								return filePath;
							}

							throw new Error(localize('canNotResolveFile', "${file} can not be resolved, please open an editor."));
						} case 'relativeFile': {
							if (context && filePath) {
								return paths.normalize(relative(context.uri.fsPath, filePath));
							}
							if (filePath) {
								return filePath;
							}

							throw new Error(localize('canNotResolveRelativeFile', "${relativeFile} can not be resolved, please open an editor."));
						} case 'fileDirname': {
							if (filePath) {
								return paths.dirname(filePath);
							}

							throw new Error(localize('canNotResolveFileDirname', "${fileDirname} can not be resolved, please open an editor."));
						} case 'fileExtname': {
							if (filePath) {
								return paths.extname(filePath);
							}

							throw new Error(localize('canNotResolveFileExtname', "${fileExtname} can not be resolved, please open an editor."));
						} case 'fileBasename': {
							if (filePath) {
								return paths.basename(filePath);
							}

							throw new Error(localize('canNotResolveFileBasename', "${fileBasename} can not be resolved, please open an editor."));
						} case 'fileBasenameNoExtension': {
							if (filePath) {
								const basename = paths.basename(filePath);
								return basename.slice(0, basename.length - paths.extname(basename).length);
							}

							throw new Error(localize('canNotResolveFileBasenameNoExtension', "${fileBasenameNoExtension} can not be resolved, please open an editor."));
						}
						case 'execPath':
							return this.environmentService.execPath;

						default:
							throw new Error(localize('canNotResolveUnkownVariable', "{0} can not be resolved, unknown variable.", match));
					}
				}
			}
		});
	}

	private getSelectedText(): string {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			const editorControl = (<ICodeEditor>activeEditor.getControl());
			if (editorControl) {
				const editorModel = editorControl.getModel();
				const editorSelection = editorControl.getSelection();
				if (editorModel && editorSelection) {
					return editorModel.getValueInRange(editorSelection);
				}
			}
		}

		return undefined;
	}

	private getFilePath(): string {
		let input = this.editorService.getActiveEditorInput();
		if (input instanceof DiffEditorInput) {
			input = input.modifiedInput;
		}

		const fileResource = toResource(input, { filter: Schemas.file });
		if (!fileResource) {
			return undefined;
		}

		return paths.normalize(fileResource.fsPath, true);
	}

	private getLineNumber(): string {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			const editorControl = (<ICodeEditor>activeEditor.getControl());
			if (editorControl) {
				const lineNumber = editorControl.getSelection().positionLineNumber;
				return String(lineNumber);
			}
		}

		return undefined;
	}
}

export class ConfigurationResolverService implements IConfigurationResolverService {
	_serviceBrand: any;
	private resolver: VariableResolver;

	constructor(
		envVariables: IProcessEnvironment,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService
	) {
		this.resolver = new VariableResolver(envVariables, configurationService, editorService, environmentService, workspaceContextService);
	}

	public resolve(root: IWorkspaceFolder, value: string): string;
	public resolve(root: IWorkspaceFolder, value: string[]): string[];
	public resolve(root: IWorkspaceFolder, value: IStringDictionary<string>): IStringDictionary<string>;
	public resolve(root: IWorkspaceFolder, value: any): any {
		if (types.isString(value)) {
			return this.resolver.resolve(root, value);
		} else if (types.isArray(value)) {
			return value.map(s => this.resolver.resolve(root, s));
		} else if (types.isObject(value)) {
			let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
			Object.keys(value).forEach(key => {
				result[key] = this.resolve(root, value[key]);
			});

			return result;
		}
		return value;
	}

	public resolveAny(root: IWorkspaceFolder, value: any): any {
		if (types.isString(value)) {
			return this.resolver.resolve(root, value);
		} else if (types.isArray(value)) {
			return value.map(s => this.resolveAny(root, s));
		} else if (types.isObject(value)) {
			let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
			Object.keys(value).forEach(key => {
				result[key] = this.resolveAny(root, value[key]);
			});

			return result;
		}
		return value;
	}

	/**
	 * Resolve all interactive variables in configuration #6569
	 */
	public resolveInteractiveVariables(configuration: any, interactiveVariablesMap: { [key: string]: string }): TPromise<any> {
		if (!configuration) {
			return TPromise.as(null);
		}

		// We need a map from interactive variables to keys because we only want to trigger an command once per key -
		// even though it might occur multiple times in configuration #7026.
		const interactiveVariablesToSubstitutes: { [interactiveVariable: string]: { object: any, key: string }[] } = Object.create(null);
		const findInteractiveVariables = (object: any) => {
			Object.keys(object).forEach(key => {
				if (object[key] && typeof object[key] === 'object') {
					findInteractiveVariables(object[key]);
				} else if (typeof object[key] === 'string') {
					const matches = /\${command:(.*?)}/.exec(object[key]);
					if (matches && matches.length === 2) {
						const interactiveVariable = matches[1];
						if (!interactiveVariablesToSubstitutes[interactiveVariable]) {
							interactiveVariablesToSubstitutes[interactiveVariable] = [];
						}
						interactiveVariablesToSubstitutes[interactiveVariable].push({ object, key });
					}
				}
			});
		};
		findInteractiveVariables(configuration);
		let substitionCanceled = false;

		const factory: { (): TPromise<any> }[] = Object.keys(interactiveVariablesToSubstitutes).map(interactiveVariable => {
			return () => {
				let commandId: string = null;
				commandId = interactiveVariablesMap ? interactiveVariablesMap[interactiveVariable] : null;
				if (!commandId) {
					// Just launch any command if the interactive variable is not contributed by the adapter #12735
					commandId = interactiveVariable;
				}

				return this.commandService.executeCommand<string>(commandId, configuration).then(result => {
					if (result) {
						interactiveVariablesToSubstitutes[interactiveVariable].forEach(substitute => {
							if (substitute.object[substitute.key].indexOf(`\${command:${interactiveVariable}}`) >= 0) {
								substitute.object[substitute.key] = substitute.object[substitute.key].replace(`\${command:${interactiveVariable}}`, result);
							}
						});
					} else {
						substitionCanceled = true;
					}
				});
			};
		});

		return sequence(factory).then(() => substitionCanceled ? null : configuration);
	}
}
