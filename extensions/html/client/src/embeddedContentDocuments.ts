/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { workspace, Uri, EventEmitter, Disposable, TextDocument } from 'vscode';
import { LanguageClient, RequestType } from 'vscode-languageclient';


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
	getVirtualDocumentUri: (parentDocumentUri: string, embeddedLanguageId: string) => Uri;
	openVirtualDocument: (embeddedContentUri: Uri, expectedVersion: number) => Thenable<TextDocument>;
}


export function initializeEmbeddedContentDocuments(embeddedScheme: string, client: LanguageClient): EmbeddedDocuments {
	let toDispose: Disposable[] = [];

	let embeddedContentChanged = new EventEmitter<Uri>();

	// remember all open virtual documents with the version of the content
	let openVirtualDocuments: { [uri: string]: number } = {};

	// documents are closed after a time out or when collected.
	toDispose.push(workspace.onDidCloseTextDocument(d => {
		if (d.uri.scheme === embeddedScheme) {
			delete openVirtualDocuments[d.uri.toString()];
		}
	}));

	// virtual document provider
	toDispose.push(workspace.registerTextDocumentContentProvider(embeddedScheme, {
		provideTextDocumentContent: uri => {
			if (uri.scheme === embeddedScheme) {
				let contentRequestParms = { uri: getParentDocumentUri(uri), embeddedLanguageId: getEmbeddedLanguageId(uri) };
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

	function getVirtualDocumentUri(parentDocumentUri: string, embeddedLanguageId: string) {
		return Uri.parse(embeddedScheme + '://' + embeddedLanguageId + '/' + encodeURIComponent(parentDocumentUri) + '.' + embeddedLanguageId);
	};

	function getParentDocumentUri(virtualDocumentUri: Uri): string {
		let languageId = virtualDocumentUri.authority;
		let path = virtualDocumentUri.path.substring(1, virtualDocumentUri.path.length - languageId.length - 1); // remove leading '/' and new file extension
		return decodeURIComponent(path);
	};

	function getEmbeddedLanguageId(virtualDocumentUri: Uri): string {
		return virtualDocumentUri.authority;
	}

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

	function openVirtualDocument(virtualURI: Uri, expectedVersion: number): Thenable<TextDocument> {
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
		getVirtualDocumentUri,
		openVirtualDocument,
		dispose: Disposable.from(...toDispose).dispose
	};

}

function isDefined(o: any) {
	return typeof o !== 'undefined';
}