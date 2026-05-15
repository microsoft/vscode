/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeOrDocsSearchBaseScopingQuery } from './codeOrDocsSearchClient';

export function formatScopingQuery(query: ICodeOrDocsSearchBaseScopingQuery) {
	const repo: string[] = Array.isArray(query.repo) ? query.repo : [query.repo];
	const parts: string[] = [
		`(repo:${repo.join(' OR repo:')})`
	];
	if (query.lang) {
		parts.push(`(lang:${query.lang.join(' OR lang:')})`);
	}
	if (query.notLang) {
		parts.push(`NOT (lang:${query.notLang.join(' OR lang:')})`);
	}
	if (query.path) {
		parts.push(`(path:${query.path.join(' OR path:')})`);
	}
	if (query.notPath) {
		parts.push(`NOT (path:${query.notPath.join(' OR path:')})`);
	}
	return parts.join(' ');
}
