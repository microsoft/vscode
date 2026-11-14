/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { URI } from 'vscode-uri';

export const uriListMimeType = 'text/uri-list';

export class UriList {

	static from(str: string): UriList {
		const entries: { uri: URI; str: string }[] = [];
		const seen = new Set<string>();
		for (const value of str.split(/\r\n|\r|\n/)) {
			const line = value.trim();
			if (!line || line.startsWith('#') || seen.has(line)) {
				continue;
			}
			try {
				entries.push({ uri: URI.parse(line, true), str: line });
				seen.add(line);
			} catch {
				// Ignore invalid URI-list entries.
			}
		}
		return new UriList(entries);
	}

	static async fromDataTransfer(dataTransfer: vscode.DataTransfer): Promise<UriList> {
		const value = await dataTransfer.get(uriListMimeType)?.asString();
		if (value) {
			const uriList = UriList.from(value);
			if (uriList.entries.length) {
				return uriList;
			}
		}

		const uris = new Map<string, URI>();
		for (const [, item] of dataTransfer) {
			const uri = item.asFile()?.uri;
			if (uri) {
				uris.set(uri.toString(), uri);
			}
		}
		return new UriList(Array.from(uris, ([str, uri]) => ({ uri, str })));
	}

	constructor(
		public readonly entries: ReadonlyArray<{ readonly uri: URI; readonly str: string }>
	) { }
}
