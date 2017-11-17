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
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { relative } from 'path';

export class ConfigurationResolverService implements IConfigurationResolverService {
	_serviceBrand: any;
	private _execPath: string;
	private _lastWorkspaceFolder: IWorkspaceFolder;

	constructor(
		envVariables: { [key: string]: string },
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService,
	) {
		this._execPath = environmentService.execPath;
		Object.keys(envVariables).forEach(key => {
			this[`env:${key}`] = envVariables[key];
		});
	}

	private get execPath(): string {
		return this._execPath;
	}

	private get cwd(): string {
		if (this.workspaceRoot) {
			return this.workspaceRoot;
		} else {
			return process.cwd();
		}
	}

	private get workspaceRoot(): string {
		return this._lastWorkspaceFolder ? this._lastWorkspaceFolder.uri.fsPath : undefined;
	}

	private get workspaceFolder(): string {
		return this.workspaceRoot;
	}

	private get workspaceRootFolderName(): string {
		return this.workspaceFolderBasename;
	}

	private get workspaceFolderBasename(): string {
		return this.workspaceRoot ? paths.basename(this.workspaceRoot) : '';
	}

	private get file(): string {
		return this.getFilePath();
	}

	private get relativeFile(): string {
		return (this.workspaceRoot) ? relative(this.workspaceRoot, this.file) : this.file;
	}

	private get fileBasename(): string {
		return paths.basename(this.getFilePath());
	}

	private get fileBasenameNoExtension(): string {
		const basename = this.fileBasename;
		return basename.slice(0, basename.length - paths.extname(basename).length);
	}

	private get fileDirname(): string {
		return paths.dirname(this.getFilePath());
	}

	private get fileExtname(): string {
		return paths.extname(this.getFilePath());
	}

	private get lineNumber(): string {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			const editorControl = (<ICodeEditor>activeEditor.getControl());
			if (editorControl) {
				const lineNumber = editorControl.getSelection().positionLineNumber;
				return String(lineNumber);
			}
		}

		return '';
	}

	private getFilePath(): string {
		let input = this.editorService.getActiveEditorInput();
		if (input instanceof DiffEditorInput) {
			input = input.modifiedInput;
		}
		if (!input) {
			return '';
		}

		const fileResource = toResource(input, { filter: 'file' });
		if (!fileResource) {
			return '';
		}
		return paths.normalize(fileResource.fsPath, true);
	}

	public resolve(root: IWorkspaceFolder, value: string): string;
	public resolve(root: IWorkspaceFolder, value: string[]): string[];
	public resolve(root: IWorkspaceFolder, value: IStringDictionary<string>): IStringDictionary<string>;
	public resolve(root: IWorkspaceFolder, value: any): any {
		try {
			this._lastWorkspaceFolder = root;
			if (types.isString(value)) {
				return this.resolveString(root, value);
			} else if (types.isArray(value)) {
				return this.resolveArray(root, value);
			} else if (types.isObject(value)) {
				return this.resolveLiteral(root, value);
			}
			return value;
		} finally {
			this._lastWorkspaceFolder = undefined;
		}
	}

	public resolveAny<T>(root: IWorkspaceFolder, value: T): T;
	public resolveAny(root: IWorkspaceFolder, value: any): any {
		try {
			this._lastWorkspaceFolder = root;
			if (types.isString(value)) {
				return this.resolveString(root, value);
			} else if (types.isArray(value)) {
				return this.resolveAnyArray(root, value);
			} else if (types.isObject(value)) {
				return this.resolveAnyLiteral(root, value);
			}
			return value;
		} finally {
			this._lastWorkspaceFolder = undefined;
		}
	}

	private resolveString(root: IWorkspaceFolder, value: string): string {
		let regexp = /\$\{(.*?)\}/g;
		const originalValue = value;
		const resolvedString = value.replace(regexp, (match: string, name: string) => {
			let newValue = (<any>this)[name];
			if (types.isString(newValue)) {
				return newValue;
			} else {
				return match && match.indexOf('env:') > 0 ? '' : match;
			}
		});

		return this.resolveConfigVariable(root, resolvedString, originalValue);
	}

	private resolveConfigVariable(root: IWorkspaceFolder, value: string, originalValue: string): string {
		const replacer = (match: string, name: string) => {
			let config = this.configurationService.getValue<any>({ resource: root.uri });
			let newValue: any;
			try {
				const keys: string[] = name.split('.');
				if (!keys || keys.length <= 0) {
					return '';
				}
				while (keys.length > 1) {
					const key = keys.shift();
					if (!config || !config.hasOwnProperty(key)) {
						return '';
					}
					config = config[key];
				}
				newValue = config && config.hasOwnProperty(keys[0]) ? config[keys[0]] : '';
			} catch (e) {
				return '';
			}
			if (types.isString(newValue)) {
				// Prevent infinite recursion and also support nested references (or tokens)
				return newValue === originalValue ? '' : this.resolveString(root, newValue);
			} else {
				return this.resolve(root, newValue) + '';
			}
		};

		return value.replace(/\$\{config:(.+?)\}/g, replacer);
	}

	private resolveLiteral(root: IWorkspaceFolder, values: IStringDictionary<string | IStringDictionary<string> | string[]>): IStringDictionary<string | IStringDictionary<string> | string[]> {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		Object.keys(values).forEach(key => {
			let value = values[key];
			result[key] = <any>this.resolve(root, <any>value);
		});
		return result;
	}

	private resolveAnyLiteral<T>(root: IWorkspaceFolder, values: T): T;
	private resolveAnyLiteral(root: IWorkspaceFolder, values: any): any {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		Object.keys(values).forEach(key => {
			let value = values[key];
			result[key] = <any>this.resolveAny(root, <any>value);
		});
		return result;
	}

	private resolveArray(root: IWorkspaceFolder, value: string[]): string[] {
		return value.map(s => this.resolveString(root, s));
	}

	private resolveAnyArray<T>(root: IWorkspaceFolder, value: T[]): T[];
	private resolveAnyArray(root: IWorkspaceFolder, value: any[]): any[] {
		return value.map(s => this.resolveAny(root, s));
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
		const interactiveVariablesToSubstitutes: { [interactiveVariable: string]: { object: any, key: string }[] } = {};
		const findInteractiveVariables = (object: any) => {
			Object.keys(object).forEach(key => {
				if (object[key] && typeof object[key] === 'object') {
					findInteractiveVariables(object[key]);
				} else if (typeof object[key] === 'string') {
					const matches = /\${command:(.+)}/.exec(object[key]);
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
