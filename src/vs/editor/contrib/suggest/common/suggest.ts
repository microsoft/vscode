/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {sequence} from 'vs/base/common/async';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import {TPromise} from 'vs/base/common/winjs.base';
import {mixin} from 'vs/base/common/objects';
import {onUnexpectedError, illegalArgument} from 'vs/base/common/errors';
import {ISuggestSupport, ISuggestions} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

export var CONTEXT_SUGGEST_WIDGET_VISIBLE = 'suggestWidgetVisible';
export var CONTEXT_SUGGESTION_SUPPORTS_ACCEPT_ON_KEY = 'suggestionSupportsAcceptOnKey';
export var ACCEPT_SELECTED_SUGGESTION_CMD = 'acceptSelectedSuggestion';

export var SuggestRegistry = new LanguageFeatureRegistry<ISuggestSupport>('suggestSupport');

export interface ISuggestions2 extends ISuggestions {
	support?: ISuggestSupport;
}

export function suggest(model: IModel, position: IPosition, triggerCharacter: string, groups?: ISuggestSupport[][]): TPromise<ISuggestions2[][]> {

	if (!groups) {
		groups = SuggestRegistry.orderedGroups(model);
	}

	const resource = model.getAssociatedResource();
	const suggestions: ISuggestions[][] = [];

	const factory = groups.map((supports, index) => {
		return () => {

			// stop as soon as a group produced a result
			if (suggestions.length > 0) {
				return;
			}

			// for each support in the group ask for suggestions
			let promises = supports.map(support => {
				return support.suggest(resource, position, triggerCharacter).then(value => {

					let result: ISuggestions2[] = [];
					for (let suggestions of value) {

						if (!suggestions
							|| !Array.isArray(suggestions.suggestions)
							|| suggestions.suggestions.length === 0) {

							continue;
						}

						const suggestions2: ISuggestions2 = {
							support,
							currentWord: suggestions.currentWord,
							incomplete: suggestions.incomplete,
							overwriteAfter: suggestions.overwriteAfter,
							overwriteBefore: suggestions.overwriteBefore,
							suggestions: suggestions.suggestions
						}

						// add additional properties
						mixin(suggestions2, suggestions, false);
						result.push(suggestions2);
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

	return sequence(factory).then(() => suggestions);
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeCompletionItemProvider', (model, position, args) => {

	let triggerCharacter = args['triggerCharacter'];
	if (typeof triggerCharacter !== 'undefined' && typeof triggerCharacter !== 'string') {
		throw illegalArgument('triggerCharacter');
	}

	return suggest(model, position, triggerCharacter);
});