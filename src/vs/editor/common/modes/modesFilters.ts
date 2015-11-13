/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IFilter, ISuggestion} from 'vs/editor/common/modes';
import Filters = require('vs/base/common/filters');

function wrapBaseFilter(filter:Filters.IFilter):IFilter {
	return (word:string, suggestion:ISuggestion):boolean => {
		var highlights = filter(word, suggestion.filterText || suggestion.label);
		suggestion.highlights = highlights || [];
		return !!highlights;
	};
}

export var StrictPrefix: IFilter = wrapBaseFilter(Filters.matchesStrictPrefix);
export var Prefix:IFilter = wrapBaseFilter(Filters.matchesPrefix);
export var CamelCase: IFilter = wrapBaseFilter(Filters.matchesCamelCase);
export var ContiguousSubString:IFilter = wrapBaseFilter(Filters.matchesContiguousSubString);

// Combined Filters

export function or(first:IFilter, second:IFilter):IFilter {
	return (word:string, suggestion:ISuggestion):boolean => {
		return first(word, suggestion) || second(word, suggestion);
	};
}

export function and(first:IFilter, second:IFilter):IFilter {
	return (word:string, suggestion:ISuggestion):boolean => {
		return first(word, suggestion) && second(word, suggestion);
	};
}

export var DefaultFilter = or(or(Prefix, CamelCase), ContiguousSubString);