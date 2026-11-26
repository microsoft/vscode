/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMatch, matchesContiguousSubString, matchesWords } from '../../../../base/common/filters.js';

const customizationSearchSeparators = /[\s\-_./]+/;

/**
 * Normalizes text so that `_` behaves like the other word separators known to
 * {@link matchesWords}. The replacement keeps string length unchanged so that
 * match ranges stay valid for the original text.
 */
function normalizeSeparators(value: string): string {
	return value.replace(/_/g, '-');
}

/**
 * The single matcher for every Customizations search surface (list pages,
 * Browse, Plugins, MCP servers, Tools, Copilot customizations). Do not add
 * ad-hoc `toLowerCase().includes()` filters; use this so that `-`, `_`, `.`,
 * `/` and whitespace are interchangeable word separators everywhere.
 *
 * Matching is case-insensitive. A contiguous substring match is preferred
 * (`chrome` in `Chrome DevTools MCP`); otherwise the query's words must match
 * consecutive word prefixes of the target (`handy commands` matches
 * `handy-commands`, `chrome-devtools` matches `Chrome DevTools MCP`).
 *
 * @returns highlight ranges in `target`, or `null` when it does not match.
 */
export function matchesCustomizationSearchQuery(query: string, target: string): IMatch[] | null {
	const trimmedQuery = normalizeSeparators(query.trim());
	if (!trimmedQuery) {
		return [];
	}
	const normalizedTarget = normalizeSeparators(target);
	const collapsedQuery = trimmedQuery.replace(/\s+/g, ' ');
	return matchesContiguousSubString(trimmedQuery, normalizedTarget)
		?? (collapsedQuery !== trimmedQuery ? matchesContiguousSubString(collapsedQuery, normalizedTarget) : null)
		?? matchesWords(collapsedQuery, normalizedTarget, true);
}

/**
 * Returns whether any of `values` matches `query` according to
 * {@link matchesCustomizationSearchQuery}. An empty query matches everything.
 */
export function customizationSearchMatchesAny(query: string, values: readonly (string | undefined)[]): boolean {
	if (!query.trim()) {
		return true;
	}
	return values.some(value => !!value && !!matchesCustomizationSearchQuery(query, value));
}

/**
 * Splits a Customizations search query into lowercase words using the same
 * separators as {@link matchesCustomizationSearchQuery}, for surfaces that
 * score words independently (for example relevance-ranked connectors).
 */
export function splitCustomizationSearchWords(query: string): string[] {
	return query.toLowerCase().split(customizationSearchSeparators).filter(word => word.length > 0);
}
