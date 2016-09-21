/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import {IStringDictionary} from 'vs/base/common/collections';
import {IConfigurationResolverService} from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IEnvironmentService} from 'vs/platform/environment/common/environment';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {asFileEditorInput} from 'vs/workbench/common/editor';

export class ConfigurationResolverService implements IConfigurationResolverService {
	_serviceBrand: any;
	private _workspaceRoot: string;
	private _execPath: string;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		const workspace = contextService.getWorkspace();
		const fsPath = workspace ? workspace.resource.fsPath : '';
		this._workspaceRoot = paths.normalize(fsPath, true);
		this._execPath = environmentService.execPath;
		Object.keys(process.env).forEach(key => {
			this[`env.${key}`] = process.env[key];
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

	private get file(): string {
		return this.getFilePath();
	}

	private get relativeFile(): string {
		return (this.workspaceRoot) ? paths.relative(this.workspaceRoot, this.file) : this.file;
	}

	private get fileBasename(): string {
		return paths.basename(this.getFilePath());
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
		let fileEditorInput = asFileEditorInput(input);
		if (!fileEditorInput) {
			return '';
		}
		let resource = fileEditorInput.getResource();
		return paths.normalize(resource.fsPath, true);
	}

	public resolve(value: string): string;
	public resolve(value: string[]): string[];
	public resolve(value: IStringDictionary<string>): IStringDictionary<string>;
	public resolve(value: IStringDictionary<string[]>): IStringDictionary<string[]>;
	public resolve(value: IStringDictionary<IStringDictionary<string>>): IStringDictionary<IStringDictionary<string>>;
	public resolve(value: any): any {
		if (types.isString(value)) {
			return this.resolveString(value);
		} else if (types.isArray(value)) {
			return this.__resolveArray(value);
		} else if (types.isObject(value)) {
			return this.__resolveLiteral(value);
		}

		return value;
	}

	public resolveAny<T>(value: T): T;
	public resolveAny<T>(value: any): any {
		if (types.isString(value)) {
			return this.resolveString(value);
		} else if (types.isArray(value)) {
			return this.__resolveAnyArray(value);
		} else if (types.isObject(value)) {
			return this.__resolveAnyLiteral(value);
		}

		return value;
	}

	protected resolveString(value: string): string {
		let regexp = /\$\{(.*?)\}/g;
		return value.replace(regexp, (match: string, name: string) => {
			let newValue = (<any>this)[name];
			if (types.isString(newValue)) {
				return newValue;
			} else {
				return match && match.indexOf('env.') > 0 ? '' : match;
			}
		});
	}

	private __resolveLiteral(values: IStringDictionary<string | IStringDictionary<string> | string[]>): IStringDictionary<string | IStringDictionary<string> | string[]> {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		Object.keys(values).forEach(key => {
			let value = values[key];
			result[key] = <any>this.resolve(<any>value);
		});
		return result;
	}

	private __resolveAnyLiteral<T>(values: T): T;
	private __resolveAnyLiteral<T>(values: any): any {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		Object.keys(values).forEach(key => {
			let value = values[key];
			result[key] = <any>this.resolveAny(<any>value);
		});
		return result;
	}

	private __resolveArray(value: string[]): string[] {
		return value.map(s => this.resolveString(s));
	}

	private __resolveAnyArray<T>(value: T[]): T[];
	private __resolveAnyArray(value: any[]): any[] {
		return value.map(s => this.resolveAny(s));
	}
}
