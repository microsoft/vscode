/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import type { Parser, Language, Query } from '@vscode/tree-sitter-wasm';
import { IReader, ObservablePromise } from '../../../../base/common/observable.js';
import { ITreeSitterLibraryService } from '../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { canASAR, importAMDNodeModule } from '../../../../amdX.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileOperationResult, IFileContent, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { CachedFunction } from '../../../../base/common/cache.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { AppResourcePath, FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from '../../../../base/common/network.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';

export const EDITOR_EXPERIMENTAL_PREFER_TREESITTER = 'editor.experimental.preferTreeSitter';
export const TREESITTER_ALLOWED_SUPPORT = ['css', 'typescript', 'ini', 'regex'];

const MODULE_LOCATION_SUBPATH = `@vscode/tree-sitter-wasm/wasm`;
const FILENAME_TREESITTER_WASM = `tree-sitter.wasm`;

export function getModuleLocation(environmentService: IEnvironmentService): AppResourcePath {
	return `${(canASAR && environmentService.isBuilt) ? nodeModulesAsarUnpackedPath : nodeModulesPath}/${MODULE_LOCATION_SUBPATH}`;
}

export class TreeSitterLibraryService extends Disposable implements ITreeSitterLibraryService {
	_serviceBrand: undefined;
	isTest: boolean = false;

	private readonly _treeSitterImport = new Lazy(async () => {
		const TreeSitter = await importAMDNodeModule<typeof import('@vscode/tree-sitter-wasm')>('@vscode/tree-sitter-wasm', 'wasm/tree-sitter.js');
		const environmentService = this._environmentService;
		const isTest = this.isTest;
		await TreeSitter.Parser.init({
			locateFile(_file: string, _folder: string) {
				const location: AppResourcePath = `${getModuleLocation(environmentService)}/${FILENAME_TREESITTER_WASM}`;
				if (isTest) {
					return FileAccess.asFileUri(location).toString(true);
				} else {
					return FileAccess.asBrowserUri(location).toString(true);
				}
			}
		});
		return TreeSitter;
	});

	private readonly _supportsLanguage = new CachedFunction((languageId: string) => {
		return observableConfigValue(`${EDITOR_EXPERIMENTAL_PREFER_TREESITTER}.${languageId}`, false, this._configurationService);
	});

	private readonly _languagesCache = new CachedFunction((languageId: string) => {
		return ObservablePromise.fromFn(async () => {
			const languageLocation = getModuleLocation(this._environmentService);
			const grammarName = `tree-sitter-${languageId}`;

			const wasmPath: AppResourcePath = `${languageLocation}/${grammarName}.wasm`;
			const [treeSitter, languageFile] = await Promise.all([
				this._treeSitterImport.value,
				this._fileService.readFile(FileAccess.asFileUri(wasmPath))
			]);

			const Language = treeSitter.Language;
			const language = await Language.load(languageFile.value.buffer);
			return language;
		});
	});

	private readonly _injectionQueries = new CachedFunction({ getCacheKey: JSON.stringify }, (arg: { languageId: string; kind: 'injections' | 'highlights' }) => {
		const loadQuerySource = async () => {
			const injectionsQueriesLocation: AppResourcePath = `vs/editor/common/languages/${arg.kind}/${arg.languageId}.scm`;
			const uri = FileAccess.asFileUri(injectionsQueriesLocation);
			if (!this._fileService.hasProvider(uri)) {
				return undefined;
			}
			const query = await tryReadFile(this._fileService, uri);
			if (query === undefined) {
				return undefined;
			}
			return query.value.toString();
		};

		return ObservablePromise.fromFn(async () => {
			const [
				querySource,
				language,
				treeSitter
			] = await Promise.all([
				loadQuerySource(),
				this._languagesCache.get(arg.languageId).promise,
				this._treeSitterImport.value,
			]);

			if (querySource === undefined) {
				return null;
			}

			const Query = treeSitter.Query;
			return new Query(language, querySource);
		}).resolvedValue;
	});

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) {
		super();
	}

	supportsLanguage(languageId: string, reader: IReader | undefined): boolean {
		return this._supportsLanguage.get(languageId).read(reader);
	}

	async getParserClass(): Promise<typeof Parser> {
		const treeSitter = await this._treeSitterImport.value;
		return treeSitter.Parser;
	}

	getLanguage(languageId: string, ignoreSupportsCheck: boolean, reader: IReader | undefined): Language | undefined {
		if (!ignoreSupportsCheck && !this.supportsLanguage(languageId, reader)) {
			return undefined;
		}
		const lang = this._languagesCache.get(languageId).resolvedValue.read(reader);
		return lang;
	}

	async getLanguagePromise(languageId: string): Promise<Language | undefined> {
		return this._languagesCache.get(languageId).promise;
	}

	getInjectionQueries(languageId: string, reader: IReader | undefined): Query | null | undefined {
		if (!this.supportsLanguage(languageId, reader)) {
			return undefined;
		}
		const query = this._injectionQueries.get({ languageId, kind: 'injections' }).read(reader);
		return query;
	}

	getHighlightingQueries(languageId: string, reader: IReader | undefined): Query | null | undefined {
		if (!this.supportsLanguage(languageId, reader)) {
			return undefined;
		}
		const query = this._injectionQueries.get({ languageId, kind: 'highlights' }).read(reader);
		return query;
	}

	async createQuery(language: Language, querySource: string): Promise<Query> {
		const treeSitter = await this._treeSitterImport.value;
		return new treeSitter.Query(language, querySource);
	}
}

async function tryReadFile(fileService: IFileService, uri: URI): Promise<IFileContent | undefined> {
	try {
		const result = await fileService.readFile(uri);
		return result;
	} catch (e) {
		if (toFileOperationResult(e) === FileOperationResult.FILE_NOT_FOUND) {
			return undefined;
		}
		throw e;
	}
}
