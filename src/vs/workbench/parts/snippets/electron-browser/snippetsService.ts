/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import { IModel, IPosition } from 'vs/editor/common/editorCommon';
import { ISuggestion, LanguageId } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { setSnippetSuggestSupport } from 'vs/editor/contrib/suggest/browser/suggest';
import { IModeService } from 'vs/editor/common/services/modeService';

export const ISnippetsService = createDecorator<ISnippetsService>('snippetService');

export interface ISnippetsService {

	_serviceBrand: any;

	registerSnippets(languageId: LanguageId, snippets: ISnippet[], owner: string): void;

	visitSnippets(languageId: LanguageId, accept: (snippet: ISnippet) => void): void;
}

export interface ISnippet {
	name: string;
	prefix: string;
	description: string;
	codeSnippet: string;
	extensionName?: string;
}

interface ISnippetSuggestion extends ISuggestion {
	disambiguateLabel: string;
}

class SnippetsService implements ISnippetsService {

	_serviceBrand: any;

	private static _defaultDetail = localize('detail.userSnippet', "User Snippet");

	private _snippets = new Map<LanguageId, Map<string, ISnippet[]>>();

	constructor(
		@IModeService private _modeService: IModeService
	) {
		setSnippetSuggestSupport({
			provideCompletionItems: (model, position) => {
				const suggestions = this._getSnippetCompletions(<any>model, position);
				return { suggestions };
			}
		});
	}

	public registerSnippets(languageId: LanguageId, snippets: ISnippet[], fileName: string): void {
		if (!this._snippets.has(languageId)) {
			this._snippets.set(languageId, new Map<string, ISnippet[]>());
		}
		this._snippets.get(languageId).set(fileName, snippets);
	}

	public visitSnippets(languageId: LanguageId, accept: (snippet: ISnippet) => boolean): void {
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

	private _getLanguageIdAtPosition(model: IModel, position: IPosition): LanguageId {
		// validate the `languageId` to ensure this is a user
		// facing language with a name and the chance to have
		// snippets, else fall back to the outer language
		model.forceTokenization(position.lineNumber);
		let languageId = model.getLanguageIdAtPosition(position.lineNumber, position.column);
		let { language } = this._modeService.getLanguageIdentifier(languageId);
		if (!this._modeService.getLanguageName(language)) {
			languageId = model.getLanguageIdentifier().id;
		}
		return languageId;
	}

	private _getSnippetCompletions(model: IModel, position: IPosition): ISuggestion[] {
		const languageId = this._getLanguageIdAtPosition(model, position);
		if (!this._snippets.has(languageId)) {
			return undefined;
		}

		const result: ISnippetSuggestion[] = [];

		const word = model.getWordAtPosition(position);
		const currentWord = word ? word.word.substring(0, position.column - word.startColumn).toLowerCase() : '';
		const currentFullWord = getNonWhitespacePrefix(model, position).toLowerCase();

		this.visitSnippets(languageId, s => {
			const prefixLower = s.prefix.toLowerCase();

			let overwriteBefore = 0;
			if (currentWord.length > 0) {
				// there is a word -> the prefix should match that
				if (strings.startsWith(prefixLower, currentWord)) {
					overwriteBefore = currentWord.length;
				} else {
					return true;
				}

			} else if (currentFullWord.length > currentWord.length) {
				// there is something -> fine if it matches
				overwriteBefore = strings.commonPrefixLength(prefixLower, currentFullWord);
			}

			// store in result
			result.push({
				type: 'snippet',
				label: s.prefix,
				get disambiguateLabel() { return localize('snippetSuggest.longLabel', "{0}, {1}", s.prefix, s.name); },
				detail: s.extensionName || SnippetsService._defaultDetail,
				documentation: s.description,
				insertText: s.codeSnippet,
				sortText: `${s.prefix}-${s.extensionName || ''}`,
				noAutoAccept: true,
				snippetType: 'textmate',
				overwriteBefore
			});

			return true;
		});

		// dismbiguate suggestions with same labels
		let lastSuggestion: ISnippetSuggestion;
		for (const suggestion of result.sort(SnippetsService._compareSuggestionsByLabel)) {
			if (lastSuggestion && lastSuggestion.label === suggestion.label) {
				// use the disambiguateLabel instead of the actual label
				lastSuggestion.label = lastSuggestion.disambiguateLabel;
				suggestion.label = suggestion.disambiguateLabel;
			}
			lastSuggestion = suggestion;
		}

		return result;
	}

	private static _compareSuggestionsByLabel(a: ISuggestion, b: ISuggestion): number {
		return strings.compare(a.label, b.label);
	}
}

registerSingleton(ISnippetsService, SnippetsService);

export interface ISimpleModel {
	getLineContent(lineNumber): string;
}

export function getNonWhitespacePrefix(model: ISimpleModel, position: IPosition): string {
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

