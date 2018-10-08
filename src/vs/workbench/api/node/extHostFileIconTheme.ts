/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainContext, MainContext, ExtHostFileIconThemeShape, MainThreadFileIconThemeShape } from 'vs/workbench/api/node/extHost.protocol';
import { Emitter, Event } from 'vs/base/common/event';
import * as vscode from 'vscode';

export class ExtHostFileIconTheme implements ExtHostFileIconThemeShape {
	private readonly _proxy: MainThreadFileIconThemeShape;
	private readonly _onDidReloadFileIconTheme: Emitter<vscode.FileIconThemeReloadEvent>;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadFileIconTheme);
		this._onDidReloadFileIconTheme = new Emitter<vscode.FileIconThemeReloadEvent>();
	}

	get onDidReloadFileIconTheme(): Event<vscode.FileIconThemeReloadEvent> {
		return this._onDidReloadFileIconTheme.event;
	}

	reloadFileIconTheme(): Thenable<void> {
		return this._proxy.$reloadFileIconTheme()
			.then(() => this._onDidReloadFileIconTheme.fire(Object.freeze({ reloaded: true })));
	}
}