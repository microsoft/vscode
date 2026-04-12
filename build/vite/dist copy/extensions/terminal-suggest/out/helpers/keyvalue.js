"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.valueList = valueList;
exports.keyValue = keyValue;
exports.keyValueList = keyValueList;
/** Cache of Fig suggestions using the string[]/Suggestion[]/function as a key */
const suggestionCache = new Map();
function appendToInsertValue(append, suggestions) {
    if (append.length === 0) {
        return suggestions;
    }
    return suggestions.map((item) => item.insertValue ? item : { ...item, insertValue: item.name + append });
}
async function kvSuggestionsToFigSuggestions(suggestions, append, init) {
    if (typeof suggestions === 'function') {
        const out = await suggestions(...init);
        return appendToInsertValue(append, out?.filter(e => !!e) ?? []);
    }
    if (typeof suggestions[0] === 'string') {
        const out = suggestions.map((name) => ({ name }));
        return appendToInsertValue(append, out);
    }
    return appendToInsertValue(append, suggestions);
}
async function getSuggestions(suggestions, append, useSuggestionCache, init) {
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
function shouldUseCache(isKey, cache) {
    if (typeof cache === 'string') {
        return (isKey && cache === 'keys') || (!isKey && cache === 'values');
    }
    return cache;
}
/** Get the final index of any of the strings */
function lastIndexOf(haystack, ...needles) {
    return Math.max(...needles.map((needle) => haystack.lastIndexOf(needle)));
}
function removeRepeatSuggestions(alreadyUsed, suggestions) {
    const seen = new Set(alreadyUsed);
    return suggestions.filter((suggestion) => {
        if (typeof suggestion.name === 'string') {
            return !seen.has(suggestion.name);
        }
        return !suggestion.name?.some((name) => seen.has(name));
    });
}
/**
 * Create a generator that gives suggestions for val,val,... arguments. You
 * can use a `string[]` or `Fig.Suggestion[]` for the values.
 *
 * You can set `cache: true` to enable caching results. The suggestions are cached
 * globally using the function as a key, so enabling caching for any one generator
 * will set the cache values for the functions for the entire spec. This behavior
 * can be used to compose expensive generators without incurring a cost every time
 * they're used.
 *
 * The primary use of this is to enable the same caching behavior as `keyValue`
 * and `keyValueList`. If your goal is to create a $PATH-like value, use a generator
 * object literal: `{ template: "filepaths", trigger: ":", getQueryTerm: ":" }`
 */
function valueList({ delimiter = ',', values = [], cache = false, insertDelimiter = false, allowRepeatedValues = false, }) {
    return {
        trigger: (newToken, oldToken) => newToken.lastIndexOf(delimiter) !== oldToken.lastIndexOf(delimiter),
        getQueryTerm: (token) => token.slice(token.lastIndexOf(delimiter) + delimiter.length),
        custom: async (...init) => {
            const out = await getSuggestions(values, insertDelimiter ? delimiter : '', cache, init);
            if (allowRepeatedValues) {
                return out;
            }
            const [tokens] = init;
            const valuesInList = tokens[tokens.length - 1]?.split(delimiter);
            return removeRepeatSuggestions(valuesInList, out);
        },
    };
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
function keyValue({ separator = '=', keys = [], values = [], cache = false, insertSeparator = true, }) {
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
/**
 * Create a generator that gives suggestions for `k=v,k=v,...` arguments. You
 * can use a `string[]` or `Fig.Suggestion[]` for the keys and values, or a
 * function with the same signature as `Fig.Generator["custom"]`
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
 * // set-values a=1,b=3,c=2
 * const spec: Fig.Spec = {
 *   name: "set-values",
 *   args: {
 *     name: "values",
 *     generators: keyValueList({
 *       keys: ["a", "b", "c"],
 *       values: ["1", "2", "3"],
 *     }),
 *   },
 * }
 * ```
 *
 * @example
 *
 * The separator between keys and values can be customized. It's `=` by
 * default. You can also change the key/value pair delimiter, which is `,`
 * by default.
 *
 * ```typescript
 * // key1:value&key2:another
 * keyValueList({
 *   separator: ":",
 *   delimiter: "&"
 *   keys: [
 *     { name: "key1", icon: "fig://icon?type=string" },
 *     { name: "key2", icon: "fig://icon?type=string" },
 *   ],
 * }),
 * ```
 */
function keyValueList({ separator = '=', delimiter = ',', keys = [], values = [], cache = false, insertSeparator = true, insertDelimiter = false, allowRepeatedKeys = false, allowRepeatedValues = true, }) {
    return {
        trigger: (newToken, oldToken) => {
            const newTokenIdx = lastIndexOf(newToken, separator, delimiter);
            const oldTokenIdx = lastIndexOf(oldToken, separator, delimiter);
            return newTokenIdx !== oldTokenIdx;
        },
        getQueryTerm: (token) => {
            const index = lastIndexOf(token, separator, delimiter);
            return token.slice(index + 1);
        },
        custom: async (...init) => {
            const [tokens] = init;
            const finalToken = tokens[tokens.length - 1];
            const index = lastIndexOf(finalToken, separator, delimiter);
            const isKey = index === -1 || finalToken.slice(index, index + separator.length) !== separator;
            const suggestions = isKey ? keys : values;
            const useCache = shouldUseCache(isKey, cache);
            const append = isKey ? (insertSeparator ? separator : '') : insertDelimiter ? delimiter : '';
            const out = await getSuggestions(suggestions, append, useCache, init);
            if (isKey) {
                if (allowRepeatedKeys) {
                    return out;
                }
                const existingKeys = finalToken
                    .split(delimiter)
                    .map((chunk) => chunk.slice(0, chunk.indexOf(separator)));
                return removeRepeatSuggestions(existingKeys, out);
            }
            if (allowRepeatedValues) {
                return out;
            }
            const existingValues = finalToken
                .split(delimiter)
                .map((chunk) => chunk.slice(chunk.indexOf(separator) + separator.length));
            return removeRepeatSuggestions(existingValues, out);
        },
    };
}
//# sourceMappingURL=keyvalue.js.map