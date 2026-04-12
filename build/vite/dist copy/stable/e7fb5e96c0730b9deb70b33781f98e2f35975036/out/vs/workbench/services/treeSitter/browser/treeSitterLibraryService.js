/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { ObservablePromise } from '../../../../base/common/observable.js';
import { canASAR, importAMDNodeModule } from '../../../../amdX.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { CachedFunction } from '../../../../base/common/cache.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from '../../../../base/common/network.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
export const EDITOR_EXPERIMENTAL_PREFER_TREESITTER = 'editor.experimental.preferTreeSitter';
export const TREESITTER_ALLOWED_SUPPORT = ['css', 'typescript', 'ini', 'regex'];
const MODULE_LOCATION_SUBPATH = `@vscode/tree-sitter-wasm/wasm`;
const FILENAME_TREESITTER_WASM = `tree-sitter.wasm`;
export function getModuleLocation(environmentService) {
    return `${(canASAR && environmentService.isBuilt) ? nodeModulesAsarUnpackedPath : nodeModulesPath}/${MODULE_LOCATION_SUBPATH}`;
}
let TreeSitterLibraryService = class TreeSitterLibraryService extends Disposable {
    constructor(_configurationService, _fileService, _environmentService) {
        super();
        this._configurationService = _configurationService;
        this._fileService = _fileService;
        this._environmentService = _environmentService;
        this.isTest = false;
        this._treeSitterImport = new Lazy(async () => {
            const TreeSitter = await importAMDNodeModule('@vscode/tree-sitter-wasm', 'wasm/tree-sitter.js');
            const environmentService = this._environmentService;
            const isTest = this.isTest;
            await TreeSitter.Parser.init({
                locateFile(_file, _folder) {
                    const location = `${getModuleLocation(environmentService)}/${FILENAME_TREESITTER_WASM}`;
                    if (isTest) {
                        return FileAccess.asFileUri(location).toString(true);
                    }
                    else {
                        return FileAccess.asBrowserUri(location).toString(true);
                    }
                }
            });
            return TreeSitter;
        });
        this._supportsLanguage = new CachedFunction((languageId) => {
            return observableConfigValue(`${EDITOR_EXPERIMENTAL_PREFER_TREESITTER}.${languageId}`, false, this._configurationService);
        });
        this._languagesCache = new CachedFunction((languageId) => {
            return ObservablePromise.fromFn(async () => {
                const languageLocation = getModuleLocation(this._environmentService);
                const grammarName = `tree-sitter-${languageId}`;
                const wasmPath = `${languageLocation}/${grammarName}.wasm`;
                const [treeSitter, languageFile] = await Promise.all([
                    this._treeSitterImport.value,
                    this._fileService.readFile(FileAccess.asFileUri(wasmPath))
                ]);
                const Language = treeSitter.Language;
                const language = await Language.load(languageFile.value.buffer);
                return language;
            });
        });
        this._injectionQueries = new CachedFunction({ getCacheKey: JSON.stringify }, (arg) => {
            const loadQuerySource = async () => {
                const injectionsQueriesLocation = `vs/editor/common/languages/${arg.kind}/${arg.languageId}.scm`;
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
                const [querySource, language, treeSitter] = await Promise.all([
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
    }
    supportsLanguage(languageId, reader) {
        return this._supportsLanguage.get(languageId).read(reader);
    }
    async getParserClass() {
        const treeSitter = await this._treeSitterImport.value;
        return treeSitter.Parser;
    }
    getLanguage(languageId, ignoreSupportsCheck, reader) {
        if (!ignoreSupportsCheck && !this.supportsLanguage(languageId, reader)) {
            return undefined;
        }
        const lang = this._languagesCache.get(languageId).resolvedValue.read(reader);
        return lang;
    }
    async getLanguagePromise(languageId) {
        return this._languagesCache.get(languageId).promise;
    }
    getInjectionQueries(languageId, reader) {
        if (!this.supportsLanguage(languageId, reader)) {
            return undefined;
        }
        const query = this._injectionQueries.get({ languageId, kind: 'injections' }).read(reader);
        return query;
    }
    getHighlightingQueries(languageId, reader) {
        if (!this.supportsLanguage(languageId, reader)) {
            return undefined;
        }
        const query = this._injectionQueries.get({ languageId, kind: 'highlights' }).read(reader);
        return query;
    }
    async createQuery(language, querySource) {
        const treeSitter = await this._treeSitterImport.value;
        return new treeSitter.Query(language, querySource);
    }
};
TreeSitterLibraryService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IFileService),
    __param(2, IEnvironmentService)
], TreeSitterLibraryService);
export { TreeSitterLibraryService };
async function tryReadFile(fileService, uri) {
    try {
        const result = await fileService.readFile(uri);
        return result;
    }
    catch (e) {
        if (toFileOperationResult(e) === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
            return undefined;
        }
        throw e;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RyZWVTaXR0ZXIvYnJvd3Nlci90cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFXLGlCQUFpQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFbkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ25FLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQXFDLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3BJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQW1CLFVBQVUsRUFBRSwyQkFBMkIsRUFBRSxlQUFlLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvSCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHbEUsTUFBTSxDQUFDLE1BQU0scUNBQXFDLEdBQUcsc0NBQXNDLENBQUM7QUFDNUYsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztBQUVoRixNQUFNLHVCQUF1QixHQUFHLCtCQUErQixDQUFDO0FBQ2hFLE1BQU0sd0JBQXdC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