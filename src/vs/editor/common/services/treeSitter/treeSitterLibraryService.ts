/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Language, Parser, Query } from '@vscode/tree-sitter-wasm';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IReader } from '../../../../base/common/observable.js';

export const ITreeSitterLibraryService = createDecorator<ITreeSitterLibraryService>('treeSitterLibraryService');

export interface ITreeSitterLibraryService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets the tree sitter Parser constructor.
	 */
	getParserClass(): Promise<typeof Parser>;

	/**
	 * Checks whether a language is supported and available based setting enablement.
	 * @param languageId The language identifier to check.
	 * @param reader Optional observable reader.
	 */
	supportsLanguage(languageId: string, reader: IReader | undefined): boolean;

	/**
	 * Gets the tree sitter Language object synchronously.
	 * @param languageId The language identifier to retrieve.
	 * @param ignoreSupportsCheck Whether to ignore the supportsLanguage check.
	 * @param reader Optional observable reader.
	 */
	getLanguage(languageId: string, ignoreSupportsCheck: boolean, reader: IReader | undefined): Language | undefined;

	/**
	 * Gets the language as a promise, as opposed to via observables. This ignores the automatic
	 * supportsLanguage check.
	 *
	 * Warning: This approach is generally not recommended as it's not reactive, but it's the only
	 * way to catch and handle import errors when the grammar fails to load.
	 * @param languageId The language identifier to retrieve.
	 */
	getLanguagePromise(languageId: string): Promise<Language | undefined>;

	/**
	 * Gets the injection queries for a language. A return value of `null`
	 * indicates that there are no highlights queries for this language.
	 * @param languageId The language identifier to retrieve queries for.
	 * @param reader Optional observable reader.
	 */
	getInjectionQueries(languageId: string, reader: IReader | undefined): Query | null | undefined;

	/**
	 * Gets the highlighting queries for a language. A return value of `null`
	 * indicates that there are no highlights queries for this language.
	 * @param languageId The language identifier to retrieve queries for.
	 * @param reader Optional observable reader.
	 */
	getHighlightingQueries(languageId: string, reader: IReader | undefined): Query | null | undefined;

	/**
	 * Creates a one-off custom query for a language.
	 * @param language The Language to create the query for.
	 * @param querySource The query source string to compile.
	 */
	createQuery(language: Language, querySource: string): Promise<Query>;
}
