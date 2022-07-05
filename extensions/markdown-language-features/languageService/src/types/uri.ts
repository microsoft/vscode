/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as URI from 'vscode-uri';

export interface IUri {
	readonly scheme: string;
	readonly authority: string;
	readonly path: string;
	readonly fsPath: string;
	readonly query: string;
	readonly fragment: string;

	toString(skipEncoding?: boolean): string;

	with(change: {
		scheme?: string;
		authority?: string | null;
		path?: string | null;
		query?: string | null;
		fragment?: string | null;
	}): IUri;
}

export function toVsUri(uri: IUri): URI.URI {
	if (uri instanceof URI.URI) {
		return uri;
	}
	return URI.URI.from(uri);
}

export function extname(uri: IUri): string {
	return URI.Utils.extname(toVsUri(uri));
}

export function dirname(uri: IUri): IUri {
	return URI.Utils.dirname(toVsUri(uri));
}

export function joinPath(uri: IUri, ...segments: string[]): IUri {
	return URI.Utils.joinPath(toVsUri(uri), ...segments);
}
