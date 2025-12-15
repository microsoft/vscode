/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFilter, matchesFuzzy, matchesFuzzy2 } from '../../../../base/common/filters.js';
import { IExpression, splitGlobAware, getEmptyExpression, ParsedExpression, parse } from '../../../../base/common/glob.js';
import * as strings from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { relativePath } from '../../../../base/common/resources.js';
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';

export class ResourceGlobMatcher {

	private readonly globalExpression: ParsedExpression;
	private readonly expressionsByRoot: TernarySearchTree<URI, { root: URI; expression: ParsedExpression }>;

	constructor(
		globalExpression: IExpression,
		rootExpressions: { root: URI; expression: IExpression }[],
		uriIdentityService: IUriIdentityService
	) {
		this.globalExpression = parse(globalExpression);
		this.expressionsByRoot = TernarySearchTree.forUris<{ root: URI; expression: ParsedExpression }>(uri => uriIdentityService.extUri.ignorePathCasing(uri));
		for (const expression of rootExpressions) {
			this.expressionsByRoot.set(expression.root, { root: expression.root, expression: parse(expression.expression) });
		}
	}

	matches(resource: URI): boolean {
		const rootExpression = this.expressionsByRoot.findSubstr(resource);
		if (rootExpression) {
			const path = relativePath(rootExpression.root, resource);
			if (path && !!rootExpression.expression(path)) {
				return true;
			}
		}
		return !!this.globalExpression(resource.path);
	}
}

export class FilterOptions {

	static readonly _filter: IFilter = matchesFuzzy2;
	static readonly _messageFilter: IFilter = matchesFuzzy;

	readonly showWarnings: boolean = false;
	readonly showErrors: boolean = false;
	readonly showInfos: boolean = false;
	readonly textFilter: { readonly text: string; readonly negate: boolean };
	readonly sourceFilters: ReadonlyArray<{ readonly sources: readonly string[]; readonly negate: boolean }>;
	readonly excludesMatcher: ResourceGlobMatcher;
	readonly includesMatcher: ResourceGlobMatcher;

	static EMPTY(uriIdentityService: IUriIdentityService) { return new FilterOptions('', [], false, false, false, uriIdentityService); }

	constructor(
		readonly filter: string,
		filesExclude: { root: URI; expression: IExpression }[] | IExpression,
		showWarnings: boolean,
		showErrors: boolean,
		showInfos: boolean,
		uriIdentityService: IUriIdentityService
	) {
		filter = filter.trim();
		this.showWarnings = showWarnings;
		this.showErrors = showErrors;
		this.showInfos = showInfos;

		const filesExcludeByRoot = Array.isArray(filesExclude) ? filesExclude : [];
		const excludesExpression: IExpression = Array.isArray(filesExclude) ? getEmptyExpression() : filesExclude;

		for (const { expression } of filesExcludeByRoot) {
			for (const pattern of Object.keys(expression)) {
				if (!pattern.endsWith('/**')) {
					// Append `/**` to pattern to match a parent folder #103631
					expression[`${strings.rtrim(pattern, '/')}/**`] = expression[pattern];
				}
			}
		}

		// Extract source filters (e.g., "@source:eslint,ts" or "-@source:eslint @source:ts")
		// Multiple @source: filters separated by space are AND logic
		// Comma-separated sources within one @source: are OR logic
		let effectiveFilter = filter;
		const sourceFilters: { sources: string[]; negate: boolean }[] = [];
		const sourceRegex = /(-)?@source:([^\s,]+(?:,[^\s,]+)*)/gi;
		let sourceMatch;
		
		while ((sourceMatch = sourceRegex.exec(filter)) !== null) {
			const negate = !!sourceMatch[1]; // Check if there's a - prefix
			const sourcesStr = sourceMatch[2];
			// Split by comma for OR logic within a single filter
			const sources = sourcesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
			sourceFilters.push({ sources, negate });
		}
		
		this.sourceFilters = sourceFilters;
		
		// Remove all source filters from the main filter text
		if (sourceFilters.length > 0) {
			effectiveFilter = filter.replace(/(-)?@source:([^\s,]+(?:,[^\s,]+)*)/gi, '').replace(/\s+/g, ' ').replace(/^,\s*|,\s*$/g, '').trim();
		}

		const negate = effectiveFilter.startsWith('!');
		this.textFilter = { text: (negate ? strings.ltrim(effectiveFilter, '!') : effectiveFilter).trim(), negate };
		const includeExpression: IExpression = getEmptyExpression();

		if (effectiveFilter) {
			const filters = splitGlobAware(effectiveFilter, ',').map(s => s.trim()).filter(s => !!s.length);
			for (const f of filters) {
				if (f.startsWith('!')) {
					const filterText = strings.ltrim(f, '!');
					if (filterText) {
						this.setPattern(excludesExpression, filterText);
					}
				} else {
					this.setPattern(includeExpression, f);
				}
			}
		}

		this.excludesMatcher = new ResourceGlobMatcher(excludesExpression, filesExcludeByRoot, uriIdentityService);
		this.includesMatcher = new ResourceGlobMatcher(includeExpression, [], uriIdentityService);
	}

	/**
	 * Checks if a marker matches the source filters.
	 * @param markerSource The source field from the marker (can be undefined)
	 * @returns true if the marker passes all source filters, false otherwise
	 */
	matchesSourceFilters(markerSource: string | undefined): boolean {
		if (this.sourceFilters.length === 0) {
			return true;
		}

		const source = markerSource?.toLowerCase();

		// All source filters must pass (AND logic)
		for (const sourceFilter of this.sourceFilters) {
			if (!source) {
				// If marker has no source, exclude it for positive filter, include it for negative filter
				if (!sourceFilter.negate) {
					return false;
				}
				continue;
			}

			// Check if any of the sources in this filter match (OR logic within filter)
			const matchesAny = sourceFilter.sources.some(filterValue =>
				source.includes(filterValue.toLowerCase())
			);

			// If negated, exclude matches; if not negated, require matches
			if (sourceFilter.negate) {
				if (matchesAny) {
					return false;
				}
			} else {
				if (!matchesAny) {
					return false;
				}
			}
		}

		return true;
	}

	private setPattern(expression: IExpression, pattern: string) {
		if (pattern[0] === '.') {
			pattern = '*' + pattern; // convert ".js" to "*.js"
		}
		expression[`**/${pattern}/**`] = true;
		expression[`**/${pattern}`] = true;
	}
}
