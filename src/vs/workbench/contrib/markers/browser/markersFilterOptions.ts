/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Messages from 'vs/workbench/contrib/markers/browser/messages';
import { IFilter, matchesPrefix, matchesFuzzy, matchesFuzzy2 } from 'vs/base/common/filters';
import { IExpression, splitGlobAware, getEmptyExpression } from 'vs/base/common/glob';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ResourceGlobMatcher } from 'vs/base/common/resources';

export class FilterOptions {

	static readonly _filter: IFilter = matchesFuzzy2;
	static readonly _messageFilter: IFilter = matchesFuzzy;

	readonly filterErrors: boolean = false;
	readonly filterWarnings: boolean = false;
	readonly filterInfos: boolean = false;
	readonly textFilter: string = '';
	readonly excludesMatcher: ResourceGlobMatcher;
	readonly includesMatcher: ResourceGlobMatcher;

	constructor(readonly filter: string = '', filesExclude: { root: URI, expression: IExpression }[] | IExpression = []) {
		filter = filter.trim();

		const filesExcludeByRoot = Array.isArray(filesExclude) ? filesExclude : [];
		const excludesExpression: IExpression = Array.isArray(filesExclude) ? getEmptyExpression() : filesExclude;

		const includeExpression: IExpression = getEmptyExpression();
		if (filter) {
			const filters = splitGlobAware(filter, ',').map(s => s.trim()).filter(s => !!s.length);
			for (const f of filters) {
				this.filterErrors = this.filterErrors || this.matches(f, Messages.MARKERS_PANEL_FILTER_ERRORS);
				this.filterWarnings = this.filterWarnings || this.matches(f, Messages.MARKERS_PANEL_FILTER_WARNINGS);
				this.filterInfos = this.filterInfos || this.matches(f, Messages.MARKERS_PANEL_FILTER_INFOS);
				if (strings.startsWith(f, '!')) {
					this.setPattern(excludesExpression, strings.ltrim(f, '!'));
				} else {
					this.setPattern(includeExpression, f);
					this.textFilter += ` ${f}`;
				}
			}
		}

		this.excludesMatcher = new ResourceGlobMatcher(excludesExpression, filesExcludeByRoot);
		this.includesMatcher = new ResourceGlobMatcher(includeExpression, []);
		this.textFilter = this.textFilter.trim();
	}

	private setPattern(expression: IExpression, pattern: string) {
		if (pattern[0] === '.') {
			pattern = '*' + pattern; // convert ".js" to "*.js"
		}
		expression[`**/${pattern}/**`] = true;
		expression[`**/${pattern}`] = true;
	}

	private matches(prefix: string, word: string): boolean {
		const result = matchesPrefix(prefix, word);
		return !!(result && result.length > 0);
	}
}
