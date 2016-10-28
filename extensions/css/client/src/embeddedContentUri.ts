/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Uri } from 'vscode';

export const EMBEDDED_CONTENT_SCHEME = 'embedded-content';

export function isEmbeddedContentUri(virtualDocumentUri: Uri): boolean {
	return virtualDocumentUri.scheme === EMBEDDED_CONTENT_SCHEME;
}

export function getEmbeddedContentUri(parentDocumentUri: string, embeddedLanguageId: string): Uri {
	return new Uri().with({ scheme: EMBEDDED_CONTENT_SCHEME, authority: embeddedLanguageId, path: '/' + encodeURIComponent(parentDocumentUri) + '.' + embeddedLanguageId });
};

export function getHostDocumentUri(virtualDocumentUri: Uri): string {
	let languageId = virtualDocumentUri.authority;
	let path = virtualDocumentUri.path.substring(1, virtualDocumentUri.path.length - languageId.length - 1); // remove leading '/' and new file extension
	return decodeURIComponent(path);
};

export function getEmbeddedLanguageId(virtualDocumentUri: Uri): string {
	return virtualDocumentUri.authority;
}