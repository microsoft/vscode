/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
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

class SnippetsRegistry implements ISnippetsRegistry {

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

	public getSnippetCompletions(model: IReadOnlyModel, position: IPosition, result: ISuggestion[]): void {
		let modeId = model.getModeId();
		if (!this._snippets[modeId]) {
			return;
		}
		let word = model.getWordAtPosition(position);
		let currentWord = word ? word.word.substring(0, position.column - word.startColumn).toLowerCase() : '';
		let currentFullWord = getNonWhitespacePrefix(model, position).toLowerCase();

		this.visitSnippets(modeId, s => {
			let overwriteBefore: number;
			if (currentWord.length === 0 && currentFullWord.length === 0) {
				// if there's no prefix, only show snippets at the beginning of the line, or after a whitespace
				overwriteBefore = 0;
			} else {
				let label = s.prefix.toLowerCase();
				// force that the current word or full word matches with the snippet prefix
				if (currentWord.length > 0 && strings.startsWith(label, currentWord)) {
					overwriteBefore = currentWord.length;
				} else if (currentFullWord.length > currentWord.length && strings.startsWith(label, currentFullWord)) {
					overwriteBefore = currentFullWord.length;
				} else {
					return true;
				}
			}
			result.push({
				type: 'snippet',
				label: s.prefix,
				documentation: s.description,
				insertText: s.codeSnippet,
				noAutoAccept: true,
				isTMSnippet: true,
				overwriteBefore
			});
			return true;
		});
	}
}

export interface ISimpleModel {
	getLineContent(lineNumber): string;
}

export function getNonWhitespacePrefix(model: ISimpleModel, position: IPosition) : string {
	/**
	 * Do not analyze more characters
	 */
	const MAX_PREFIX_LENGTH = 100;

	let line = model.getLineContent(position.lineNumber).substr(0, position.column - 1);

	let minChIndex = Math.max(0, line.length - MAX_PREFIX_LENGTH);
	for (let chIndex = line.length - 1; chIndex >= minChIndex; chIndex--) {
		let ch = line.charAt(chIndex);

		if (/\s/.test(ch)) {
			return line.substr(chIndex + 1);
		}
	}

	if (minChIndex === 0) {
		return line;
	}

	return '';
}

const snippetsRegistry: ISnippetsRegistry = new SnippetsRegistry();
Registry.add(Extensions.Snippets, snippetsRegistry);

