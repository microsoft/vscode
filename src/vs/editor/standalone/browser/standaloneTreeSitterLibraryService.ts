/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Parser, Language, Query } from '@vscode/tree-sitter-wasm';
import { IReader } from '../../../base/common/observable.js';
import { ITreeSitterLibraryService } from '../../../editor/common/services/treeSitter/treeSitterLibraryService.js';

export class StandaloneTreeSitterLibraryService implements ITreeSitterLibraryService {
	readonly _serviceBrand: undefined;

	getParserClass(): Promise<typeof Parser> {
		throw new Error('getParserClass is not implemented in StandaloneTreeSitterLibraryService');
	}

	supportsLanguage(languageId: string, reader: IReader | undefined): boolean {
		return false;
	}

	getLanguage(languageId: string, reader: IReader | undefined): Language | undefined {
		return undefined;
	}
	/**
	 * Return value of null indicates that there are no injection queries for this language.
	 * @param languageId
	 * @param reader
	 */
	getInjectionQueries(languageId: string, reader: IReader | undefined): Query | null | undefined {
		return null;
	}
	/**
	 * Return value of null indicates that there are no highlights queries for this language.
	 * @param languageId
	 * @param reader
	 */
	getHighlightingQueries(languageId: string, reader: IReader | undefined): Query | null | undefined {
		return null;
	}
}
