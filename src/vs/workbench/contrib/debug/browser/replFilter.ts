/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesFuzzy } from '../../../../base/common/filters.js';
import { splitGlobAware } from '../../../../base/common/glob.js';
import { ITreeFilter, TreeVisibility, TreeFilterResult } from '../../../../base/browser/ui/tree/tree.js';
import { IReplElement } from '../common/debug.js';
import { ReplEvaluationResult, ReplEvaluationInput } from '../common/replModel.js';
import { Variable } from '../common/debugModel.js';


type ParsedQuery = {
	type: 'include' | 'exclude';
	query: string;
};

export class ReplFilter implements ITreeFilter<IReplElement> {

	static matchQuery = matchesFuzzy;

	private _parsedQueries: ParsedQuery[] = [];
	set filterQuery(query: string) {
		this._parsedQueries = [];
		query = query.trim();

		if (query && query !== '') {
			const filters = splitGlobAware(query, ',').map(s => s.trim()).filter(s => !!s.length);
			for (const f of filters) {
				if (f.startsWith('\\')) {
					this._parsedQueries.push({ type: 'include', query: f.slice(1) });
				} else if (f.startsWith('!')) {
					this._parsedQueries.push({ type: 'exclude', query: f.slice(1) });
				} else {
					this._parsedQueries.push({ type: 'include', query: f });
				}
			}
		}
	}

	filter(element: IReplElement, parentVisibility: TreeVisibility): TreeFilterResult<void> {
		if (element instanceof ReplEvaluationInput || element instanceof ReplEvaluationResult || element instanceof Variable) {
			// Only filter the output events, everything else is visible https://github.com/microsoft/vscode/issues/105863
			return TreeVisibility.Visible;
		}

		let includeQueryPresent = false;
		let includeQueryMatched = false;

		const text = element.toString(true);

		for (const { type, query } of this._parsedQueries) {
			if (type === 'exclude' && ReplFilter.matchQuery(query, text)) {
				// If exclude query matches, ignore all other queries and hide
				return false;
			} else if (type === 'include') {
				includeQueryPresent = true;
				if (ReplFilter.matchQuery(query, text)) {
					includeQueryMatched = true;
				}
			}
		}

		return includeQueryPresent ? includeQueryMatched : (typeof parentVisibility !== 'undefined' ? parentVisibility : TreeVisibility.Visible);
	}
}
