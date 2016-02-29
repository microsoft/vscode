/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {sequence} from 'vs/base/common/async';
import {illegalArgument, onUnexpectedError} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ISuggestResult, ISuggestSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {SnippetsRegistry} from 'vs/editor/common/modes/supports';

export var CONTEXT_SUGGEST_WIDGET_VISIBLE = 'suggestWidgetVisible';
export var CONTEXT_SUGGESTION_SUPPORTS_ACCEPT_ON_KEY = 'suggestionSupportsAcceptOnKey';
export var ACCEPT_SELECTED_SUGGESTION_CMD = 'acceptSelectedSuggestion';

export var SuggestRegistry = new LanguageFeatureRegistry<ISuggestSupport>('suggestSupport');

export interface ISuggestResult2 extends ISuggestResult {
	support?: ISuggestSupport;
}

export function suggest(model: IModel, position: IPosition, triggerCharacter: string, groups?: ISuggestSupport[][]): TPromise<ISuggestResult2[][]> {

	if (!groups) {
		groups = SuggestRegistry.orderedGroups(model);
	}

	const resource = model.getAssociatedResource();
	const suggestions: ISuggestResult[][] = [];

	const factory = groups.map((supports, index) => {
		return () => {

			// stop as soon as a group produced a result
			if (suggestions.length > 0) {
				return;
			}

			// for each support in the group ask for suggestions
			const promises = supports.map(support => {
				return support.suggest(resource, position, triggerCharacter).then(values => {

					const result: ISuggestResult2[] = [];
					for (let suggestResult of values) {

						if (!suggestResult
							|| !Array.isArray(suggestResult.suggestions)
							|| suggestResult.suggestions.length === 0) {
							continue;
						}

						result.push({
							support,
							currentWord: suggestResult.currentWord,
							incomplete: suggestResult.incomplete,
							suggestions: suggestResult.suggestions
						});
					}

					return result;

				}, onUnexpectedError);
			});

			return TPromise.join(promises).then(values => {
				for (let value of values) {
					if (Array.isArray(value) && value.length > 0) {
						suggestions.push(value);
					}
				}
			});
		};
	});

	return sequence(factory).then(() => {
		// add snippets to the first group
		const snippets = SnippetsRegistry.getSnippets(model, position);
		if (suggestions.length === 0) {
			suggestions.push([snippets]);
		} else {
			suggestions[0].push(snippets);
		}
		return suggestions;
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeCompletionItemProvider', (model, position, args) => {

	let triggerCharacter = args['triggerCharacter'];
	if (typeof triggerCharacter !== 'undefined' && typeof triggerCharacter !== 'string') {
		throw illegalArgument('triggerCharacter');
	}

	return suggest(model, position, triggerCharacter);
});
