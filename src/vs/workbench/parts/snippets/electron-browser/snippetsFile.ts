/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { parse as jsonParse } from 'vs/base/common/json';
import { forEach } from 'vs/base/common/collections';
import { Snippet } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { localize } from 'vs/nls';
import { readFile } from 'vs/base/node/pfs';
import { endsWith } from 'vs/base/common/strings';
import { basename } from 'path';

interface JsonSerializedSnippet {
	body: string;
	scope: string;
	prefix: string | string[];
	description: string;
}

function isJsonSerializedSnippet(thing: any): thing is JsonSerializedSnippet {
	return Boolean((<JsonSerializedSnippet>thing).body) && Boolean((<JsonSerializedSnippet>thing).prefix);
}

interface JsonSerializedSnippets {
	[name: string]: JsonSerializedSnippet | { [name: string]: JsonSerializedSnippet };
}

export class SnippetFile {

	readonly data: Snippet[] = [];
	private _loadPromise: Promise<this>;

	constructor(
		readonly filepath: string,
		private readonly _defaultScope: string,
		private readonly _extension: IExtensionDescription
	) {
		//
	}

	select(selector: string, bucket: Snippet[]): void {
		if (endsWith(this.filepath, '.json')) {
			this._filepathSelect(selector, bucket);
		} else {
			this._scopeSelect(selector, bucket);
		}
	}

	private _filepathSelect(selector: string, bucket: Snippet[]): void {
		// for `fooLang.json` files all snippets are accepted
		if (selector === basename(this.filepath, '.json')) {
			bucket.push(...this.data);
		}
	}

	private _scopeSelect(selector: string, bucket: Snippet[]): void {
		// for `my.code-snippets` files we need to look at each snippet
		for (const snippet of this.data) {
			const len = snippet.scopes.length;
			if (len === 0) {
				// always accept
				bucket.push(snippet);

			} else {
				for (let i = 0; i < len; i++) {
					// match
					if (snippet.scopes[i] === selector) {
						bucket.push(snippet);
						break; // match only once!
					}
				}
			}
		}

		let idx = selector.lastIndexOf('.');
		if (idx >= 0) {
			this._scopeSelect(selector.substring(0, idx), bucket);
		}
	}

	load(): Promise<this> {
		if (!this._loadPromise) {
			this._loadPromise = Promise.resolve(readFile(this.filepath)).then(value => {
				const data = <JsonSerializedSnippets>jsonParse(value.toString());
				if (typeof data === 'object') {
					forEach(data, entry => {
						const { key: name, value: scopeOrTemplate } = entry;
						if (isJsonSerializedSnippet(scopeOrTemplate)) {
							this._parseSnippet(name, scopeOrTemplate, this.data);
						} else {
							forEach(scopeOrTemplate, entry => {
								const { key: name, value: template } = entry;
								this._parseSnippet(name, template, this.data);
							});
						}
					});
				}
				return this;
			});
		}
		return this._loadPromise;
	}

	reset(): void {
		this._loadPromise = undefined;
		this.data.length = 0;
	}

	private _parseSnippet(name: string, snippet: JsonSerializedSnippet, bucket: Snippet[]): void {

		let { prefix, body, description } = snippet;

		if (Array.isArray(body)) {
			body = body.join('\n');
		}

		if (typeof prefix !== 'string' || typeof body !== 'string') {
			return;
		}

		let scopes: string[];
		if (this._defaultScope) {
			scopes = [this._defaultScope];
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
			this._extension ? (this._extension.displayName || this._extension.name) : localize('source.snippet', "User Snippet"),
			this._extension !== void 0
		));
	}
}
