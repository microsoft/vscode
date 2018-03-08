/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import URI, { UriComponents } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { TPromise } from 'vs/base/common/winjs.base';
import * as vscode from 'vscode';
import { asWinJsPromise } from 'vs/base/common/async';
import { MainContext, ExtHostDocumentContentProvidersShape, MainThreadDocumentContentProvidersShape, IMainContext } from './extHost.protocol';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors';
import { Schemas } from 'vs/base/common/network';
import { ILogService } from 'vs/platform/log/common/log';

export class ExtHostDocumentContentProvider implements ExtHostDocumentContentProvidersShape {

	private static _handlePool = 0;

	private readonly _documentContentProviders = new Map<number, vscode.TextDocumentContentProvider>();
	private readonly _proxy: MainThreadDocumentContentProvidersShape;

	constructor(
		mainContext: IMainContext,
		private readonly _documentsAndEditors: ExtHostDocumentsAndEditors,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadDocumentContentProviders);
	}

	dispose(): void {
		// todo@joh
	}

	registerTextDocumentContentProvider(scheme: string, provider: vscode.TextDocumentContentProvider): vscode.Disposable {
		// todo@remote
		// check with scheme from fs-providers!
		if (scheme === Schemas.file || scheme === Schemas.untitled) {
			throw new Error(`scheme '${scheme}' already registered`);
		}

		const handle = ExtHostDocumentContentProvider._handlePool++;

		this._documentContentProviders.set(handle, provider);
		this._proxy.$registerTextContentProvider(handle, scheme);

		let subscription: IDisposable;
		if (typeof provider.onDidChange === 'function') {
			subscription = provider.onDidChange(uri => {
				if (uri.scheme !== scheme) {
					this._logService.warn(`Provider for scheme '${scheme}' is firing event for schema '${uri.scheme}' which will be IGNORED`);
					return;
				}
				if (this._documentsAndEditors.getDocument(uri.toString())) {
					this.$provideTextDocumentContent(handle, uri).then(value => {

						const document = this._documentsAndEditors.getDocument(uri.toString());
						if (!document) {
							// disposed in the meantime
							return;
						}

						// create lines and compare
						const lines = value.split(/\r\n|\r|\n/);

						// broadcast event when content changed
						if (!document.equalLines(lines)) {
							return this._proxy.$onVirtualDocumentChange(uri, value);
						}

					}, onUnexpectedError);
				}
			});
		}
		return new Disposable(() => {
			if (this._documentContentProviders.delete(handle)) {
				this._proxy.$unregisterTextContentProvider(handle);
			}
			if (subscription) {
				subscription.dispose();
				subscription = undefined;
			}
		});
	}

	$provideTextDocumentContent(handle: number, uri: UriComponents): TPromise<string> {
		const provider = this._documentContentProviders.get(handle);
		if (!provider) {
			return TPromise.wrapError<string>(new Error(`unsupported uri-scheme: ${uri.scheme}`));
		}
		return asWinJsPromise(token => provider.provideTextDocumentContent(URI.revive(uri), token));
	}
}
