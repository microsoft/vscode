/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Language, Query, QueryMatch, SyntaxNode } from 'web-tree-sitter';
import { pushMany } from '../../../util/vs/base/common/arrays';


class LanguageQueryCache {

	private readonly map = new Map<string, Query>();

	constructor(
		private readonly language: Language
	) { }

	getQuery(query: string): Query {
		if (!this.map.has(query)) {
			this.map.set(query, this.language.query(query));
		}
		return this.map.get(query)!;
	}
}

class QueryCache {

	public static INSTANCE = new QueryCache();

	private readonly map = new Map<Language, LanguageQueryCache>();

	getQuery(language: Language, query: string): Query {
		if (!this.map.has(language)) {
			this.map.set(language, new LanguageQueryCache(language));
		}
		return this.map.get(language)!.getQuery(query);
	}
}

export function runQueries(queries: string[], root: SyntaxNode): QueryMatch[] {
	const matches: QueryMatch[] = [];
	for (const query of queries) {
		const compiledQuery = QueryCache.INSTANCE.getQuery(root.tree.getLanguage(), query);
		const queryMatches = compiledQuery.matches(root);
		pushMany(matches, queryMatches);
	}
	return matches;
}
