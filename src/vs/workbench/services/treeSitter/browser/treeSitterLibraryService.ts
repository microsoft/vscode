/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import type { Parser, Language, Query } from '@vscode/tree-sitter-wasm';
import { IReader } from '../../../../base/common/observable.js';
import { ITreeSitterLibraryService } from '../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { importAMDNodeModule } from '../../../../amdX.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { CachedFunction } from '../../../../base/common/cache.js';

export const EDITOR_EXPERIMENTAL_PREFER_TREESITTER = 'editor.experimental.preferTreeSitter';
export const TREESITTER_ALLOWED_SUPPORT = ['css', 'typescript', 'ini', 'regex'];

export class TreeSitterLibraryService implements ITreeSitterLibraryService {
	_serviceBrand: undefined;

	private readonly _treeSitterImport = new Lazy(() => {
		return importAMDNodeModule<typeof import('@vscode/tree-sitter-wasm')>('@vscode/tree-sitter-wasm', 'wasm/tree-sitter.js');
	});

	private readonly _supportsLanguage = new CachedFunction((languageId: string) => {
		return observableConfigValue(`${EDITOR_EXPERIMENTAL_PREFER_TREESITTER}.${languageId}`, false, this._configurationService);
	});

	constructor(
		@ILanguageService private readonly _languageService: ILanguageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService
	) {

	}

	supportsLanguage(languageId: string, reader: IReader | undefined): boolean {
		return this._supportsLanguage.get(languageId).read(reader);
	}

	createParser(): Promise<Parser> {
		throw new Error('Method not implemented.');
	}

	getLanguage(languageId: string, reader: IReader | undefined): Language | undefined {
		if (!this.supportsLanguage(languageId, reader)) {
			return undefined;
		}
		throw new Error('Method not implemented.');
	}

	getInjectionQueries(languageId: string, reader: IReader | undefined): Query | undefined {
		if (!this.supportsLanguage(languageId, reader)) {
			return undefined;
		}
		throw new Error('Method not implemented.');
	}

	getHighlightingQueries(languageId: string, reader: IReader | undefined): Query | undefined {
		if (!this.supportsLanguage(languageId, reader)) {
			return undefined;
		}
		throw new Error('Method not implemented.');
	}
}
