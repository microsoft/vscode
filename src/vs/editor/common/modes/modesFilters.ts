/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ISuggestionFilter, ISuggestion} from 'vs/editor/common/modes';
import * as Filters from 'vs/base/common/filters';
import {isFalsyOrEmpty} from 'vs/base/common/arrays';

export type IMatch = Filters.IMatch;

function wrapBaseFilter(filter: Filters.IFilter): ISuggestionFilter {
	return (word: string, suggestion: ISuggestion): Filters.IMatch[] => {
		const result = filter(word, suggestion.filterText || suggestion.label);
		return isFalsyOrEmpty(result) ? undefined : result;
	};
}

export var StrictPrefix: ISuggestionFilter = wrapBaseFilter(Filters.matchesStrictPrefix);
export var Prefix: ISuggestionFilter = wrapBaseFilter(Filters.matchesPrefix);
export var CamelCase: ISuggestionFilter = wrapBaseFilter(Filters.matchesCamelCase);
export var ContiguousSubString: ISuggestionFilter = wrapBaseFilter(Filters.matchesContiguousSubString);

// Combined Filters

export function or(first: ISuggestionFilter, second: ISuggestionFilter): ISuggestionFilter {
	return (word: string, suggestion: ISuggestion): Filters.IMatch[] => {
		return first(word, suggestion) || second(word, suggestion);
	};
}

export function and(first: ISuggestionFilter, second: ISuggestionFilter): ISuggestionFilter {
	return (word: string, suggestion: ISuggestion): Filters.IMatch[] => {
		return first(word, suggestion) && second(word, suggestion);
	};
}

export var DefaultFilter = or(or(Prefix, CamelCase), ContiguousSubString);