/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {onUnexpectedError} from 'vs/base/common/errors';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IOutputService, OUTPUT_EDITOR_INPUT_ID} from 'vs/workbench/parts/output/common/output';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';

export class ExtHostOutputChannel implements vscode.OutputChannel {

	private _proxy: MainThreadOutputService;
	private _name: string;
	private _disposed: boolean;

	constructor(name: string, proxy: MainThreadOutputService) {
		this._name = name;
		this._proxy = proxy;
	}

	get name(): string {
		return this._name;
	}

	dispose(): void {
		if (!this._disposed) {
			this._proxy.clear(this._name).then(() => {
				this._disposed = true;
			});
		}
	}

	append(value: string): void {
		this._proxy.append(this._name, value);
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}

	clear(): void {
		this._proxy.clear(this._name);
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		if (typeof columnOrPreserveFocus === 'boolean') {
			preserveFocus = columnOrPreserveFocus;
		}

		this._proxy.reveal(this._name, preserveFocus);
	}

	hide(): void {
		this._proxy.close(this._name);
	}
}

export class ExtHostOutputService {

	private _proxy: MainThreadOutputService;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadOutputService);
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

@Remotable.MainContext('MainThreadOutputService')
export class MainThreadOutputService {

	private _outputService: IOutputService;
	private _editorService: IWorkbenchEditorService;

	constructor( @IOutputService outputService: IOutputService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		this._outputService = outputService;
		this._editorService = editorService;
	}

	public append(channel: string, value: string): TPromise<void> {
		this._outputService.append(channel, value);
		return undefined;
	}

	public clear(channel: string): TPromise<void> {
		this._outputService.clearOutput(channel);
		return undefined;
	}

	public reveal(channel: string, preserveFocus: boolean): TPromise<void> {
		this._outputService.showOutput(channel, preserveFocus);
		return undefined;
	}

	public close(channel: string): TPromise<void> {
		let editors = this._editorService.getVisibleEditors();
		for (let editor of editors) {
			if (editor.input.getId() === OUTPUT_EDITOR_INPUT_ID) {
				this._editorService.closeEditor(editor).done(null, onUnexpectedError);
				return undefined;
			}
		}
	}
}
