/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { readFile } from 'vs/base/node/pfs';
import { parse as jsonParse } from 'vs/base/common/json';
import { TPromise } from 'vs/base/common/winjs.base';
import { SnippetParser, Variable, Placeholder, Text } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { EditorSnippetVariableResolver } from 'vs/editor/contrib/snippet/browser/snippetVariables';
import { forEach } from 'vs/base/common/collections';
import { Snippet } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';

interface JsonSerializedSnippet {
	body: string;
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

	private constructor(
		readonly filepath: string,
		readonly data: Snippet[]
	) {
		//
	}

	static fromFile(filepath: string, source: string, isFromExtension?: boolean): TPromise<SnippetFile> {
		return readFile(filepath).then(value => {
			const data = <JsonSerializedSnippets>jsonParse(value.toString());
			const snippets: Snippet[] = [];
			if (typeof data === 'object') {
				forEach(data, entry => {
					const { key: name, value: scopeOrTemplate } = entry;
					if (isJsonSerilziedSnippet(scopeOrTemplate)) {
						SnippetFile._parseSnippet(name, scopeOrTemplate, source, isFromExtension, snippets);
					} else {
						forEach(scopeOrTemplate, entry => {
							const { key: name, value: template } = entry;
							SnippetFile._parseSnippet(name, template, source, isFromExtension, snippets);
						});
					}
				});
			}
			return new SnippetFile(filepath, snippets);
		});
	}

	private static _parseSnippet(name: string, snippet: JsonSerializedSnippet, source: string, isFromExtension: boolean, bucket: Snippet[]): void {

		let { prefix, body, description } = snippet;

		if (Array.isArray(body)) {
			body = body.join('\n');
		}

		if (typeof prefix !== 'string' || typeof body !== 'string') {
			return;
		}

		let rewrite = SnippetFile._rewriteBogousVariables(body);
		let isBogous = false;
		if (typeof rewrite === 'string') {
			body = rewrite;
			isBogous = true;
		}

		bucket.push({
			codeSnippet: body,
			name,
			prefix,
			description,
			source,
			isFromExtension,
			isBogous
		});
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
				&& !EditorSnippetVariableResolver.VariableNames[marker.name]
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
