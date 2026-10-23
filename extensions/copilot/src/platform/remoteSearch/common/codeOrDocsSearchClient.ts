/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { CodeOrDocsSearchRepoError } from './codeOrDocsSearchErrors';

/**
 * Represents the base scoping query for code or docs search. A scoping query is used to provide what exactly you want to search through.
 */
export interface ICodeOrDocsSearchBaseScopingQuery {
	/**
	 * The repo(s) to search in. When only one is specified, any errors are thrown. If multiple repos are specified,
	 * then they are returned in the response.
	 */
	repo: string | string[];

	/**
	 * The language to search for. If not provided, all languages will be searched.
	 */
	lang?: string[];

	/**
	 * The language to exclude from the search. If not provided, no languages will be excluded.
	 */
	notLang?: string[];

	/**
	 * The path to search for. If not provided, all paths will be searched.
	 */
	path?: string[];

	/**
	 * The path to exclude from the search. If not provided, no paths will be excluded.
	 */
	notPath?: string[];
}

/**
 * Represents a scoping query for code or docs search with only 1 repo. A scoping query is used to provide what exactly you want to search through.
 */
export interface ICodeOrDocsSearchSingleRepoScopingQuery extends ICodeOrDocsSearchBaseScopingQuery {
	repo: string;
}

/**
 * Represents a scoping query for code or docs search with multiple repos. A scoping query is used to provide what exactly you want to search through.
 */
export interface ICodeOrDocsSearchMultiRepoScopingQuery extends ICodeOrDocsSearchBaseScopingQuery {
	repo: string[];
}

/**
 * What one of the results looks like that is returned by codesearch or docssearch.
 */
export interface ICodeOrDocsSearchItem {
	path: string;
	contents: string;
	title?: string;
	score: number;
	repoName: string;
	repoOwner: string;
	range: { start: number; end: number };
	languageId: string;
	languageName: string;
	type: 'snippet' | string;
	url: string;
	ref: string;
	commitOID?: string;
	algorithm?: 'semantic' | 'bm25';
}

/**
 * The result of a code or docs search.
 */
export interface ICodeOrDocsSearchResult {
	results: ICodeOrDocsSearchItem[];
	errors: CodeOrDocsSearchRepoError[];
}

export interface ICodeOrDocsSearchOptions {
	/**
	 * The number of results to return. Default is 6.
	 */
	limit?: number;

	/**
	 * How similar you want results to be.
	 */
	similarity?: number;
}

/**
 * The interface for the docs search client.
 */
export interface IDocsSearchClient {
	readonly _serviceBrand: undefined;

	/**
	 * Search for related chunks using GitHub's search APIs
	 * @note When only a single repo is specified, we return the results as an array and also throw errors.
	 * @param query The search query
	 * @param scopingQuery A scoping query with a single repo specified.
	 * @param options The search options
	 */
	search(
		query: string,
		scopingQuery: ICodeOrDocsSearchSingleRepoScopingQuery,
		options?: ICodeOrDocsSearchOptions,
		cancellationToken?: CancellationToken
	): Promise<ICodeOrDocsSearchItem[]>;

	/**
	 * Search for related chunks using GitHub's search APIs
	 * @note When multiple repos are specified, we return the results and errors together. You are responsible for handling errors how you would like.
	 * @param query The search query
	 * @param scopingQuery A scoping query with multiple repos specified.
	 * @param options The search options
	 */
	search(
		query: string,
		scopingQuery: ICodeOrDocsSearchMultiRepoScopingQuery,
		options?: ICodeOrDocsSearchOptions,
		cancellationToken?: CancellationToken
	): Promise<ICodeOrDocsSearchResult>;
}


export const IDocsSearchClient = createServiceIdentifier<IDocsSearchClient>('docsSearchClient');
