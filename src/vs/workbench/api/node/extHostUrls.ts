/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MainContext, IMainContext, ExtHostUrlsShape, MainThreadUrlsShape } from './extHost.protocol';
import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { toDisposable } from 'vs/base/common/lifecycle';

export class ExtHostUrls implements ExtHostUrlsShape {

	private static HandlePool = 0;
	private readonly _proxy: MainThreadUrlsShape;

	private handlers = new Map<number, vscode.UrlHandler>();

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadUrls);
	}

	registerUrlHandler(extensionId: string, handler: vscode.UrlHandler): vscode.Disposable {
		const handle = ExtHostUrls.HandlePool++;
		this.handlers.set(handle, handler);
		this._proxy.$registerUrlHandler(handle, extensionId);

		return toDisposable(() => {
			this.handlers.delete(handle);
			this._proxy.$unregisterUrlHandler(handle);
		});
	}

	$handleUrl(handle: number, uri: UriComponents): TPromise<void> {
		const handler = this.handlers.get(handle);

		if (!handler) {
			return TPromise.as(null);
		}

		handler.handleUrl(URI.revive(uri));
		return TPromise.as(null);
	}
}