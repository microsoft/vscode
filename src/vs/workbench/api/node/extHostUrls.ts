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

	private handles = new Set<string>();
	private handlers = new Map<number, vscode.ProtocolHandler>();

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadUrls);
	}

	registerProtocolHandler(extensionId: string, handler: vscode.ProtocolHandler): vscode.Disposable {
		if (this.handles.has(extensionId)) {
			throw new Error(`Protocol handler already registered for extension ${extensionId}`);
		}

		const handle = ExtHostUrls.HandlePool++;
		this.handles.add(extensionId);
		this.handlers.set(handle, handler);
		this._proxy.$registerProtocolHandler(handle, extensionId);

		return toDisposable(() => {
			this.handles.delete(extensionId);
			this.handlers.delete(handle);
			this._proxy.$unregisterProtocolHandler(handle);
		});
	}

	$handleExternalUri(handle: number, uri: UriComponents): TPromise<void> {
		const handler = this.handlers.get(handle);

		if (!handler) {
			return TPromise.as(null);
		}

		handler.handleUri(URI.revive(uri));
		return TPromise.as(null);
	}
}