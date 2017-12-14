/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import URI from 'vs/base/common/uri';
import { MainContext, MainThreadDiaglogsShape, IMainContext } from 'vs/workbench/api/node/extHost.protocol';

export class ExtHostDialogs {

	private readonly _proxy: MainThreadDiaglogsShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadDialogs);
	}

	showOpenDialog(options: vscode.OpenDialogOptions): Thenable<URI[]> {
		return this._proxy.$showOpenDialog(options).then(filepaths => {
			return filepaths && filepaths.map(URI.file);
		});
	}

	showSaveDialog(options: vscode.SaveDialogOptions): Thenable<URI> {
		return this._proxy.$showSaveDialog(options).then(filepath => {
			return filepath && URI.file(filepath);
		});
	}
}
