/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import URI from 'vs/base/common/uri';
import { MainContext, IMainContext, ExtHostDecorationsShape, MainThreadDecorationsShape, DecorationData } from 'vs/workbench/api/node/extHost.protocol';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { asWinJsPromise } from 'vs/base/common/async';

export class ExtHostDecorations implements ExtHostDecorationsShape {

	private static _handlePool = 0;

	private readonly _provider = new Map<number, vscode.DecorationProvider>();
	private readonly _proxy: MainThreadDecorationsShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadDecorations);
	}

	registerDecorationProvider(provider: vscode.DecorationProvider, label: string): vscode.Disposable {
		const handle = ExtHostDecorations._handlePool++;
		this._provider.set(handle, provider);
		this._proxy.$registerDecorationProvider(handle, label);

		const listener = provider.onDidChangeDecorations(e => {
			this._proxy.$onDidChange(handle, !e ? null : Array.isArray(e) ? e : [e]);
		});

		return new Disposable(() => {
			listener.dispose();
			this._proxy.$unregisterDecorationProvider(handle);
			this._provider.delete(handle);
		});
	}

	$providerDecorations(handle: number, uri: URI): TPromise<DecorationData> {
		const provider = this._provider.get(handle);
		return asWinJsPromise(token => provider.provideDecoration(uri, token)).then(data => {
			return data && <DecorationData>[data.priority, data.bubble, data.title, data.abbreviation, data.color, data.source];
		});
	}
}
