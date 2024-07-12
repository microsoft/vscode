/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const Schemes = Object.freeze({
	file: 'file',
});

export const Mimes = Object.freeze({
	plain: 'text/plain',
	uriList: 'text/uri-list',
});

export enum QuoteTypes {
	Default = 'default',
	Single = 'single',
	Double = 'double',
}

export function getQuoteTypeSetting(document: vscode.TextDocument): QuoteTypes {
	return vscode.workspace.getConfiguration('css', document).get<QuoteTypes>('format.formattedFileQuoteType') ?? QuoteTypes.Default;
}
