/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as jsonParse, getNodeType } from '../../../../base/common/json.js';
import { localize } from '../../../../nls.js';
import { extname, basename } from '../../../../base/common/path.js';
import { SnippetParser, Variable, Placeholder, Text } from '../../../../editor/contrib/snippet/browser/snippetParser.js';
import { KnownSnippetVariableNames } from '../../../../editor/contrib/snippet/browser/snippetVariables.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { relativePath } from '../../../../base/common/resources.js';
import { isObject } from '../../../../base/common/types.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { WindowIdleValue, getActiveWindow } from '../../../../base/browser/dom.js';

class SnippetBodyInsights {

	readonly codeSnippet: string;

	/** The snippet uses bad placeholders which collide with variable names */
	readonly isBogous: boolean;

	/** The snippet has no placeholder of the final placeholder is at the end */
	readonly isTrivial: boolean;

	readonly usesClipboardVariable: boolean;
	readonly usesSelectionVariable: boolean;

	constructor(body: string) {

		// init with defaults
		this.isBogous = false;
		this.isTrivial = false;
		this.usesClipboardVariable = false;
		this.usesSelectionVariable = false;
		this.codeSnippet = body;

		// check snippet...
		const textmateSnippet = new SnippetParser().parse(body, false);

		const placeholders = new Map<string, number>();
		let placeholderMax = 0;
		for (const placeholder of textmateSnippet.placeholders) {
			placeholderMax = Math.max(placeholderMax, placeholder.index);
		}

		// mark snippet as trivial when there is no placeholders or when the only
		// placeholder is the final tabstop and it is at the very end.
		if (textmateSnippet.placeholders.length === 0) {
			this.isTrivial = true;
		} else if (placeholderMax === 0) {
			const last = textmateSnippet.children.at(-1);
			this.isTrivial = last instanceof Placeholder && last.isFinalTabstop;
		}

		const stack = [...textmateSnippet.children];
		while (stack.length > 0) {
			const marker = stack.shift()!;
			if (marker instanceof Variable) {

				if (marker.children.length === 0 && !KnownSnippetVariableNames[marker.name]) {
					// a 'variable' without a default value and not being one of our supported
					// variables is automatically turned into a placeholder. This is to restore
					// a bug we had before. So `${foo}` becomes `${N:foo}`
					const index = placeholders.has(marker.name) ? placeholders.get(marker.name)! : ++placeholderMax;
					placeholders.set(marker.name, index);

					const synthetic = new Placeholder(index).appendChild(new Text(marker.name));
					textmateSnippet.replace(marker, [synthetic]);
					this.isBogous = true;
				}

				switch (marker.name) {
					case 'CLIPBOARD':
						this.usesClipboardVariable = true;
						break;
					case 'SELECTION':
					case 'TM_SELECTED_TEXT':
						this.usesSelectionVariable = true;
						break;
				}

			} else {
				// recurse
				stack.push(...marker.children);
			}
		}

		if (this.isBogous) {
			this.codeSnippet = textmateSnippet.toTextmateString();
		}

	}
}

export class Snippet {

	private readonly _bodyInsights: WindowIdleValue<SnippetBodyInsights>;

	readonly prefixLow: string;

	constructor(
		readonly isFileTemplate: boolean,
		readonly scopes: string[],
		readonly name: string,
		readonly prefix: string,
		readonly description: string,
		readonly body: string,
		readonly source: string,
		readonly snippetSource: SnippetSource,
		readonly snippetIdentifier: string,
		readonly extensionId?: ExtensionIdentifier,
	) {
		this.prefixLow = prefix.toLowerCase();
		this._bodyInsights = new WindowIdleValue(getActiveWindow(), () => new SnippetBodyInsights(this.body));
	}

	get codeSnippet(): string {
		return this._bodyInsights.value.codeSnippet;
	}

	get isBogous(): boolean {
		return this._bodyInsights.value.isBogous;
	}

	get isTrivial(): boolean {
		return this._bodyInsights.value.isTrivial;
	}

	get needsClipboard(): boolean {
		return this._bodyInsights.value.usesClipboardVariable;
	}

	get usesSelection(): boolean {
		return this._bodyInsights.value.usesSelectionVariable;
	}
}


interface JsonSerializedSnippet {
	isFileTemplate?: boolean;
	body: string | string[];
	scope?: string;
	prefix: string | string[] | undefined;
	description: string;
}

function isJsonSerializedSnippet(thing: any): thing is JsonSerializedSnippet {
	return isObject(thing) && Boolean((<JsonSerializedSnippet>thing).body);
}

interface JsonSerializedSnippets {
	[name: string]: JsonSerializedSnippet | { [name: string]: JsonSerializedSnippet };
}

export const enum SnippetSource {
	User = 1,
	Workspace = 2,
	Extension = 3,
}

export class SnippetFile {

	readonly data: Snippet[] = [];
	readonly isGlobalSnippets: boolean;
	readonly isUserSnippets: boolean;

	private _loadPromise?: Promise<this>;

	constructor(
		readonly source: SnippetSource,
		readonly location: URI,
		public defaultScopes: string[] | undefined,
		private readonly _extension: IExtensionDescription | undefined,
		private readonly _fileService: IFileService,
		private readonly _extensionResourceLoaderService: IExtensionResourceLoaderService,
	) {
		this.isGlobalSnippets = extname(location.path) === '.code-snippets';
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
		if (selector + '.json' === basename(this.location.path)) {
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

		const idx = selector.lastIndexOf('.');
		if (idx >= 0) {
			this._scopeSelect(selector.substring(0, idx), bucket);
		}
	}

	private async _load(): Promise<string> {
		if (this._extension) {
			return this._extensionResourceLoaderService.readExtensionResource(this.location);
		} else {
			const content = await this._fileService.readFile(this.location);
			return content.value.toString();
		}
	}

	load(): Promise<this> {
		if (!this._loadPromise) {
			this._loadPromise = Promise.resolve(this._load()).then(content => {
				const data = <JsonSerializedSnippets>jsonParse(content);
				if (getNodeType(data) === 'object') {
					for (const [name, scopeOrTemplate] of Object.entries(data)) {
						if (isJsonSerializedSnippet(scopeOrTemplate)) {
							this._parseSnippet(name, scopeOrTemplate, this.data);
						} else {
							for (const [name, template] of Object.entries(scopeOrTemplate)) {
								this._parseSnippet(name, template, this.data);
							}
						}
					}
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

		let { isFileTemplate, prefix, body, description } = snippet;

		if (!prefix) {
			prefix = '';
		}

		if (Array.isArray(body)) {
			body = body.join('\n');
		}
		if (typeof body !== 'string') {
			return;
		}

		if (Array.isArray(description)) {
			description = description.join('\n');
		}

		let scopes: string[];
		if (this.defaultScopes) {
			scopes = this.defaultScopes;
		} else if (typeof snippet.scope === 'string') {
			scopes = snippet.scope.split(',').map(s => s.trim()).filter(Boolean);
		} else {
			scopes = [];
		}

		let source: string;
		if (this._extension) {
			// extension snippet -> show the name of the extension
			source = this._extension.displayName || this._extension.name;

		} else if (this.source === SnippetSource.Workspace) {
			// workspace -> only *.code-snippets files
			source = localize('source.workspaceSnippetGlobal', "Workspace Snippet");
		} else {
			// user -> global (*.code-snippets) and language snippets
			if (this.isGlobalSnippets) {
				source = localize('source.userSnippetGlobal', "Global User Snippet");
			} else {
				source = localize('source.userSnippet', "User Snippet");
			}
		}

		for (const _prefix of Iterable.wrap(prefix)) {
			bucket.push(new Snippet(
				Boolean(isFileTemplate),
				scopes,
				name,
				_prefix,
				description,
				body,
				source,
				this.source,
				this._extension ? `${relativePath(this._extension.extensionLocation, this.location)}/${name}` : `${basename(this.location.path)}/${name}`,
				this._extension?.identifier,
			));
		}
	}
}
