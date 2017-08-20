/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IModel } from 'vs/editor/common/editorCommon';
import { ISuggestSupport, ISuggestResult, ISuggestion, LanguageId, SuggestionType, SnippetType } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { setSnippetSuggestSupport } from 'vs/editor/contrib/suggest/browser/suggest';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Position } from 'vs/editor/common/core/position';
import { overlap, compare, startsWith } from 'vs/base/common/strings';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';

export const ISnippetsService = createDecorator<ISnippetsService>('snippetService');

export interface ISnippetsService {

	_serviceBrand: any;

	registerSnippets(languageId: LanguageId, snippets: ISnippet[], owner: string): void;

	visitSnippets(languageId: LanguageId, accept: (snippet: ISnippet) => boolean): void;

	getSnippets(languageId: LanguageId): ISnippet[];
}

export interface ISnippet {
	name: string;
	prefix: string;
	description: string;
	codeSnippet: string;
	extensionName?: string;
}

export class SnippetsService implements ISnippetsService {

	_serviceBrand: any;

	private readonly _snippets = new Map<LanguageId, Map<string, ISnippet[]>>();

	constructor(
		@IModeService modeService: IModeService
	) {
		setSnippetSuggestSupport(new SnippetSuggestProvider(modeService, this));
	}

	registerSnippets(languageId: LanguageId, snippets: ISnippet[], fileName: string): void {
		if (!this._snippets.has(languageId)) {
			this._snippets.set(languageId, new Map<string, ISnippet[]>());
		}
		this._snippets.get(languageId).set(fileName, snippets);
	}

	visitSnippets(languageId: LanguageId, accept: (snippet: ISnippet) => boolean): void {
		const modeSnippets = this._snippets.get(languageId);
		if (modeSnippets) {
			modeSnippets.forEach(snippets => {
				let result = snippets.every(accept);
				if (!result) {
					return;
				}
			});
		}
	}

	getSnippets(languageId: LanguageId): ISnippet[] {
		const modeSnippets = this._snippets.get(languageId);
		const ret: ISnippet[] = [];
		if (modeSnippets) {
			modeSnippets.forEach(snippets => {
				ret.push(...snippets);
			});
		}
		return ret;
	}
}

registerSingleton(ISnippetsService, SnippetsService);

export interface ISimpleModel {
	getLineContent(lineNumber: number): string;
}

export class SnippetSuggestion implements ISuggestion {

	private static _userSnippet = localize('source.snippet', "User Snippet");

	label: string;
	detail: string;
	insertText: string;
	documentation: string;
	overwriteBefore: number;
	sortText: string;
	noAutoAccept: boolean;
	type: SuggestionType;
	snippetType: SnippetType;


	constructor(
		readonly snippet: ISnippet,
		overwriteBefore: number
	) {
		this.label = snippet.prefix;
		this.detail = localize('detail.snippet', "{0} ({1})", snippet.description, snippet.extensionName || SnippetSuggestion._userSnippet);
		this.insertText = snippet.codeSnippet;
		this.overwriteBefore = overwriteBefore;
		this.sortText = `${snippet.prefix}-${snippet.extensionName || ''}`;
		this.noAutoAccept = true;
		this.type = 'snippet';
		this.snippetType = 'textmate';
	}

	resolve(): this {
		this.documentation = new SnippetParser().text(this.snippet.codeSnippet);
		return this;
	}

	static compareByLabel(a: SnippetSuggestion, b: SnippetSuggestion): number {
		return compare(a.label, b.label);
	}
}


export class SnippetSuggestProvider implements ISuggestSupport {

	constructor(
		@IModeService private _modeService: IModeService,
		@ISnippetsService private _snippets: ISnippetsService
	) {
		//
	}

	provideCompletionItems(model: IModel, position: Position): ISuggestResult {

		const languageId = this._getLanguageIdAtPosition(model, position);
		const snippets = this._snippets.getSnippets(languageId);
		const suggestions: SnippetSuggestion[] = [];

		const lowWordUntil = model.getWordUntilPosition(position).word.toLowerCase();
		const lowLineUntil = model.getLineContent(position.lineNumber).substr(Math.max(0, position.column - 100), position.column - 1).toLowerCase();

		for (const snippet of snippets) {

			const lowPrefix = snippet.prefix.toLowerCase();
			let overwriteBefore = 0;
			let accetSnippet = true;

			if (lowWordUntil.length > 0 && startsWith(lowPrefix, lowWordUntil)) {
				// cheap match on the (none-empty) current word
				overwriteBefore = lowWordUntil.length;
				accetSnippet = true;

			} else if (lowLineUntil.length > 0 && lowLineUntil.match(/[^\s]$/)) {
				// compute overlap between snippet and (none-empty) line on text
				overwriteBefore = overlap(lowLineUntil, snippet.prefix.toLowerCase());
				accetSnippet = overwriteBefore > 0 && !model.getWordAtPosition(new Position(position.lineNumber, position.column - overwriteBefore));
			}

			if (accetSnippet) {
				suggestions.push(new SnippetSuggestion(snippet, overwriteBefore));
			}
		}

		// dismbiguate suggestions with same labels
		let lastItem: SnippetSuggestion;
		for (const item of suggestions.sort(SnippetSuggestion.compareByLabel)) {
			if (lastItem && lastItem.label === item.label) {
				// use the disambiguateLabel instead of the actual label
				lastItem.label = localize('snippetSuggest.longLabel', "{0}, {1}", lastItem.label, lastItem.snippet.name);
				item.label = localize('snippetSuggest.longLabel', "{0}, {1}", item.label, item.snippet.name);
			}
			lastItem = item;
		}

		return { suggestions };
	}

	resolveCompletionItem?(model: IModel, position: Position, item: ISuggestion): ISuggestion {
		return (item instanceof SnippetSuggestion) ? item.resolve() : item;
	}

	private _getLanguageIdAtPosition(model: IModel, position: Position): LanguageId {
		// validate the `languageId` to ensure this is a user
		// facing language with a name and the chance to have
		// snippets, else fall back to the outer language
		model.tokenizeIfCheap(position.lineNumber);
		let languageId = model.getLanguageIdAtPosition(position.lineNumber, position.column);
		let { language } = this._modeService.getLanguageIdentifier(languageId);
		if (!this._modeService.getLanguageName(language)) {
			languageId = model.getLanguageIdentifier().id;
		}
		return languageId;
	}


}

export function getNonWhitespacePrefix(model: ISimpleModel, position: Position): string {
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

