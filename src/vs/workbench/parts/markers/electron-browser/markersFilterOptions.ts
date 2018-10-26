/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import { IFilter, or, matchesPrefix, matchesContiguousSubString, matchesFuzzy } from 'vs/base/common/filters';
import { ParsedExpression, IExpression, splitGlobAware, getEmptyExpression, parse } from 'vs/base/common/glob';
import * as strings from 'vs/base/common/strings';

export class FilterOptions {

	static readonly _filter: IFilter = or(matchesPrefix, matchesContiguousSubString);
	static readonly _fuzzyFilter: IFilter = or(matchesPrefix, matchesContiguousSubString, matchesFuzzy);

	readonly filterErrors: boolean = false;
	readonly filterWarnings: boolean = false;
	readonly filterInfos: boolean = false;
	readonly excludePattern: ParsedExpression | null = null;
	readonly includePattern: ParsedExpression | null = null;
	readonly textFilter: string = '';

	constructor(readonly filter: string = '', excludePatterns: IExpression = {}) {
		filter = filter.trim();
		for (const key of Object.keys(excludePatterns)) {
			if (excludePatterns[key]) {
				this.setPattern(excludePatterns, key);
			}
			delete excludePatterns[key];
		}
		const includePatterns: IExpression = getEmptyExpression();
		if (filter) {
			const filters = splitGlobAware(filter, ',').map(s => s.trim()).filter(s => !!s.length);
			for (const f of filters) {
				this.filterErrors = this.filterErrors || this.matches(f, Messages.MARKERS_PANEL_FILTER_ERRORS);
				this.filterWarnings = this.filterWarnings || this.matches(f, Messages.MARKERS_PANEL_FILTER_WARNINGS);
				this.filterInfos = this.filterInfos || this.matches(f, Messages.MARKERS_PANEL_FILTER_INFOS);
				if (strings.startsWith(f, '!')) {
					this.setPattern(excludePatterns, strings.ltrim(f, '!'));
				} else {
					this.setPattern(includePatterns, f);
					this.textFilter += ` ${f}`;
				}
			}
		}
		if (Object.keys(excludePatterns).length) {
			this.excludePattern = parse(excludePatterns);
		}
		if (Object.keys(includePatterns).length) {
			this.includePattern = parse(includePatterns);
		}
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
