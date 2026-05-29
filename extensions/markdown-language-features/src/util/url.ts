/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Tries to convert an url into a vscode uri and returns undefined if this is not possible.
 * `url` can be absolute or relative.
*/
export function urlToUri(url: string, base: vscode.Uri): vscode.Uri | undefined {
	try {
		// `vscode.Uri.joinPath` cannot be used, since it understands
		// `src` as path, not as relative url. This is problematic for query args.
		const parsedUrl = new URL(url, base.toString());
		const uri = vscode.Uri.parse(parsedUrl.toString());
		return uri;
	} catch (e) {
		// Don't crash if `URL` cannot parse `src`.
		return undefined;
	}
}

/**
 * Builds a VS Code URI from an http/https URL string without running the URL
 * through `Uri.parse`, which would decode percent-encoded characters such as
 * `%2F` in path segments or `%2D` inside text-fragment specifications.
 *
 * The WHATWG URL API is used to split the URL into its components; those
 * components are then handed to `Uri.from`, which stores them verbatim so that
 * `toString(true)` can reproduce the original percent-encoding faithfully.
 *
 * Falls back to `Uri.parse` for URLs that the WHATWG URL parser cannot handle.
 */
export function rawHttpUriFromHref(href: string): vscode.Uri {
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(href);
	} catch {
		// The WHATWG URL parser only accepts absolute URLs with a recognised
		// scheme.  For anything it rejects (e.g. a bare path or an unknown
		// scheme) fall back to the normal VS Code URI parser.
		return vscode.Uri.parse(href);
	}

	return vscode.Uri.from({
		scheme: parsedUrl.protocol.slice(0, -1), // strip trailing ':'
		authority: parsedUrl.host,
		path: parsedUrl.pathname,
		query: parsedUrl.search ? parsedUrl.search.slice(1) : '',   // strip leading '?'
		fragment: parsedUrl.hash ? parsedUrl.hash.slice(1) : '',    // strip leading '#'
	});
}
