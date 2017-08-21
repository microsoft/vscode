/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import * as editorCommon from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { TPromise } from 'vs/base/common/winjs.base';
import * as vscode from 'vscode';
import { asWinJsPromise } from 'vs/base/common/async';
import { TextSource } from 'vs/editor/common/model/textSource';
import { MainContext, ExtHostDocumentContentProvidersShape, MainThreadDocumentContentProvidersShape, IMainContext } from './extHost.protocol';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors';

export class ExtHostDocumentContentProvider implements ExtHostDocumentContentProvidersShape {

	private static _handlePool = 0;

	private readonly _documentContentProviders = new Map<number, vscode.TextDocumentContentProvider>();
	private readonly _proxy: MainThreadDocumentContentProvidersShape;
	private readonly _documentsAndEditors: ExtHostDocumentsAndEditors;

	constructor(mainContext: IMainContext, documentsAndEditors: ExtHostDocumentsAndEditors) {
		this._proxy = mainContext.get(MainContext.MainThreadDocumentContentProviders);
		this._documentsAndEditors = documentsAndEditors;
	}

	dispose(): void {
		// todo@joh
	}

	registerTextDocumentContentProvider(scheme: string, provider: vscode.TextDocumentContentProvider): vscode.Disposable {
		if (scheme === 'file' || scheme === 'untitled') {
			throw new Error(`scheme '${scheme}' already registered`);
		}

		const handle = ExtHostDocumentContentProvider._handlePool++;

		this._documentContentProviders.set(handle, provider);
		this._proxy.$registerTextContentProvider(handle, scheme);

		let subscription: IDisposable;
		if (typeof provider.onDidChange === 'function') {
			subscription = provider.onDidChange(uri => {
				if (this._documentsAndEditors.getDocument(uri.toString())) {
					this.$provideTextDocumentContent(handle, <URI>uri).then(value => {

						const document = this._documentsAndEditors.getDocument(uri.toString());
						if (!document) {
							// disposed in the meantime
							return;
						}

						// create lines and compare
						const textSource = TextSource.fromString(value, editorCommon.DefaultEndOfLine.CRLF);

						// broadcast event when content changed
						if (!document.equalLines(textSource)) {
							return this._proxy.$onVirtualDocumentChange(<URI>uri, textSource);
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

	$provideTextDocumentContent(handle: number, uri: URI): TPromise<string> {
		const provider = this._documentContentProviders.get(handle);
		if (!provider) {
			return TPromise.wrapError<string>(new Error(`unsupported uri-scheme: ${uri.scheme}`));
		}
		return asWinJsPromise(token => provider.provideTextDocumentContent(uri, token));
	}
}
