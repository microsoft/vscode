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
var SnippetEnablement_1, SnippetUsageTimestamps_1;
import { combinedDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import * as resources from '../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { setSnippetSuggestSupport } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { localize } from '../../../../nls.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { SnippetFile } from './snippetsFile.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { languagesExtPoint } from '../../../services/language/common/languageService.js';
import { SnippetCompletionProvider } from './snippetCompletionProvider.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isStringArray } from '../../../../base/common/types.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { insertInto } from '../../../../base/common/arrays.js';
var snippetExt;
(function (snippetExt) {
    function toValidSnippet(extension, snippet, languageService) {
        if (isFalsyOrWhitespace(snippet.path)) {
            extension.collector.error(localize('invalid.path.0', "Expected string in `contributes.{0}.path`. Provided value: {1}", extension.description.name, String(snippet.path)));
            return null;
        }
        if (isFalsyOrWhitespace(snippet.language) && !snippet.path.endsWith('.code-snippets')) {
            extension.collector.error(localize('invalid.language.0', "When omitting the language, the value of `contributes.{0}.path` must be a `.code-snippets`-file. Provided value: {1}", extension.description.name, String(snippet.path)));
            return null;
        }
        if (!isFalsyOrWhitespace(snippet.language) && !languageService.isRegisteredLanguageId(snippet.language)) {
            extension.collector.error(localize('invalid.language', "Unknown language in `contributes.{0}.language`. Provided value: {1}", extension.description.name, String(snippet.language)));
            return null;
        }
        const extensionLocation = extension.description.extensionLocation;
        const snippetLocation = resources.joinPath(extensionLocation, snippet.path);
        if (!resources.isEqualOrParent(snippetLocation, extensionLocation)) {
            extension.collector.error(localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", extension.description.name, snippetLocation.path, extensionLocation.path));
            return null;
        }
        return {
            language: snippet.language,
            location: snippetLocation
        };
    }
    snippetExt.toValidSnippet = toValidSnippet;
    snippetExt.snippetsContribution = {
        description: localize('vscode.extension.contributes.snippets', 'Contributes snippets.'),
        type: 'array',
        defaultSnippets: [{ body: [{ language: '', path: '' }] }],
        items: {
            type: 'object',
            defaultSnippets: [{ body: { language: '${1:id}', path: './snippets/${2:id}.json.' } }],
            properties: {
                language: {
                    description: localize('vscode.extension.contributes.snippets-language', 'Language identifier for which this snippet is contributed to.'),
                    type: 'string'
                },
                path: {
                    description: localize('vscode.extension.contributes.snippets-path', 'Path of the snippets file. The path is relative to the extension folder and typically starts with \'./snippets/\'.'),
                    type: 'string'
                }
            }
        }
    };
    snippetExt.point = ExtensionsRegistry.registerExtensionPoint({
        extensionPoint: 'snippets',
        deps: [languagesExtPoint],
        jsonSchema: snippetExt.snippetsContribution
    });
})(snippetExt || (snippetExt = {}));
function watch(service, resource, callback) {
    return combinedDisposable(service.watch(resource), service.onDidFilesChange(e => {
        if (e.affects(resource)) {
            callback();
        }
    }));
}
let SnippetEnablement = class SnippetEnablement {
    static { SnippetEnablement_1 = this; }
    static { this._key = 'snippets.ignoredSnippets'; }
    constructor(_storageService) {
        this._storageService = _storageService;
        const raw = _storageService.get(SnippetEnablement_1._key, 0 /* StorageScope.PROFILE */, '');
        let data;
        try {
            data = JSON.parse(raw);
        }
        catch { }
        this._ignored = isStringArray(data) ? new Set(data) : new Set();
    }
    isIgnored(id) {
        return this._ignored.has(id);
    }
    updateIgnored(id, value) {
        let changed = false;
        if (this._ignored.has(id) && !value) {
            this._ignored.delete(id);
            changed = true;
        }
        else if (!this._ignored.has(id) && value) {
            this._ignored.add(id);
            changed = true;
        }
        if (changed) {
            this._storageService.store(SnippetEnablement_1._key, JSON.stringify(Array.from(this._ignored)), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
};
SnippetEnablement = SnippetEnablement_1 = __decorate([
    __param(0, IStorageService)
], SnippetEnablement);
let SnippetUsageTimestamps = class SnippetUsageTimestamps {
    static { SnippetUsageTimestamps_1 = this; }
    static { this._key = 'snippets.usageTimestamps'; }
    constructor(_storageService) {
        this._storageService = _storageService;
        const raw = _storageService.get(SnippetUsageTimestamps_1._key, 0 /* StorageScope.PROFILE */, '');
        let data;
        try {
            data = JSON.parse(raw);
        }
        catch {
            data = [];
        }
        this._usages = Array.isArray(data) ? new Map(data) : new Map();
    }
    getUsageTimestamp(id) {
        return this._usages.get(id);
    }
    updateUsageTimestamp(id) {
        // map uses insertion order, we want most recent at the end
        this._usages.delete(id);
        this._usages.set(id, Date.now());
        // persist last 100 item
        const all = [...this._usages].slice(-100);
        this._storageService.store(SnippetUsageTimestamps_1._key, JSON.stringify(all), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
};
SnippetUsageTimestamps = SnippetUsageTimestamps_1 = __decorate([
    __param(0, IStorageService)
], SnippetUsageTimestamps);
let SnippetsService = class SnippetsService {
    constructor(_environmentService, _userDataProfileService, _contextService, _languageService, _logService, _fileService, _textfileService, _extensionResourceLoaderService, lifecycleService, instantiationService, languageConfigurationService) {
        this._environmentService = _environmentService;
        this._userDataProfileService = _userDataProfileService;
        this._contextService = _contextService;
        this._languageService = _languageService;
        this._logService = _logService;
        this._fileService = _fileService;
        this._textfileService = _textfileService;
        this._extensionResourceLoaderService = _extensionResourceLoaderService;
        this._disposables = new DisposableStore();
        this._pendingWork = [];
        this._files = new ResourceMap();
        this._pendingWork.push(Promise.resolve(lifecycleService.when(3 /* LifecyclePhase.Restored */).then(() => {
            this._initExtensionSnippets();
            this._initUserSnippets();
            this._initWorkspaceSnippets();
        })));
        setSnippetSuggestSupport(new SnippetCompletionProvider(this._languageService, this, languageConfigurationService));
        this._enablement = instantiationService.createInstance(SnippetEnablement);
        this._usageTimestamps = instantiationService.createInstance(SnippetUsageTimestamps);
    }
    dispose() {
        this._disposables.dispose();
    }
    isEnabled(snippet) {
        return !this._enablement.isIgnored(snippet.snippetIdentifier);
    }
    updateEnablement(snippet, enabled) {
        this._enablement.updateIgnored(snippet.snippetIdentifier, !enabled);
    }
    updateUsageTimestamp(snippet) {
        this._usageTimestamps.updateUsageTimestamp(snippet.snippetIdentifier);
    }
    _joinSnippets() {
        const promises = this._pendingWork.slice(0);
        this._pendingWork.length = 0;
        return Promise.all(promises);
    }
    async getSnippetFiles() {
        await this._joinSnippets();
        return this._files.values();
    }
    async getSnippets(languageId, resourceUri, opts) {
        await this._joinSnippets();
        const result = [];
        const promises = [];
        if (languageId) {
            if (this._languageService.isRegisteredLanguageId(languageId)) {
                for (const file of this._files.values()) {
                    promises.push(file.load()
                        .then(file => file.select(languageId, result))
                        .catch(err => this._logService.error(err, file.location.toString())));
                }
            }
        }
        else {
            for (const file of this._files.values()) {
                promises.push(file.load()
                    .then(file => insertInto(result, result.length, file.data))
                    .catch(err => this._logService.error(err, file.location.toString())));
            }
        }
        await Promise.all(promises);
        return this._filterAndSortSnippets(result, resourceUri, opts);
    }
    getSnippetsSync(languageId, resourceUri, opts) {
        const result = [];
        if (this._languageService.isRegisteredLanguageId(languageId)) {
            for (const file of this._files.values()) {
                // kick off loading (which is a noop in case it's already loaded)
                // and optimistically collect snippets
                file.load().catch(_err => { });
                file.select(languageId, result);
            }
        }
        return this._filterAndSortSnippets(result, resourceUri, opts);
    }
    _filterAndSortSnippets(snippets, resourceUri, opts) {
        const result = [];
        for (const snippet of snippets) {
            if (!snippet.prefix && !opts?.includeNoPrefixSnippets) {
                // prefix or no-prefix wanted
                continue;
            }
            if (!this.isEnabled(snippet) && !opts?.includeDisabledSnippets) {
                // enabled or disabled wanted
                continue;
            }
            if (typeof opts?.fileTemplateSnippets === 'boolean' && opts.fileTemplateSnippets !== snippet.isFileTemplate) {
                // isTopLevel requested but mismatching
                continue;
            }
            if (resourceUri && !snippet.isFileIncluded(resourceUri)) {
                // include/exclude settings don't match
                continue;
            }
            result.push(snippet);
        }
        return result.sort((a, b) => {
            let result = 0;
            if (!opts?.noRecencySort) {
                const val1 = this._usageTimestamps.getUsageTimestamp(a.snippetIdentifier) ?? -1;
                const val2 = this._usageTimestamps.getUsageTimestamp(b.snippetIdentifier) ?? -1;
                result = val2 - val1;
            }
            if (result === 0) {
                result = this._compareSnippet(a, b);
            }
            return result;
        });
    }
    _compareSnippet(a, b) {
        if (a.snippetSource < b.snippetSource) {
            return -1;
        }
        else if (a.snippetSource > b.snippetSource) {
            return 1;
        }
        else if (a.source < b.source) {
            return -1;
        }
        else if (a.source > b.source) {
            return 1;
        }
        else if (a.name > b.name) {
            return 1;
        }
        else if (a.name < b.name) {
            return -1;
        }
        else {
            return 0;
        }
    }
    // --- loading, watching
    _initExtensionSnippets() {
        snippetExt.point.setHandler(extensions => {
            for (const [key, value] of this._files) {
                if (value.source === 3 /* SnippetSource.Extension */) {
                    this._files.delete(key);
                }
            }
            for (const extension of extensions) {
                for (const contribution of extension.value) {
                    const validContribution = snippetExt.toValidSnippet(extension, contribution, this._languageService);
                    if (!validContribution) {
                        continue;
                    }
                    const file = this._files.get(validContribution.location);
                    if (file) {
                        if (file.defaultScopes) {
                            file.defaultScopes.push(validContribution.language);
                        }
                        else {
                            file.defaultScopes = [];
                        }
                    }
                    else {
                        const file = new SnippetFile(3 /* SnippetSource.Extension */, validContribution.location, validContribution.language ? [validContribution.language] : undefined, extension.description, this._fileService, this._extensionResourceLoaderService);
                        this._files.set(file.location, file);
                        if (this._environmentService.isExtensionDevelopment) {
                            file.load().then(file => {
                                // warn about bad tabstop/variable usage
                                if (file.data.some(snippet => snippet.isBogous)) {
                                    extension.collector.warn(localize('badVariableUse', "One or more snippets from the extension '{0}' very likely confuse snippet-variables and snippet-placeholders (see https://code.visualstudio.com/docs/editor/userdefinedsnippets#_snippet-syntax for more details)", extension.description.name));
                                }
                            }, err => {
                                // generic error
                                extension.collector.warn(localize('badFile', "The snippet file \"{0}\" could not be read.", file.location.toString()));
                            });
                        }
                    }
                }
            }
        });
    }
    _initWorkspaceSnippets() {
        // workspace stuff
        const disposables = new DisposableStore();
        const updateWorkspaceSnippets = () => {
            disposables.clear();
            this._pendingWork.push(this._initWorkspaceFolderSnippets(this._contextService.getWorkspace(), disposables));
        };
        this._disposables.add(disposables);
        this._disposables.add(this._contextService.onDidChangeWorkspaceFolders(updateWorkspaceSnippets));
        this._disposables.add(this._contextService.onDidChangeWorkbenchState(updateWorkspaceSnippets));
        updateWorkspaceSnippets();
    }
    async _initWorkspaceFolderSnippets(workspace, bucket) {
        const promises = workspace.folders.map(async (folder) => {
            const snippetFolder = folder.toResource('.vscode');
            const value = await this._fileService.exists(snippetFolder);
            if (value) {
                this._initFolderSnippets(2 /* SnippetSource.Workspace */, snippetFolder, bucket);
            }
            else {
                // watch
                bucket.add(this._fileService.onDidFilesChange(e => {
                    if (e.contains(snippetFolder, 1 /* FileChangeType.ADDED */)) {
                        this._initFolderSnippets(2 /* SnippetSource.Workspace */, snippetFolder, bucket);
                    }
                }));
            }
        });
        await Promise.all(promises);
    }
    async _initUserSnippets() {
        const disposables = new DisposableStore();
        const updateUserSnippets = async () => {
            disposables.clear();
            const userSnippetsFolder = this._userDataProfileService.currentProfile.snippetsHome;
            await this._fileService.createFolder(userSnippetsFolder);
            await this._initFolderSnippets(1 /* SnippetSource.User */, userSnippetsFolder, disposables);
        };
        this._disposables.add(disposables);
        this._disposables.add(this._userDataProfileService.onDidChangeCurrentProfile(e => e.join((async () => {
            this._pendingWork.push(updateUserSnippets());
        })())));
        await updateUserSnippets();
    }
    _initFolderSnippets(source, folder, bucket) {
        const disposables = new DisposableStore();
        const addFolderSnippets = async () => {
            disposables.clear();
            if (!await this._fileService.exists(folder)) {
                return;
            }
            try {
                const stat = await this._fileService.resolve(folder);
                for (const entry of stat.children || []) {
                    disposables.add(this._addSnippetFile(entry.resource, source));
                }
            }
            catch (err) {
                this._logService.error(`Failed snippets from folder '${folder.toString()}'`, err);
            }
        };
        bucket.add(this._textfileService.files.onDidSave(e => {
            if (resources.isEqualOrParent(e.model.resource, folder)) {
                addFolderSnippets();
            }
        }));
        bucket.add(watch(this._fileService, folder, addFolderSnippets));
        bucket.add(disposables);
        return addFolderSnippets();
    }
    _addSnippetFile(uri, source) {
        const ext = resources.extname(uri);
        if (source === 1 /* SnippetSource.User */ && ext === '.json') {
            const langName = resources.basename(uri).replace(/\.json/, '');
            this._files.set(uri, new SnippetFile(source, uri, [langName], undefined, this._fileService, this._extensionResourceLoaderService));
        }
        else if (ext === '.code-snippets') {
            this._files.set(uri, new SnippetFile(source, uri, undefined, undefined, this._fileService, this._extensionResourceLoaderService));
        }
        return {
            dispose: () => this._files.delete(uri)
        };
    }
};
SnippetsService = __decorate([
    __param(0, IEnvironmentService),
    __param(1, IUserDataProfileService),
    __param(2, IWorkspaceContextService),
    __param(3, ILanguageService),
    __param(4, ILogService),
    __param(5, IFileService),
    __param(6, ITextFileService),
    __param(7, IExtensionResourceLoaderService),
    __param(8, ILifecycleService),
    __param(9, IInstantiationService),
    __param(10, ILanguageConfigurationService)
], SnippetsService);
export { SnippetsService };
export function getNonWhitespacePrefix(model, position) {
    /**
     * Do not analyze more characters
     */
    const MAX_PREFIX_LENGTH = 100;
    const line = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
    const minChIndex = Math.max(0, line.length - MAX_PREFIX_LENGTH);
    for (let chIndex = line.length - 1; chIndex >= minChIndex; chIndex--) {
        const ch = line.charAt(chIndex);
        if (/\s/.test(ch)) {
            return line.substr(chIndex + 1);
        }
    }
    if (minChIndex === 0) {
        return line;
    }
    return '';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHNTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc25pcHBldHMvYnJvd3Nlci9zbmlwcGV0c1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBZSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RyxPQUFPLEtBQUssU0FBUyxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBR3pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQWtCLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxpQkFBaUIsRUFBa0IsTUFBTSxpREFBaUQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFjLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFMUcsT0FBTyxFQUFXLFdBQVcsRUFBaUIsTUFBTSxtQkFBbUIsQ0FBQztBQUN4RSxPQUFPLEVBQUUsa0JBQWtCLEVBQXVCLE1BQU0sMkRBQTJELENBQUM7QUFDcEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDekYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0UsT0FBTyxF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