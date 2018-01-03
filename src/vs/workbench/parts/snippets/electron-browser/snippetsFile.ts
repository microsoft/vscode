/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { readFile } from 'vs/base/node/pfs';
import { parse as jsonParse } from 'vs/base/common/json';
import { forEach } from 'vs/base/common/collections';
import { Snippet } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import { endsWith } from 'vs/base/common/strings';
import { basename } from 'path';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';

interface JsonSerializedSnippet {
	body: string;
	scope: string;
	prefix: string | string[];
	description: string;
}

function isJsonSerilziedSnippet(thing: any): thing is JsonSerializedSnippet {
	return Boolean((<JsonSerializedSnippet>thing).body) && Boolean((<JsonSerializedSnippet>thing).prefix);
}

interface JsonSerializedSnippets {
	[name: string]: JsonSerializedSnippet | { [name: string]: JsonSerializedSnippet };
}

export class SnippetFile {

	constructor(
		readonly filepath: string,
		readonly data: Snippet[]
	) {
		//
	}

	select(selector: string, bucket: Snippet[]): void {
		for (const snippet of this.data) {
			if (isFalsyOrEmpty(snippet.scopes)) {
				// always accept
				bucket.push(snippet);
			} else {
				// match
				for (const scope of snippet.scopes) {
					if (scope === selector) {
						bucket.push(snippet);
						break; // match only once!
					}
				}
			}
		}

		let idx = selector.lastIndexOf('.');
		if (idx >= 0) {
			this.select(selector.substring(0, idx), bucket);
		}
	}

	static fromFile(filepath: string, source: string, isFromExtension?: boolean): Promise<SnippetFile> {
		return Promise.resolve(readFile(filepath)).then(value => {
			const data = <JsonSerializedSnippets>jsonParse(value.toString());
			const snippets: Snippet[] = [];
			if (typeof data === 'object') {
				forEach(data, entry => {
					const { key: name, value: scopeOrTemplate } = entry;
					if (isJsonSerilziedSnippet(scopeOrTemplate)) {
						SnippetFile._parseSnippet(filepath, name, scopeOrTemplate, source, isFromExtension, snippets);
					} else {
						forEach(scopeOrTemplate, entry => {
							const { key: name, value: template } = entry;
							SnippetFile._parseSnippet(filepath, name, template, source, isFromExtension, snippets);
						});
					}
				});
			}
			return new SnippetFile(filepath, snippets);
		});
	}

	private static _parseSnippet(filepath: string, name: string, snippet: JsonSerializedSnippet, source: string, isFromExtension: boolean, bucket: Snippet[]): void {

		let { prefix, body, description } = snippet;

		if (Array.isArray(body)) {
			body = body.join('\n');
		}

		if (typeof prefix !== 'string' || typeof body !== 'string') {
			return;
		}

		let scopes: string[];
		if (endsWith(filepath, '.json')) {
			scopes = [basename(filepath, '.json')];
		} else if (typeof snippet.scope === 'string') {
			scopes = snippet.scope.split(',');
		} else {
			scopes = [];
		}

		bucket.push(new Snippet(
			scopes,
			name,
			prefix,
			description,
			body,
			source,
			isFromExtension
		));
	}
}
