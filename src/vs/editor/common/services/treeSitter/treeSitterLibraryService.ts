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

	getParserClass(): Promise<typeof Parser>;

	supportsLanguage(languageId: string, reader: IReader | undefined): boolean;
	getLanguage(languageId: string, reader: IReader | undefined): Language | undefined;
	/**
	 * Return value of null indicates that there are no injection queries for this language.
	 * @param languageId
	 * @param reader
	 */
	getInjectionQueries(languageId: string, reader: IReader | undefined): Query | null | undefined;
	/**
	 * Return value of null indicates that there are no highlights queries for this language.
	 * @param languageId
	 * @param reader
	 */
	getHighlightingQueries(languageId: string, reader: IReader | undefined): Query | null | undefined;
}
