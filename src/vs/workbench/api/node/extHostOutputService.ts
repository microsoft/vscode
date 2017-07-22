/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, MainThreadOutputServiceShape } from './extHost.protocol';
import * as vscode from 'vscode';

export class ExtHostOutputChannel implements vscode.OutputChannel {

	private static _idPool = 1;

	private _proxy: MainThreadOutputServiceShape;
	private _name: string;
	private _id: string;
	private _disposed: boolean;

	constructor(name: string, proxy: MainThreadOutputServiceShape) {
		this._name = name;
		this._id = 'extension-output-#' + (ExtHostOutputChannel._idPool++);
		this._proxy = proxy;
	}

	get name(): string {
		return this._name;
	}

	dispose(): void {
		if (!this._disposed) {
			this._proxy.$dispose(this._id, this._name).then(() => {
				this._disposed = true;
			});
		}
	}

	append(value: string): void {
		this._proxy.$append(this._id, this._name, value);
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}

	clear(): void {
		this._proxy.$clear(this._id, this._name);
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		if (typeof columnOrPreserveFocus === 'boolean') {
			preserveFocus = columnOrPreserveFocus;
		}

		this._proxy.$reveal(this._id, this._name, preserveFocus);
	}

	hide(): void {
		this._proxy.$close(this._id);
	}
}

export class ExtHostOutputService {

	private _proxy: MainThreadOutputServiceShape;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadOutputService);
	}

	createOutputChannel(name: string): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		} else {
			return new ExtHostOutputChannel(name, this._proxy);
		}
	}
}
