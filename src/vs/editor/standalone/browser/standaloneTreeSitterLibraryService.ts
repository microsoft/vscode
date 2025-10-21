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
		throw new Error('not implemented in StandaloneTreeSitterLibraryService');
	}

	supportsLanguage(languageId: string, reader: IReader | undefined): boolean {
		return false;
	}

	async getLanguage(languageId: string): Promise<Language> {
		throw new Error('not implemented in StandaloneTreeSitterLibraryService');
	}

	getLanguageSync(languageId: string, reader: IReader | undefined): Language | undefined {
		return undefined;
	}

	getInjectionQueriesSync(languageId: string, reader: IReader | undefined): Query | null | undefined {
		return null;
	}

	getHighlightingQueriesSync(languageId: string, reader: IReader | undefined): Query | null | undefined {
		return null;
	}

	async createQuery(languageId: string, querySource: string): Promise<Query> {
		throw new Error('not implemented in StandaloneTreeSitterLibraryService');
	}
}
