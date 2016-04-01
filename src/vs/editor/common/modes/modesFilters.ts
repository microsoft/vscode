/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import * as filters from 'vs/base/common/filters';
import {ISuggestion, ISuggestionFilter} from 'vs/editor/common/modes';

export type IMatch = filters.IMatch;

function wrapBaseFilter(filter: filters.IFilter): ISuggestionFilter {
	return (word: string, suggestion: ISuggestion): filters.IMatch[] => {

		let result = filter(word, suggestion.label);
		if (!isFalsyOrEmpty(result)) {
			return result;
		}

		if (typeof suggestion.filterText === 'string') {
			// only check for an actual match but swap it with an _empty_
			// match because we use the label with the matches/highlights
			if (!isFalsyOrEmpty(filter(word, suggestion.filterText))) {
				return [{ start: 0, end: 0 }];
			}
		}
	};
}

export var StrictPrefix: ISuggestionFilter = wrapBaseFilter(filters.matchesStrictPrefix);
export var Prefix: ISuggestionFilter = wrapBaseFilter(filters.matchesPrefix);
export var CamelCase: ISuggestionFilter = wrapBaseFilter(filters.matchesCamelCase);
export var ContiguousSubString: ISuggestionFilter = wrapBaseFilter(filters.matchesContiguousSubString);

// Combined Filters

export function or(first: ISuggestionFilter, second: ISuggestionFilter): ISuggestionFilter {
	return (word, suggestion) => first(word, suggestion) || second(word, suggestion);
}

export function and(first: ISuggestionFilter, second: ISuggestionFilter): ISuggestionFilter {
	return (word, suggestion) => first(word, suggestion) && second(word, suggestion);
}

export var DefaultFilter = or(or(Prefix, CamelCase), ContiguousSubString);