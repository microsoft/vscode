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
	 * Gets the Tree-sitter Language object.
	 * @param languageId The language identifier to retrieve.
	 * @param reader Optional observable reader.
	 */
	getLanguage(languageId: string): Promise<Language>;

	/**
	 * Gets the Tree-sitter Language object synchronously.
	 *
	 * Note that This method runs synchronously and may fail if the language is
	 * not yet cached, as synchronous methods are required by editor APIs.
	 * @param languageId The language identifier to retrieve.
	 * @param reader Optional observable reader.
	 */
	getLanguageSync(languageId: string, reader: IReader | undefined): Language | undefined;

	/**
	 * Gets the injection queries for a language. A return value of `null`
	 * indicates that there are no highlights queries for this language.
	 *
	 * Note that This method runs synchronously and may fail if the language is
	 * not yet cached, as synchronous methods are required by editor APIs.
	 * @param languageId The language identifier to retrieve queries for.
	 * @param reader Optional observable reader.
	 */
	getInjectionQueriesSync(languageId: string, reader: IReader | undefined): Query | null | undefined;

	/**
	 * Gets the highlighting queries for a language. A return value of `null`
	 * indicates that there are no highlights queries for this language.
	 *
	 * Note that This method runs synchronously and may fail if the language is
	 * not yet cached, as synchronous methods are required by editor APIs.
	 * @param languageId The language identifier to retrieve queries for.
	 * @param reader Optional observable reader.
	 */
	getHighlightingQueriesSync(languageId: string, reader: IReader | undefined): Query | null | undefined;

	/**
	 * Creates a custom query for a language. Returns undefiend if
	 * @param languageId The language identifier to create the query for.
	 * @param reader Optional observable reader.
	 * @param querySource The query source string to compile.
	 */
	createQuery(languageId: string, querySource: string): Promise<Query>;
}
