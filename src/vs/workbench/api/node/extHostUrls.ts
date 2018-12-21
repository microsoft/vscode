/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MainContext, IMainContext, ExtHostUrlsShape, MainThreadUrlsShape } from './extHost.protocol';
import { URI, UriComponents } from 'vs/base/common/uri';
import { toDisposable } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';
import { CanonicalExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export class ExtHostUrls implements ExtHostUrlsShape {

	private static HandlePool = 0;
	private readonly _proxy: MainThreadUrlsShape;

	private handles = new Set<string>();
	private handlers = new Map<number, vscode.UriHandler>();

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadUrls);
	}

	registerUriHandler(extensionId: CanonicalExtensionIdentifier, handler: vscode.UriHandler): vscode.Disposable {
		if (this.handles.has(CanonicalExtensionIdentifier.toKey(extensionId))) {
			throw new Error(`Protocol handler already registered for extension ${extensionId}`);
		}

		const handle = ExtHostUrls.HandlePool++;
		this.handles.add(CanonicalExtensionIdentifier.toKey(extensionId));
		this.handlers.set(handle, handler);
		this._proxy.$registerUriHandler(handle, extensionId);

		return toDisposable(() => {
			this.handles.delete(CanonicalExtensionIdentifier.toKey(extensionId));
			this.handlers.delete(handle);
			this._proxy.$unregisterUriHandler(handle);
		});
	}

	$handleExternalUri(handle: number, uri: UriComponents): Promise<void> {
		const handler = this.handlers.get(handle);

		if (!handler) {
			return Promise.resolve(void 0);
		}
		try {
			handler.handleUri(URI.revive(uri));
		} catch (err) {
			onUnexpectedError(err);
		}

		return Promise.resolve(void 0);
	}
}
