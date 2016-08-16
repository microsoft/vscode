/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IReadOnlyModel, IPosition} from 'vs/editor/common/editorCommon';
import {ISuggestion} from 'vs/editor/common/modes';
import {Registry} from 'vs/platform/platform';

export const Extensions = {
	Snippets: 'base.contributions.snippets'
};

export interface ISnippetsRegistry {

	/**
	 * Register a snippet to the registry.
	 */
	registerSnippets(modeId: string, snippets: ISnippet[], owner?: string): void;

	/**
	 * Visit all snippets
	 */
	visitSnippets(modeId: string, accept: (snippet: ISnippet) => void): void;

	/**
	 * Get all snippet completions for the given position
	 */
	getSnippetCompletions(model: IReadOnlyModel, position: IPosition, result: ISuggestion[]): void;

}

export interface ISnippet {
	prefix: string;
	description: string;
	codeSnippet: string;
}

class SnippetsRegistry {

	private _snippets: { [modeId: string]: { [owner: string]: ISnippet[] } } = Object.create(null);

	public registerSnippets(modeId: string, snippets: ISnippet[], owner = ''): void {
		let snippetsByMode = this._snippets[modeId];
		if (!snippetsByMode) {
			this._snippets[modeId] = snippetsByMode = {};
		}
		snippetsByMode[owner] = snippets;
	}

	public visitSnippets(modeId: string, accept: (snippet: ISnippet) => boolean): void {
		let snippetsByMode = this._snippets[modeId];
		if (snippetsByMode) {
			for (let s in snippetsByMode) {
				let result = snippetsByMode[s].every(accept);
				if (!result) {
					return;
				}
			}
		}
	}
}

export function getNonWhitespacePrefix(model: IReadOnlyModel, position: IPosition) : string {
	let line = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
	let match = line.match(/[^\s]+$/);
	if (match) {
		return match[0];
	}
	return '';
}

const snippetsRegistry = new SnippetsRegistry();
Registry.add(Extensions.Snippets, snippetsRegistry);

