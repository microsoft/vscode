/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as URI from 'vscode-uri';

const markdownFileExtensions = Object.freeze<string[]>([
	'.md',
	'.mkd',
	'.mdwn',
	'.mdown',
	'.markdown',
	'.markdn',
	'.mdtxt',
	'.mdtext',
	'.workbook',
]);

const imageFileExtensions = Object.freeze<string[]>([
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.webp',
	'.bmp',
	'.tiff',
]);

export function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown';
}

export function looksLikeMarkdownPath(resolvedHrefPath: vscode.Uri) {
	return markdownFileExtensions.includes(URI.Utils.extname(resolvedHrefPath).toLowerCase());
}

export function looksLikeImagePath(resolvedHrefPath: vscode.Uri) {
	return imageFileExtensions.includes(URI.Utils.extname(resolvedHrefPath).toLowerCase());
}
