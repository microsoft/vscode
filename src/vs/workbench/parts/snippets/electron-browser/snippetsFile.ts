/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { parse as jsonParse } from 'vs/base/common/json';
import { forEach } from 'vs/base/common/collections';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { localize } from 'vs/nls';
import { readFile } from 'vs/base/node/pfs';
import { basename, extname } from 'path';
import { SnippetParser, Variable, Placeholder, Text } from 'vs/editor/contrib/snippet/snippetParser';
import { KnownSnippetVariableNames } from 'vs/editor/contrib/snippet/snippetVariables';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';

export class Snippet {

	private _codeSnippet: string;
	private _isBogous: boolean;

	constructor(
		readonly scopes: string[],
		readonly name: string,
		readonly prefix: string,
		readonly description: string,
		readonly body: string,
		readonly source: string,
		readonly isFromExtension?: boolean,
	) {
		//
	}

	get codeSnippet(): string {
		this._ensureCodeSnippet();
		return this._codeSnippet;
	}

	get isBogous(): boolean {
		this._ensureCodeSnippet();
		return this._isBogous;
	}

	private _ensureCodeSnippet() {
		if (!this._codeSnippet) {
			const rewrite = Snippet._rewriteBogousVariables(this.body);
			if (typeof rewrite === 'string') {
				this._codeSnippet = rewrite;
				this._isBogous = true;
			} else {
				this._codeSnippet = this.body;
				this._isBogous = false;
			}
		}
	}

	static compare(a: Snippet, b: Snippet): number {
		if (a.isFromExtension !== b.isFromExtension) {
			if (a.isFromExtension) {
				return 1;
			} else {
				return -1;
			}
		} else if (a.name > b.name) {
			return 1;
		} else if (a.name < b.name) {
			return -1;
		} else {
			return 0;
		}
	}

	static _rewriteBogousVariables(template: string): false | string {
		const textmateSnippet = new SnippetParser().parse(template, false);

		let placeholders = new Map<string, number>();
		let placeholderMax = 0;
		for (const placeholder of textmateSnippet.placeholders) {
			placeholderMax = Math.max(placeholderMax, placeholder.index);
		}

		let didChange = false;
		let stack = [...textmateSnippet.children];

		while (stack.length > 0) {
			let marker = stack.shift();

			if (
				marker instanceof Variable
				&& marker.children.length === 0
				&& !KnownSnippetVariableNames[marker.name]
			) {
				// a 'variable' without a default value and not being one of our supported
				// variables is automatically turned into a placeholder. This is to restore
				// a bug we had before. So `${foo}` becomes `${N:foo}`
				const index = placeholders.has(marker.name) ? placeholders.get(marker.name) : ++placeholderMax;
				placeholders.set(marker.name, index);

				const synthetic = new Placeholder(index).appendChild(new Text(marker.name));
				textmateSnippet.replace(marker, [synthetic]);
				didChange = true;

			} else {
				// recurse
				stack.push(...marker.children);
			}
		}

		if (!didChange) {
			return false;
		} else {
			return textmateSnippet.toTextmateString();
		}
	}
}


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
	readonly isGlobalSnippets: boolean;
	readonly isUserSnippets: boolean;

	private _loadPromise: Promise<this>;

	constructor(
		readonly filepath: string,
		readonly defaultScopes: string[],
		private readonly _extension: IExtensionDescription
	) {
		this.isGlobalSnippets = extname(filepath) === '.code-snippets';
		this.isUserSnippets = !this._extension;
	}

	select(selector: string, bucket: Snippet[]): void {
		if (this.isGlobalSnippets || !this.isUserSnippets) {
			this._scopeSelect(selector, bucket);
		} else {
			this._filepathSelect(selector, bucket);
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
		if (this.defaultScopes) {
			scopes = this.defaultScopes;
		} else if (typeof snippet.scope === 'string') {
			scopes = snippet.scope.split(',').map(s => s.trim()).filter(s => !isFalsyOrWhitespace(s));
		} else {
			scopes = [];
		}

		let source: string;
		if (this._extension) {
			source = this._extension.displayName || this._extension.name;
		} else if (this.isGlobalSnippets) {
			source = localize('source.snippetGlobal', "Global User Snippet");
		} else {
			source = localize('source.snippet', "User Snippet");
		}

		bucket.push(new Snippet(
			scopes,
			name,
			prefix,
			description,
			body,
			source,
			this._extension !== void 0
		));
	}
}
