/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type KeyValueSuggestions =
	| string[]
	| Fig.Suggestion[]
	| NonNullable<Fig.Generator['custom']>;

export type CacheValue = boolean | 'keys' | 'values';

export interface KeyValueInit {
	/** String to use as the separator between keys and values */
	separator?: string;

	/** List of key suggestions */
	keys?: KeyValueSuggestions;

	/** List of value suggestions */
	values?: KeyValueSuggestions;

	/** Cache key and value suggestions */
	cache?: CacheValue;

	/** Should the separator be inserted after a key? (default: true ) */
	insertSeparator?: boolean;
}

/** Cache of Fig suggestions using the string[]/Suggestion[]/function as a key */
const suggestionCache = new Map<KeyValueSuggestions, Fig.Suggestion[]>();

function appendToInsertValue(append: string, suggestions: Fig.Suggestion[]): Fig.Suggestion[] {
	if (append.length === 0) {
		return suggestions;
	}
	return suggestions.map((item) =>
		item.insertValue ? item : { ...item, insertValue: item.name + append }
	);
}

async function kvSuggestionsToFigSuggestions(
	suggestions: KeyValueSuggestions,
	append: string,
	init: Parameters<NonNullable<Fig.Generator['custom']>>
): Promise<Fig.Suggestion[]> {
	if (typeof suggestions === 'function') {
		const out = await suggestions(...init);
		return appendToInsertValue(append, out?.filter(e => !!e) ?? []);
	}
	if (typeof suggestions[0] === 'string') {
		const out = (suggestions as string[]).map((name) => ({ name }));
		return appendToInsertValue(append, out);
	}
	return appendToInsertValue(append, suggestions as Fig.Suggestion[]);
}

async function getSuggestions(
	suggestions: KeyValueSuggestions,
	append: string,
	useSuggestionCache: boolean,
	init: Parameters<NonNullable<Fig.Generator['custom']>>
): Promise<Fig.Suggestion[]> {
	if (useSuggestionCache || Array.isArray(suggestions)) {
		let value = suggestionCache.get(suggestions);
		if (value === undefined) {
			value = await kvSuggestionsToFigSuggestions(suggestions, append, init);
			suggestionCache.set(suggestions, value);
		}
		return value;
	}
	return kvSuggestionsToFigSuggestions(suggestions, append, init);
}

function shouldUseCache(isKey: boolean, cache: CacheValue) {
	if (typeof cache === 'string') {
		return (isKey && cache === 'keys') || (!isKey && cache === 'values');
	}
	return cache;
}

/**
 * Create a generator that gives suggestions for key=value arguments. You
 * can use a `string[]` or `Fig.Suggestion[]` for the keys and values, or a
 * function with the same signature as `Fig.Generator["custom"]`.
 *
 * You can set `cache: true` to enable caching results. The suggestions are cached
 * globally using the function as a key, so enabling caching for any one generator
 * will set the cache values for the functions for the entire spec. This behavior
 * can be used to copmpose expensive key/value generators without incurring the
 * initial cost every time they're used.
 *
 * Note that you should only cache generators that produce the same output regardless
 * of their input. You can cache either the keys or values individually using `"keys"`
 * or `"values"` as the `cache` property value.
 *
 * @example
 *
 * ```typescript
 * // set-values a=1 b=3 c=2
 * const spec: Fig.Spec = {
 *   name: "set-values",
 *   args: {
 *     name: "values",
 *     isVariadic: true,
 *     generators: keyValue({
 *       keys: ["a", "b", "c"],
 *       values: ["1", "2", "3"],
 *     }),
 *   },
 * }
 * ```
 *
 * @example The separator between keys and values can be customized (default: `=`)
 *
 * ```typescript
 * // key1:value
 * keyValue({
 *   separator: ":",
 *   keys: [
 *     { name: "key1", icon: "fig://icon?type=string" },
 *     { name: "key2", icon: "fig://icon?type=string" },
 *   ],
 * }),
 * ```
 */
export function keyValue({
	separator = '=',
	keys = [],
	values = [],
	cache = false,
	insertSeparator = true,
}: KeyValueInit): Fig.Generator {
	return {
		trigger: (newToken, oldToken) => newToken.indexOf(separator) !== oldToken.indexOf(separator),
		getQueryTerm: (token) => token.slice(token.indexOf(separator) + 1),
		custom: async (...init) => {
			const [tokens] = init;
			const finalToken = tokens[tokens.length - 1];
			const isKey = !finalToken.includes(separator);
			const suggestions = isKey ? keys : values;
			const useCache = shouldUseCache(isKey, cache);
			const append = isKey ? (insertSeparator ? separator : '') : '';
			return getSuggestions(suggestions, append, useCache, init);
		},
	};
}
