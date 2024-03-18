/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { getDocumentDir } from '../document';

const Schemes = Object.freeze({
	file: 'file',
	untitled: 'untitled',
	mailto: 'mailto',
	vscode: 'vscode',
	'vscode-insiders': 'vscode-insiders',
	notebookCell: 'vscode-notebook-cell',
});

export const externalUriSchemes = [
	'http',
	'https',
	'mailto',
];

export const Mimes = new Set([
	'text/plain',
	'application/octet-stream',
	'application/unknown',
	'text/markdown',
	'text/latex',
	'text/uri-list',
]);

export enum QuoteTypes {
	Single = 'single',
	Double = 'double',
}

export function getQuoteTypeSetting(document: vscode.TextDocument): QuoteTypes {
	return vscode.workspace.getConfiguration('css', document).get<QuoteTypes>('format.formattedFileQuoteType', QuoteTypes.Single);
}

export async function extractUriList(document: vscode.TextDocument, uriList: String): Promise<{ readonly snippet: vscode.SnippetString; readonly label: string } | undefined> {
	const uris: { readonly uri: vscode.Uri }[] = [];
	for (const resource of uriList.split(/\r?\n/g)) {
		try {
			uris.push({ uri: vscode.Uri.parse(resource) });
		} catch {
			// noop
		}
	}
	const relativeUris = coalesce(uris.map(({ uri }) => {
		const documentDir = getDocumentDir(document.uri);
		return getRelativePath(documentDir, uri);
	}));

	const quoteType = getQuoteTypeSetting(document);
	return createUriListSnippet(relativeUris, quoteType);
}

async function createUriListSnippet(uris: string[], quoteType: QuoteTypes): Promise<{ readonly snippet: vscode.SnippetString; readonly label: string }> {
	const snippet = new vscode.SnippetString();
	uris.forEach((uri) => {
		snippet.appendText(quoteType === QuoteTypes.Single ? `url('${escapeQuotes(uri, quoteType)}')` : `url("${escapeQuotes(uri, quoteType)}")`);
		console.log('quote', quoteType);
	});
	return { snippet, label: vscode.l10n.t('Insert relative path in url() function') };
}

function getRelativePath(dir: vscode.Uri | undefined, file: vscode.Uri) {
	if (dir && dir.scheme === file.scheme && dir.authority === file.authority) {
		if (file.scheme === Schemes.file) {
			// On windows, we must use the native `path.relative` to generate the relative path
			// so that drive-letters are resolved cast insensitively. However we then want to
			// convert back to a posix path to insert in to the document
			const relativePath = path.relative(dir.fsPath, file.fsPath);
			return path.posix.normalize(relativePath.split(path.sep).join(path.posix.sep));
		}

		return path.posix.relative(dir.path, file.path);
	}

	return file.toString(false);
}

function coalesce<T>(array: ReadonlyArray<T | undefined | null>): T[] {
	return <T[]>array.filter(e => !!e);
}

function escapeQuotes(value: string, quoteType: QuoteTypes): string {
	return quoteType === QuoteTypes.Single ? value.replace(/'/g, '\\\'') : value.replace(/"/g, '\\"');
}

export function validateLink(urlList: string): { isValid: boolean; cleanedUrlList: string } {
	let isValid = false;
	let uri = undefined;
	const trimmedUrlList = urlList?.trim(); //remove leading and trailing whitespace and new lines
	try {
		uri = vscode.Uri.parse(trimmedUrlList);
	} catch (error) {
		return { isValid: false, cleanedUrlList: urlList };
	}
	const splitUrlList = trimmedUrlList.split(' ').filter(item => item !== ''); //split on spaces and remove empty strings
	if (uri) {
		isValid = splitUrlList.length === 1 && !splitUrlList[0].includes('\n') && externalUriSchemes.includes(vscode.Uri.parse(splitUrlList[0]).scheme) && !!vscode.Uri.parse(splitUrlList[0]).authority;
	}
	return { isValid, cleanedUrlList: splitUrlList[0] };
}

export function useDefaultPaste(document: vscode.TextDocument, positionOrRange?: vscode.Position | vscode.Range): boolean {
	const regex = /\(".*"\)/g;
	let useDefaultPaste = false;
	const matches = [...document.getText().matchAll(regex)];
	for (const match of matches) {
		if (match.index !== undefined) {
			if (positionOrRange instanceof vscode.Position) {
				useDefaultPaste = positionOrRange.character > match.index && positionOrRange.character < match.index + match[0].length;
			}
			if (positionOrRange instanceof vscode.Range) {
				const selectedRange: vscode.Range = new vscode.Range(
					new vscode.Position(positionOrRange.start.line, document.offsetAt(positionOrRange.start)),
					new vscode.Position(positionOrRange.end.line, document.offsetAt(positionOrRange.end))
				);
				useDefaultPaste = selectedRange.start.character > match.index && selectedRange.end.character < match.index + match[0].length;
			}
			if (useDefaultPaste) {
				return false;
			}
		}
	}
	return true;
}
