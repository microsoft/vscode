/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { URL } from 'url';

/**
 * Tries to convert an url into a vscode uri and returns undefined if this is not possible.
 * `url` can be absolute or relative.
*/
export function urlToFileUri(url: string, base: vscode.Uri): vscode.Uri | undefined {
	try {
		// `vscode.Uri.joinPath` cannot be used, since it understands
		// `src` as path, not as relative url. This is problematic for query args.
		const parsedUrl = new URL(url, base.toString());
		const uri = vscode.Uri.parse(parsedUrl.toString());
		return uri.scheme === 'file' ? uri : undefined;
	} catch (e) {
		// Don't crash if `URL` cannot parse `src`.
		return undefined;
	}
}

/**
 * Tries to append `?name=arg` or `&name=arg` to `url`.
 * If `url` is malformed (and it cannot be decided whether to use `&` or `?`),
 * `url` is returned as is.
*/
export function tryAppendQueryArgToUrl(url: string, name: string, arg: string): string {
	try {
		const parsedUrl = new URL(url, 'file://');
		const joinChar = (parsedUrl.search === '') ? '?' : '&';
		return `${url}${joinChar}${name}=${arg}`;
	} catch (e) {
		return url;
	}
}
