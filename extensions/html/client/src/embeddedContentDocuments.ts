/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { workspace, Uri, EventEmitter, Disposable, TextDocument } from 'vscode';
import { LanguageClient, RequestType, NotificationType } from 'vscode-languageclient';
import { getEmbeddedContentUri, getEmbeddedLanguageId, getHostDocumentUri, isEmbeddedContentUri, EMBEDDED_CONTENT_SCHEME } from './embeddedContentUri';

interface EmbeddedContentParams {
	uri: string;
	embeddedLanguageId: string;
}

interface EmbeddedContent {
	content: string;
	version: number;
}

namespace EmbeddedContentRequest {
	export const type: RequestType<EmbeddedContentParams, EmbeddedContent, any> = { get method() { return 'embedded/content'; } };
}

export interface EmbeddedDocuments extends Disposable {
	getEmbeddedContentUri: (parentDocumentUri: string, embeddedLanguageId: string) => Uri;
	openEmbeddedContentDocument: (embeddedContentUri: Uri, expectedVersion: number) => Thenable<TextDocument>;
}

interface EmbeddedContentChangedParams {
	uri: string;
	version: number;
	embeddedLanguageIds: string[];
}

namespace EmbeddedContentChangedNotification {
	export const type: NotificationType<EmbeddedContentChangedParams> = { get method() { return 'embedded/contentchanged'; } };
}

export function initializeEmbeddedContentDocuments(parentDocumentSelector: string[], embeddedLanguages: { [languageId: string]: boolean }, client: LanguageClient): EmbeddedDocuments {
	let toDispose: Disposable[] = [];

	let embeddedContentChanged = new EventEmitter<Uri>();

	// remember all open virtual documents with the version of the content
	let openVirtualDocuments: { [uri: string]: number } = {};

	// documents are closed after a time out or when collected.
	toDispose.push(workspace.onDidCloseTextDocument(d => {
		if (isEmbeddedContentUri(d.uri)) {
			delete openVirtualDocuments[d.uri.toString()];
		}
	}));

	// virtual document provider
	toDispose.push(workspace.registerTextDocumentContentProvider(EMBEDDED_CONTENT_SCHEME, {
		provideTextDocumentContent: uri => {
			if (isEmbeddedContentUri(uri)) {
				let contentRequestParms = { uri: getHostDocumentUri(uri), embeddedLanguageId: getEmbeddedLanguageId(uri) };
				return client.sendRequest(EmbeddedContentRequest.type, contentRequestParms).then(content => {
					if (content) {
						openVirtualDocuments[uri.toString()] = content.version;
						return content.content;
					} else {
						delete openVirtualDocuments[uri.toString()];
						return '';
					}
				});
			}
			return '';
		},
		onDidChange: embeddedContentChanged.event
	}));

	// diagnostics for embedded contents
	client.onNotification(EmbeddedContentChangedNotification.type, p => {
		for (let languageId in embeddedLanguages) {
			if (p.embeddedLanguageIds.indexOf(languageId) !== -1) {
				// open the document so that validation is triggered in the embedded mode
				let virtualUri = getEmbeddedContentUri(p.uri, languageId);
				openEmbeddedContentDocument(virtualUri, p.version);
			}
		}
	});

	function ensureContentUpdated(virtualURI: Uri, expectedVersion: number) {
		let virtualURIString = virtualURI.toString();
		let virtualDocVersion = openVirtualDocuments[virtualURIString];
		if (isDefined(virtualDocVersion) && virtualDocVersion !== expectedVersion) {
			return new Promise<void>((resolve, reject) => {
				let subscription = workspace.onDidChangeTextDocument(d => {
					if (d.document.uri.toString() === virtualURIString) {
						subscription.dispose();
						resolve();
					}
				});
				embeddedContentChanged.fire(virtualURI);
			});
		}
		return Promise.resolve();
	};

	function openEmbeddedContentDocument(virtualURI: Uri, expectedVersion: number): Thenable<TextDocument> {
		return ensureContentUpdated(virtualURI, expectedVersion).then(_ => {
			return workspace.openTextDocument(virtualURI).then(document => {
				if (expectedVersion === openVirtualDocuments[virtualURI.toString()]) {
					return document;
				}
				return void 0;
			});
		});
	};

	return {
		getEmbeddedContentUri,
		openEmbeddedContentDocument,
		dispose: Disposable.from(...toDispose).dispose
	};

}

function isDefined(o: any) {
	return typeof o !== 'undefined';
}