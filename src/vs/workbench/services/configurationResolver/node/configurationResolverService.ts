/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import uri from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { sequence } from 'vs/base/common/async';
import { IStringDictionary } from 'vs/base/common/collections';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';

export class ConfigurationResolverService implements IConfigurationResolverService {
	_serviceBrand: any;
	private _workspaceRoot: string;
	private _execPath: string;

	constructor(
		workspaceRoot: uri,
		envVariables: { [key: string]: string },
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService
	) {
		this._workspaceRoot = paths.normalize(workspaceRoot ? workspaceRoot.fsPath : '', true);
		this._execPath = environmentService.execPath;
		Object.keys(envVariables).forEach(key => {
			this[`env.${key}`] = envVariables[key];
		});
	}

	private get execPath(): string {
		return this._execPath;
	}

	private get cwd(): string {
		return this.workspaceRoot;
	}

	private get workspaceRoot(): string {
		return this._workspaceRoot;
	}

	private get workspaceRootFolderName(): string {
		return this.workspaceRoot ? paths.basename(this.workspaceRoot) : '';
	}

	private get file(): string {
		return this.getFilePath();
	}

	private get relativeFile(): string {
		return (this.workspaceRoot) ? paths.relative(this.workspaceRoot, this.file) : this.file;
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

	private getFilePath(): string {
		let input = this.editorService.getActiveEditorInput();
		if (!input) {
			return '';
		}
		let fileResource = toResource(input, { filter: 'file' });
		if (!fileResource) {
			return '';
		}
		return paths.normalize(fileResource.fsPath, true);
	}

	public resolve(value: string): string;
	public resolve(value: string[]): string[];
	public resolve(value: IStringDictionary<string>): IStringDictionary<string>;
	public resolve(value: any): any {
		if (types.isString(value)) {
			return this.resolveString(value);
		} else if (types.isArray(value)) {
			return this.resolveArray(value);
		} else if (types.isObject(value)) {
			return this.resolveLiteral(value);
		}

		return value;
	}

	public resolveAny<T>(value: T): T;
	public resolveAny<T>(value: any): any {
		if (types.isString(value)) {
			return this.resolveString(value);
		} else if (types.isArray(value)) {
			return this.resolveAnyArray(value);
		} else if (types.isObject(value)) {
			return this.resolveAnyLiteral(value);
		}

		return value;
	}

	private resolveString(value: string): string {
		let regexp = /\$\{(.*?)\}/g;
		const originalValue = value;
		const resolvedString = value.replace(regexp, (match: string, name: string) => {
			let newValue = (<any>this)[name];
			if (types.isString(newValue)) {
				return newValue;
			} else {
				return match && match.indexOf('env.') > 0 ? '' : match;
			}
		});

		return this.resolveConfigVariable(resolvedString, originalValue);
	}

	private resolveConfigVariable(value: string, originalValue: string): string {
		let regexp = /\$\{config\.(.+?)\}/g;
		return value.replace(regexp, (match: string, name: string) => {
			let config = this.configurationService.getConfiguration();
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
				return newValue === originalValue ? '' : this.resolveString(newValue);
			} else {
				return this.resolve(newValue) + '';
			}
		});
	}

	private resolveLiteral(values: IStringDictionary<string | IStringDictionary<string> | string[]>): IStringDictionary<string | IStringDictionary<string> | string[]> {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		Object.keys(values).forEach(key => {
			let value = values[key];
			result[key] = <any>this.resolve(<any>value);
		});
		return result;
	}

	private resolveAnyLiteral<T>(values: T): T;
	private resolveAnyLiteral<T>(values: any): any {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		Object.keys(values).forEach(key => {
			let value = values[key];
			result[key] = <any>this.resolveAny(<any>value);
		});
		return result;
	}

	private resolveArray(value: string[]): string[] {
		return value.map(s => this.resolveString(s));
	}

	private resolveAnyArray<T>(value: T[]): T[];
	private resolveAnyArray(value: any[]): any[] {
		return value.map(s => this.resolveAny(s));
	}

	/**
	 * Resolve all interactive variables in configuration #6569
	 */
	public resolveInteractiveVariables(configuration: any, interactiveVariablesMap: { [key: string]: string }): TPromise<any> {
		if (!configuration) {
			return TPromise.as(null);
		}

		// We need a map from interactive variables to keys because we only want to trigger an command once per key -
		// even though it might occure multiple times in configuration #7026.
		const interactiveVariablesToSubstitutes: { [interactiveVariable: string]: { object: any, key: string }[] } = {};
		const findInteractiveVariables = (object: any) => {
			Object.keys(object).forEach(key => {
				if (object[key] && typeof object[key] === 'object') {
					findInteractiveVariables(object[key]);
				} else if (typeof object[key] === 'string') {
					const matches = /\${command.(.+)}/.exec(object[key]);
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
						interactiveVariablesToSubstitutes[interactiveVariable].forEach(substitute =>
							substitute.object[substitute.key] = substitute.object[substitute.key].replace(`\${command.${interactiveVariable}}`, result)
						);
					} else {
						substitionCanceled = true;
					}
				});
			};
		});

		return sequence(factory).then(() => substitionCanceled ? null : configuration);
	}
}
