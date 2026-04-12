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
import { delta as arrayDelta, mapArrayOrNot } from '../../../base/common/arrays.js';
import { AsyncIterableProducer, Barrier } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { AsyncEmitter, Emitter } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { Schemas } from '../../../base/common/network.js';
import { Counter } from '../../../base/common/numbers.js';
import { basename, basenameOrAuthority, dirname, ExtUri, relativePath } from '../../../base/common/resources.js';
import { compare } from '../../../base/common/strings.js';
import { isUriComponents, URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { Severity } from '../../../platform/notification/common/notification.js';
import { Workspace, WorkspaceFolder } from '../../../platform/workspace/common/workspace.js';
import { IExtHostFileSystemInfo } from './extHostFileSystemInfo.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { GlobPattern } from './extHostTypeConverters.js';
import { Range } from './extHostTypes.js';
import { IURITransformerService } from './extHostUriTransformerService.js';
import { resultIsMatch } from '../../services/search/common/search.js';
import { MainContext } from './extHost.protocol.js';
import { revive } from '../../../base/common/marshalling.js';
import { ExcludeSettingOptions, TextSearchContext2, TextSearchMatch2 } from '../../services/search/common/searchExtTypes.js';
import { bufferToStream, readableToBuffer, VSBuffer } from '../../../base/common/buffer.js';
import { toDecodeStream, toEncodeReadable, UTF8 } from '../../services/textfile/common/encoding.js';
import { consumeStream } from '../../../base/common/stream.js';
import { stringToSnapshot } from '../../services/textfile/common/textfiles.js';
function isFolderEqual(folderA, folderB, extHostFileSystemInfo) {
    return new ExtUri(uri => ignorePathCasing(uri, extHostFileSystemInfo)).isEqual(folderA, folderB);
}
function compareWorkspaceFolderByUri(a, b, extHostFileSystemInfo) {
    return isFolderEqual(a.uri, b.uri, extHostFileSystemInfo) ? 0 : compare(a.uri.toString(), b.uri.toString());
}
function compareWorkspaceFolderByUriAndNameAndIndex(a, b, extHostFileSystemInfo) {
    if (a.index !== b.index) {
        return a.index < b.index ? -1 : 1;
    }
    return isFolderEqual(a.uri, b.uri, extHostFileSystemInfo) ? compare(a.name, b.name) : compare(a.uri.toString(), b.uri.toString());
}
function delta(oldFolders, newFolders, compare, extHostFileSystemInfo) {
    const oldSortedFolders = oldFolders.slice(0).sort((a, b) => compare(a, b, extHostFileSystemInfo));
    const newSortedFolders = newFolders.slice(0).sort((a, b) => compare(a, b, extHostFileSystemInfo));
    return arrayDelta(oldSortedFolders, newSortedFolders, (a, b) => compare(a, b, extHostFileSystemInfo));
}
function ignorePathCasing(uri, extHostFileSystemInfo) {
    const capabilities = extHostFileSystemInfo.getCapabilities(uri.scheme);
    return !(capabilities && (capabilities & 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */));
}
class ExtHostWorkspaceImpl extends Workspace {
    static toExtHostWorkspace(data, previousConfirmedWorkspace, previousUnconfirmedWorkspace, extHostFileSystemInfo) {
        if (!data) {
            return { workspace: null, added: [], removed: [] };
        }
        const { id, name, folders, configuration, transient, isUntitled } = data;
        const newWorkspaceFolders = [];
        // If we have an existing workspace, we try to find the folders that match our
        // data and update their properties. It could be that an extension stored them
        // for later use and we want to keep them "live" if they are still present.
        const oldWorkspace = previousConfirmedWorkspace;
        if (previousConfirmedWorkspace) {
            folders.forEach((folderData, index) => {
                const folderUri = URI.revive(folderData.uri);
                const existingFolder = ExtHostWorkspaceImpl._findFolder(previousUnconfirmedWorkspace || previousConfirmedWorkspace, folderUri, extHostFileSystemInfo);
                if (existingFolder) {
                    existingFolder.name = folderData.name;
                    existingFolder.index = folderData.index;
                    newWorkspaceFolders.push(existingFolder);
                }
                else {
                    newWorkspaceFolders.push({ uri: folderUri, name: folderData.name, index });
                }
            });
        }
        else {
            newWorkspaceFolders.push(...folders.map(({ uri, name, index }) => ({ uri: URI.revive(uri), name, index })));
        }
        // make sure to restore sort order based on index
        newWorkspaceFolders.sort((f1, f2) => f1.index < f2.index ? -1 : 1);
        const workspace = new ExtHostWorkspaceImpl(id, name, newWorkspaceFolders, !!transient, configuration ? URI.revive(configuration) : null, !!isUntitled, uri => ignorePathCasing(uri, extHostFileSystemInfo));
        const { added, removed } = delta(oldWorkspace ? oldWorkspace.workspaceFolders : [], workspace.workspaceFolders, compareWorkspaceFolderByUri, extHostFileSystemInfo);
        return { workspace, added, removed };
    }
    static _findFolder(workspace, folderUriToFind, extHostFileSystemInfo) {
        for (let i = 0; i < workspace.folders.length; i++) {
            const folder = workspace.workspaceFolders[i];
            if (isFolderEqual(folder.uri, folderUriToFind, extHostFileSystemInfo)) {
                return folder;
            }
        }
        return undefined;
    }
    constructor(id, _name, folders, transient, configuration, _isUntitled, ignorePathCasing) {
        super(id, folders.map(f => new WorkspaceFolder(f)), transient, configuration, ignorePathCasing);
        this._name = _name;
        this._isUntitled = _isUntitled;
        this._workspaceFolders = [];
        this._structure = TernarySearchTree.forUris(ignorePathCasing, () => true);
        // setup the workspace folder data structure
        folders.forEach(folder => {
            this._workspaceFolders.push(folder);
            this._structure.set(folder.uri, folder);
        });
    }
    get name() {
        return this._name;
    }
    get isUntitled() {
        return this._isUntitled;
    }
    get workspaceFolders() {
        return this._workspaceFolders.slice(0);
    }
    getWorkspaceFolder(uri, resolveParent) {
        if (resolveParent && this._structure.get(uri)) {
            // `uri` is a workspace folder so we check for its parent
            uri = dirname(uri);
        }
        return this._structure.findSubstr(uri);
    }
    resolveWorkspaceFolder(uri) {
        return this._structure.get(uri);
    }
}
let ExtHostWorkspace = class ExtHostWorkspace {
    constructor(extHostRpc, initData, extHostFileSystemInfo, logService, uriTransformerService) {
        this._onDidChangeWorkspace = new Emitter();
        this.onDidChangeWorkspace = this._onDidChangeWorkspace.event;
        this._onDidGrantWorkspaceTrust = new Emitter();
        this.onDidGrantWorkspaceTrust = this._onDidGrantWorkspaceTrust.event;
        this._onDidChangeWorkspaceTrustedFolders = new Emitter();
        this.onDidChangeWorkspaceTrustedFolders = this._onDidChangeWorkspaceTrustedFolders.event;
        this._activeSearchCallbacks = [];
        this._trusted = false;
        this._editSessionIdentityProviders = new Map();
        // --- edit sessions ---
        this._providerHandlePool = 0;
        this._onWillCreateEditSessionIdentityEvent = new AsyncEmitter();
        // --- canonical uri identity ---
        this._canonicalUriProviders = new Map();
        this._logService = logService;
        this._extHostFileSystemInfo = extHostFileSystemInfo;
        this._uriTransformerService = uriTransformerService;
        this._requestIdProvider = new Counter();
        this._barrier = new Barrier();
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadWorkspace);
        this._messageService = extHostRpc.getProxy(MainContext.MainThreadMessageService);
        const data = initData.workspace;
        this._confirmedWorkspace = data ? new ExtHostWorkspaceImpl(data.id, data.name, [], !!data.transient, data.configuration ? URI.revive(data.configuration) : null, !!data.isUntitled, uri => ignorePathCasing(uri, extHostFileSystemInfo)) : undefined;
    }
    $initializeWorkspace(data, trusted) {
        this._trusted = trusted;
        this.$acceptWorkspaceData(data);
        this._barrier.open();
    }
    waitForInitializeCall() {
        return this._barrier.wait();
    }
    // --- workspace ---
    get workspace() {
        return this._actualWorkspace;
    }
    get name() {
        return this._actualWorkspace ? this._actualWorkspace.name : undefined;
    }
    get workspaceFile() {
        if (this._actualWorkspace) {
            if (this._actualWorkspace.configuration) {
                if (this._actualWorkspace.isUntitled) {
                    return URI.from({ scheme: Schemas.untitled, path: basename(dirname(this._actualWorkspace.configuration)) }); // Untitled Workspace: return untitled URI
                }
                return this._actualWorkspace.configuration; // Workspace: return the configuration location
            }
        }
        return undefined;
    }
    get _actualWorkspace() {
        return this._unconfirmedWorkspace || this._confirmedWorkspace;
    }
    getWorkspaceFolders() {
        if (!this._actualWorkspace) {
            return undefined;
        }
        return this._actualWorkspace.workspaceFolders.slice(0);
    }
    async getWorkspaceFolders2() {
        await this._barrier.wait();
        if (!this._actualWorkspace) {
            return undefined;
        }
        return this._actualWorkspace.workspaceFolders.slice(0);
    }
    updateWorkspaceFolders(extension, index, deleteCount, ...workspaceFoldersToAdd) {
        const validatedDistinctWorkspaceFoldersToAdd = [];
        if (Array.isArray(workspaceFoldersToAdd)) {
            workspaceFoldersToAdd.forEach(folderToAdd => {
                if (URI.isUri(folderToAdd.uri) && !validatedDistinctWorkspaceFoldersToAdd.some(f => isFolderEqual(f.uri, folderToAdd.uri, this._extHostFileSystemInfo))) {
                    validatedDistinctWorkspaceFoldersToAdd.push({ uri: folderToAdd.uri, name: folderToAdd.name || basenameOrAuthority(folderToAdd.uri) });
                }
            });
        }
        if (!!this._unconfirmedWorkspace) {
            return false; // prevent accumulated calls without a confirmed workspace
        }
        if ([index, deleteCount].some(i => typeof i !== 'number' || i < 0)) {
            return false; // validate numbers
        }
        if (deleteCount === 0 && validatedDistinctWorkspaceFoldersToAdd.length === 0) {
            return false; // nothing to delete or add
        }
        const currentWorkspaceFolders = this._actualWorkspace ? this._actualWorkspace.workspaceFolders : [];
        if (index + deleteCount > currentWorkspaceFolders.length) {
            return false; // cannot delete more than we have
        }
        // Simulate the updateWorkspaceFolders method on our data to do more validation
        const newWorkspaceFolders = currentWorkspaceFolders.slice(0);
        newWorkspaceFolders.splice(index, deleteCount, ...validatedDistinctWorkspaceFoldersToAdd.map(f => ({ uri: f.uri, name: f.name || basenameOrAuthority(f.uri), index: undefined /* fixed later */ })));
        for (let i = 0; i < newWorkspaceFolders.length; i++) {
            const folder = newWorkspaceFolders[i];
            if (newWorkspaceFolders.some((otherFolder, index) => index !== i && isFolderEqual(folder.uri, otherFolder.uri, this._extHostFileSystemInfo))) {
                return false; // cannot add the same folder multiple times
            }
        }
        newWorkspaceFolders.forEach((f, index) => f.index = index); // fix index
        const { added, removed } = delta(currentWorkspaceFolders, newWorkspaceFolders, compareWorkspaceFolderByUriAndNameAndIndex, this._extHostFileSystemInfo);
        if (added.length === 0 && removed.length === 0) {
            return false; // nothing actually changed
        }
        // Trigger on main side
        if (this._proxy) {
            const extName = extension.displayName || extension.name;
            this._proxy.$updateWorkspaceFolders(extName, index, deleteCount, validatedDistinctWorkspaceFoldersToAdd).then(undefined, error => {
                // in case of an error, make sure to clear out the unconfirmed workspace
                // because we cannot expect the acknowledgement from the main side for this
                this._unconfirmedWorkspace = undefined;
                // show error to user
                const options = { source: { identifier: extension.identifier, label: extension.displayName || extension.name } };
                this._messageService.$showMessage(Severity.Error, localize('updateerror', "Extension '{0}' failed to update workspace folders: {1}", extName, error.toString()), options, []);
            });
        }
        // Try to accept directly
        this.trySetWorkspaceFolders(newWorkspaceFolders);
        return true;
    }
    getWorkspaceFolder(uri, resolveParent) {
        if (!this._actualWorkspace) {
            return undefined;
        }
        return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
    }
    async getWorkspaceFolder2(uri, resolveParent) {
        await this._barrier.wait();
        if (!this._actualWorkspace) {
            return undefined;
        }
        return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
    }
    async resolveWorkspaceFolder(uri) {
        await this._barrier.wait();
        if (!this._actualWorkspace) {
            return undefined;
        }
        return this._actualWorkspace.resolveWorkspaceFolder(uri);
    }
    getPath() {
        // this is legacy from the days before having
        // multi-root and we keep it only alive if there
        // is just one workspace folder.
        if (!this._actualWorkspace) {
            return undefined;
        }
        const { folders } = this._actualWorkspace;
        if (folders.length === 0) {
            return undefined;
        }
        // #54483 @Joh Why are we still using fsPath?
        return folders[0].uri.fsPath;
    }
    getRelativePath(pathOrUri, includeWorkspace) {
        let resource;
        let path = '';
        if (typeof pathOrUri === 'string') {
            resource = URI.file(pathOrUri);
            path = pathOrUri;
        }
        else if (typeof pathOrUri !== 'undefined') {
            resource = pathOrUri;
            path = pathOrUri.fsPath;
        }
        if (!resource) {
            return path;
        }
        const folder = this.getWorkspaceFolder(resource, true);
        if (!folder) {
            return path;
        }
        if (typeof includeWorkspace === 'undefined' && this._actualWorkspace) {
            includeWorkspace = this._actualWorkspace.folders.length > 1;
        }
        let result = relativePath(folder.uri, resource);
        if (includeWorkspace && folder.name) {
            result = `${folder.name}/${result}`;
        }
        return result;
    }
    trySetWorkspaceFolders(folders) {
        // Update directly here. The workspace is unconfirmed as long as we did not get an
        // acknowledgement from the main side (via $acceptWorkspaceData)
        if (this._actualWorkspace) {
            this._unconfirmedWorkspace = ExtHostWorkspaceImpl.toExtHostWorkspace({
                id: this._actualWorkspace.id,
                name: this._actualWorkspace.name,
                configuration: this._actualWorkspace.configuration,
                folders,
                isUntitled: this._actualWorkspace.isUntitled
            }, this._actualWorkspace, undefined, this._extHostFileSystemInfo).workspace || undefined;
        }
    }
    $acceptWorkspaceData(data) {
        const { workspace, added, removed } = ExtHostWorkspaceImpl.toExtHostWorkspace(data, this._confirmedWorkspace, this._unconfirmedWorkspace, this._extHostFileSystemInfo);
        // Update our workspace object. We have a confirmed workspace, so we drop our
        // unconfirmed workspace.
        this._confirmedWorkspace = workspace || undefined;
        this._unconfirmedWorkspace = undefined;
        // Events
        this._onDidChangeWorkspace.fire(Object.freeze({
            added,
            removed,
        }));
    }
    // --- search ---
    /**
     * Note, null/undefined have different and important meanings for "exclude"
     */
    findFiles(include, exclude, maxResults, extensionId, token = CancellationToken.None) {
        this._logService.trace(`extHostWorkspace#findFiles: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles`);
        let excludeString = '';
        let useFileExcludes = true;
        if (exclude === null) {
            useFileExcludes = false;
        }
        else if (exclude !== undefined) {
            if (typeof exclude === 'string') {
                excludeString = exclude;
            }
            else {
                excludeString = exclude.pattern;
            }
        }
        // todo: consider exclude baseURI if available
        return this._findFilesImpl({ type: 'include', value: include }, {
            exclude: [excludeString],
            maxResults,
            useExcludeSettings: useFileExcludes ? ExcludeSettingOptions.FilesExclude : ExcludeSettingOptions.None,
            useIgnoreFiles: {
                local: false
            }
        }, token);
    }
    findFiles2(filePatterns, options = {}, extensionId, token = CancellationToken.None) {
        this._logService.trace(`extHostWorkspace#findFiles2New: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles2New`);
        return this._findFilesImpl({ type: 'filePatterns', value: filePatterns }, options, token);
    }
    async _findFilesImpl(
    // the old `findFiles` used `include` to query, but the new `findFiles2` uses `filePattern` to query.
    // `filePattern` is the proper way to handle this, since it takes less precedence than the ignore files.
    query, options, token) {
        if (token.isCancellationRequested) {
            return Promise.resolve([]);
        }
        const filePatternsToUse = query.type === 'include' ? [query.value] : query.value ?? [];
        if (!Array.isArray(filePatternsToUse)) {
            console.error('Invalid file pattern provided', filePatternsToUse);
            throw new Error(`Invalid file pattern provided ${JSON.stringify(filePatternsToUse)}`);
        }
        const queryOptions = filePatternsToUse.map(filePattern => {
            const excludePatterns = globsToISearchPatternBuilder(options.exclude);
            const fileQueries = {
                ignoreSymlinks: typeof options.followSymlinks === 'boolean' ? !options.followSymlinks : undefined,
                disregardIgnoreFiles: typeof options.useIgnoreFiles?.local === 'boolean' ? !options.useIgnoreFiles.local : undefined,
                disregardGlobalIgnoreFiles: typeof options.useIgnoreFiles?.global === 'boolean' ? !options.useIgnoreFiles.global : undefined,
                disregardParentIgnoreFiles: typeof options.useIgnoreFiles?.parent === 'boolean' ? !options.useIgnoreFiles.parent : undefined,
                disregardExcludeSettings: options.useExcludeSettings !== undefined && options.useExcludeSettings === ExcludeSettingOptions.None,
                disregardSearchExcludeSettings: options.useExcludeSettings !== undefined && (options.useExcludeSettings !== ExcludeSettingOptions.SearchAndFilesExclude),
                maxResults: options.maxResults,
                excludePattern: excludePatterns.length > 0 ? excludePatterns : undefined,
                ignoreGlobCase: options.caseInsensitive,
                _reason: 'startFileSearch',
                shouldGlobSearch: query.type === 'include' ? undefined : true,
            };
            const parseInclude = parseSearchExcludeInclude(GlobPattern.from(filePattern));
            const folderToUse = parseInclude?.folder;
            if (query.type === 'include') {
                fileQueries.includePattern = parseInclude?.pattern;
            }
            else {
                fileQueries.filePattern = parseInclude?.pattern;
            }
            return {
                folder: folderToUse,
                options: fileQueries
            };
        });
        return this._findFilesBase(queryOptions, token);
    }
    async _findFilesBase(queryOptions, token) {
        const result = await Promise.all(queryOptions?.map(option => this._proxy.$startFileSearch(option.folder ?? null, option.options, token).then(data => Array.isArray(data) ? data.map(d => URI.revive(d)) : [])) ?? []);
        const flatResult = result.flat();
        // Dedupe entries in a flat array
        const extUri = new ExtUri(uri => ignorePathCasing(uri, this._extHostFileSystemInfo));
        const uriMap = new Map();
        for (const uri of flatResult) {
            const key = extUri.getComparisonKey(uri);
            if (!uriMap.has(key)) {
                uriMap.set(key, uri);
            }
        }
        return Array.from(uriMap.values());
    }
    findTextInFiles2(query, options, extensionId, token = CancellationToken.None) {
        this._logService.trace(`extHostWorkspace#findTextInFiles2: textSearch, extension: ${extensionId.value}, entryPoint: findTextInFiles2`);
        const getOptions = (include) => {
            if (!options) {
                return {
                    folder: undefined,
                    options: {}
                };
            }
            const parsedInclude = include ? parseSearchExcludeInclude(GlobPattern.from(include)) : undefined;
            const excludePatterns = options.exclude ? globsToISearchPatternBuilder(options.exclude) : undefined;
            return {
                options: {
                    ignoreSymlinks: typeof options.followSymlinks === 'boolean' ? !options.followSymlinks : undefined,
                    disregardIgnoreFiles: typeof options.useIgnoreFiles?.local === 'boolean' ? !options.useIgnoreFiles?.local : undefined,
                    disregardGlobalIgnoreFiles: typeof options.useIgnoreFiles?.global === 'boolean' ? !options.useIgnoreFiles?.global : undefined,
                    disregardParentIgnoreFiles: typeof options.useIgnoreFiles?.parent === 'boolean' ? !options.useIgnoreFiles?.parent : undefined,
                    disregardExcludeSettings: options.useExcludeSettings !== undefined && options.useExcludeSettings === ExcludeSettingOptions.None,
                    disregardSearchExcludeSettings: options.useExcludeSettings !== undefined && (options.useExcludeSettings !== ExcludeSettingOptions.SearchAndFilesExclude),
                    fileEncoding: options.encoding,
                    maxResults: options.maxResults,
                    ignoreGlobCase: options.caseInsensitive,
                    previewOptions: options.previewOptions ? {
                        matchLines: options.previewOptions?.numMatchLines ?? 100,
                        charsPerLine: options.previewOptions?.charsPerLine ?? 10000,
                    } : undefined,
                    surroundingContext: options.surroundingContext,
                    includePattern: parsedInclude?.pattern,
                    excludePattern: excludePatterns
                },
                folder: parsedInclude?.folder
            };
        };
        const queryOptionsRaw = ((options?.include?.map((include) => getOptions(include)))) ?? [getOptions(undefined)];
        const queryOptions = queryOptionsRaw.filter((queryOps) => !!queryOps);
        const disposables = new DisposableStore();
        const progressEmitter = disposables.add(new Emitter());
        const complete = this.findTextInFilesBase(query, queryOptions, (result, uri) => progressEmitter.fire({ result, uri }), token);
        const asyncIterable = new AsyncIterableProducer(async (emitter) => {
            disposables.add(progressEmitter.event(e => {
                const result = e.result;
                const uri = e.uri;
                if (resultIsMatch(result)) {
                    emitter.emitOne(new TextSearchMatch2(uri, result.rangeLocations.map((range) => ({
                        previewRange: new Range(range.preview.startLineNumber, range.preview.startColumn, range.preview.endLineNumber, range.preview.endColumn),
                        sourceRange: new Range(range.source.startLineNumber, range.source.startColumn, range.source.endLineNumber, range.source.endColumn)
                    })), result.previewText));
                }
                else {
                    emitter.emitOne(new TextSearchContext2(uri, result.text, result.lineNumber));
                }
            }));
            await complete;
        });
        return {
            results: asyncIterable,
            complete: complete.then((e) => {
                disposables.dispose();
                return {
                    limitHit: e?.limitHit ?? false
                };
            }),
        };
    }
    async findTextInFilesBase(query, queryOptions, callback, token = CancellationToken.None) {
        const requestId = this._requestIdProvider.getNext();
        let isCanceled = false;
        token.onCancellationRequested(_ => {
            isCanceled = true;
        });
        this._activeSearchCallbacks[requestId] = p => {
            if (isCanceled) {
                return;
            }
            const uri = URI.revive(p.resource);
            p.results.forEach(rawResult => {
                const result = revive(rawResult);
                callback(result, uri);
            });
        };
        if (token.isCancellationRequested) {
            return {};
        }
        try {
            const result = await Promise.all(queryOptions?.map(option => this._proxy.$startTextSearch(query, option.folder ?? null, option.options, requestId, token) || {}) ?? []);
            delete this._activeSearchCallbacks[requestId];
            return result.reduce((acc, val) => {
                return {
                    limitHit: acc?.limitHit || (val?.limitHit ?? false),
                    message: [acc?.message ?? [], val?.message ?? []].flat(),
                };
            }, {}) ?? { limitHit: false };
        }
        catch (err) {
            delete this._activeSearchCallbacks[requestId];
            throw err;
        }
    }
    async findTextInFiles(query, options, callback, extensionId, token = CancellationToken.None) {
        this._logService.trace(`extHostWorkspace#findTextInFiles: textSearch, extension: ${extensionId.value}, entryPoint: findTextInFiles`);
        const previewOptions = typeof options.previewOptions === 'undefined' ?
            {
                matchLines: 100,
                charsPerLine: 10000
            } :
            options.previewOptions;
        const parsedInclude = parseSearchExcludeInclude(GlobPattern.from(options.include));
        const excludePattern = (typeof options.exclude === 'string') ? options.exclude :
            options.exclude ? options.exclude.pattern : undefined;
        const queryOptions = {
            ignoreSymlinks: typeof options.followSymlinks === 'boolean' ? !options.followSymlinks : undefined,
            disregardIgnoreFiles: typeof options.useIgnoreFiles === 'boolean' ? !options.useIgnoreFiles : undefined,
            disregardGlobalIgnoreFiles: typeof options.useGlobalIgnoreFiles === 'boolean' ? !options.useGlobalIgnoreFiles : undefined,
            disregardParentIgnoreFiles: typeof options.useParentIgnoreFiles === 'boolean' ? !options.useParentIgnoreFiles : undefined,
            disregardExcludeSettings: typeof options.useDefaultExcludes === 'boolean' ? !options.useDefaultExcludes : true,
            disregardSearchExcludeSettings: typeof options.useSearchExclude === 'boolean' ? !options.useSearchExclude : true,
            fileEncoding: options.encoding,
            maxResults: options.maxResults,
            previewOptions,
            surroundingContext: options.afterContext, // TODO: remove ability to have before/after context separately
            includePattern: parsedInclude?.pattern,
            excludePattern: excludePattern ? [{ pattern: excludePattern }] : undefined,
        };
        const progress = (result, uri) => {
            if (resultIsMatch(result)) {
                callback({
                    uri,
                    preview: {
                        text: result.previewText,
                        matches: mapArrayOrNot(result.rangeLocations, m => new Range(m.preview.startLineNumber, m.preview.startColumn, m.preview.endLineNumber, m.preview.endColumn))
                    },
                    ranges: mapArrayOrNot(result.rangeLocations, r => new Range(r.source.startLineNumber, r.source.startColumn, r.source.endLineNumber, r.source.endColumn))
                });
            }
            else {
                callback({
                    uri,
                    text: result.text,
                    lineNumber: result.lineNumber
                });
            }
        };
        return this.findTextInFilesBase(query, [{ options: queryOptions, folder: parsedInclude?.folder }], progress, token);
    }
    $handleTextSearchResult(result, requestId) {
        this._activeSearchCallbacks[requestId]?.(result);
    }
    async save(uri) {
        const result = await this._proxy.$save(uri, { saveAs: false });
        return URI.revive(result);
    }
    async saveAs(uri) {
        const result = await this._proxy.$save(uri, { saveAs: true });
        return URI.revive(result);
    }
    saveAll(includeUntitled) {
        return this._proxy.$saveAll(includeUntitled);
    }
    resolveProxy(url) {
        return this._proxy.$resolveProxy(url);
    }
    lookupAuthorization(authInfo) {
        return this._proxy.$lookupAuthorization(authInfo);
    }
    lookupKerberosAuthorization(url) {
        return this._proxy.$lookupKerberosAuthorization(url);
    }
    loadCertificates() {
        return this._proxy.$loadCertificates();
    }
    // --- trust ---
    get trusted() {
        return this._trusted;
    }
    requestResourceTrust(options) {
        return this._proxy.$requestResourceTrust(options);
    }
    requestWorkspaceTrust(options) {
        return this._proxy.$requestWorkspaceTrust(options);
    }
    $onDidGrantWorkspaceTrust() {
        if (!this._trusted) {
            this._trusted = true;
            this._onDidGrantWorkspaceTrust.fire();
        }
    }
    $onDidChangeWorkspaceTrustedFolders() {
        this._onDidChangeWorkspaceTrustedFolders.fire();
    }
    isResourceTrusted(resource) {
        return this._proxy.$isResourceTrusted(resource);
    }
    // called by ext host
    registerEditSessionIdentityProvider(scheme, provider) {
        if (this._editSessionIdentityProviders.has(scheme)) {
            throw new Error(`A provider has already been registered for scheme ${scheme}`);
        }
        this._editSessionIdentityProviders.set(scheme, provider);
        const outgoingScheme = this._uriTransformerService.transformOutgoingScheme(scheme);
        const handle = this._providerHandlePool++;
        this._proxy.$registerEditSessionIdentityProvider(handle, outgoingScheme);
        return toDisposable(() => {
            this._editSessionIdentityProviders.delete(scheme);
            this._proxy.$unregisterEditSessionIdentityProvider(handle);
        });
    }
    // called by main thread
    async $getEditSessionIdentifier(workspaceFolder, cancellationToken) {
        this._logService.info('Getting edit session identifier for workspaceFolder', workspaceFolder);
        const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
        if (!folder) {
            this._logService.warn('Unable to resolve workspace folder');
            return undefined;
        }
        this._logService.info('Invoking #provideEditSessionIdentity for workspaceFolder', folder);
        const provider = this._editSessionIdentityProviders.get(folder.uri.scheme);
        this._logService.info(`Provider for scheme ${folder.uri.scheme} is defined: `, !!provider);
        if (!provider) {
            return undefined;
        }
        const result = await provider.provideEditSessionIdentity(folder, cancellationToken);
        this._logService.info('Provider returned edit session identifier: ', result);
        if (!result) {
            return undefined;
        }
        return result;
    }
    async $provideEditSessionIdentityMatch(workspaceFolder, identity1, identity2, cancellationToken) {
        this._logService.info('Getting edit session identifier for workspaceFolder', workspaceFolder);
        const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
        if (!folder) {
            this._logService.warn('Unable to resolve workspace folder');
            return undefined;
        }
        this._logService.info('Invoking #provideEditSessionIdentity for workspaceFolder', folder);
        const provider = this._editSessionIdentityProviders.get(folder.uri.scheme);
        this._logService.info(`Provider for scheme ${folder.uri.scheme} is defined: `, !!provider);
        if (!provider) {
            return undefined;
        }
        const result = await provider.provideEditSessionIdentityMatch?.(identity1, identity2, cancellationToken);
        this._logService.info('Provider returned edit session identifier match result: ', result);
        if (!result) {
            return undefined;
        }
        return result;
    }
    getOnWillCreateEditSessionIdentityEvent(extension) {
        return (listener, thisArg, disposables) => {
            const wrappedListener = function wrapped(e) { listener.call(thisArg, e); };
            wrappedListener.extension = extension;
            return this._onWillCreateEditSessionIdentityEvent.event(wrappedListener, undefined, disposables);
        };
    }
    // main thread calls this to trigger participants
    async $onWillCreateEditSessionIdentity(workspaceFolder, token, timeout) {
        const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
        if (folder === undefined) {
            throw new Error('Unable to resolve workspace folder');
        }
        await this._onWillCreateEditSessionIdentityEvent.fireAsync({ workspaceFolder: folder }, token, async (thenable, listener) => {
            const now = Date.now();
            await Promise.resolve(thenable);
            if (Date.now() - now > timeout) {
                this._logService.warn('SLOW edit session create-participant', listener.extension.identifier);
            }
        });
        if (token.isCancellationRequested) {
            return undefined;
        }
    }
    // called by ext host
    registerCanonicalUriProvider(scheme, provider) {
        if (this._canonicalUriProviders.has(scheme)) {
            throw new Error(`A provider has already been registered for scheme ${scheme}`);
        }
        this._canonicalUriProviders.set(scheme, provider);
        const outgoingScheme = this._uriTransformerService.transformOutgoingScheme(scheme);
        const handle = this._providerHandlePool++;
        this._proxy.$registerCanonicalUriProvider(handle, outgoingScheme);
        return toDisposable(() => {
            this._canonicalUriProviders.delete(scheme);
            this._proxy.$unregisterCanonicalUriProvider(handle);
        });
    }
    async provideCanonicalUri(uri, options, cancellationToken) {
        const provider = this._canonicalUriProviders.get(uri.scheme);
        if (!provider) {
            return undefined;
        }
        const result = await provider.provideCanonicalUri?.(URI.revive(uri), options, cancellationToken);
        if (!result) {
            return undefined;
        }
        return result;
    }
    // called by main thread
    async $provideCanonicalUri(uri, targetScheme, cancellationToken) {
        return this.provideCanonicalUri(URI.revive(uri), { targetScheme }, cancellationToken);
    }
    // --- encodings ---
    async decode(content, args) {
        const [uri, opts] = this.toEncodeDecodeParameters(args);
        const options = await this._proxy.$resolveDecoding(uri, opts);
        const stream = (await toDecodeStream(bufferToStream(VSBuffer.wrap(content)), {
            ...options,
            acceptTextOnly: true,
            overwriteEncoding: detectedEncoding => {
                if (detectedEncoding === null || detectedEncoding === options.preferredEncoding) {
                    // Prevent another roundtrip to the main thread
                    // if the detected encoding is null or the same
                    // as the preferred encoding
                    return Promise.resolve(options.preferredEncoding);
                }
                return this._proxy.$validateDetectedEncoding(uri, detectedEncoding, opts);
            },
        })).stream;
        return consumeStream(stream, chunks => chunks.join(''));
    }
    async encode(content, args) {
        const [uri, options] = this.toEncodeDecodeParameters(args);
        const { encoding, addBOM } = await this._proxy.$resolveEncoding(uri, options);
        // when encoding is standard skip encoding step
        if (encoding === UTF8 && !addBOM) {
            return VSBuffer.fromString(content).buffer;
        }
        // otherwise create encoded readable
        const res = await toEncodeReadable(stringToSnapshot(content), encoding, { addBOM });
        return readableToBuffer(res).buffer;
    }
    toEncodeDecodeParameters(opts) {
        const uri = isUriComponents(opts?.uri) ? opts.uri : undefined;
        const encoding = typeof opts?.encoding === 'string' ? opts.encoding : undefined;
        return [uri, encoding ? { encoding } : undefined];
    }
};
ExtHostWorkspace = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostInitDataService),
    __param(2, IExtHostFileSystemInfo),
    __param(3, ILogService),
    __param(4, IURITransformerService)
], ExtHostWorkspace);
export { ExtHostWorkspace };
export const IExtHostWorkspace = createDecorator('IExtHostWorkspace');
function parseSearchExcludeInclude(include) {
    let pattern;
    let includeFolder;
    if (include) {
        if (typeof include === 'string') {
            pattern = include;
        }
        else {
            pattern = include.pattern;
            includeFolder = URI.revive(include.baseUri);
        }
        return {
            pattern,
            folder: includeFolder
        };
    }
    return undefined;
}
function globsToISearchPatternBuilder(excludes) {
    return (excludes?.map((exclude) => {
        if (typeof exclude === 'string') {
            if (exclude === '') {
                return undefined;
            }
            return {
                pattern: exclude,
                uri: undefined
            };
        }
        else {
            const parsedExclude = parseSearchExcludeInclude(exclude);
            if (!parsedExclude) {
                return undefined;
            }
            return {
                pattern: parsedExclude.pattern,
                uri: parsedExclude.folder
            };
        }
    }) ?? []).filter((e) => !!e);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFdvcmtzcGFjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RXb3Jrc3BhY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssSUFBSSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDN0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxRQUFRLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNqSCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFDbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRzNDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRWpGLE9BQU8sRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDN0YsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDcEUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUMxQyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUzRSxPQUFPLEVBQXFDLGFBQWEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRTFHLE9BQU8sRUFBOEQsV0FBVyxFQUFxRixNQUFNLHVCQUF1QixDQUFDO0FBQ25NLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM3SCxPQUFPLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDcEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBWS9FLFNBQVMsYUFBYSxDQUFDLE9BQVksRUFBRSxPQUFZLEVBQUUscUJBQTZDO0lBQy9GLE9BQU8sSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUscUJBQXFCLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDbEcsQ0FBQztBQUVELFNBQVMsMkJBQTJCLENBQUMsQ0FBeUIsRUFBRSxDQUF5QixFQUFFLHFCQUE2QztJQUN2SSxPQUFPLGFBQWEsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7QUFDN0csQ0FBQztBQUVELFNBQVMsMENBQTBDLENBQUMsQ0FBeUIsRUFBRSxDQUF5QixFQUFFLHFCQUE2QztJQUN0SixJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3pCLE9BQU8sQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxPQUFPLGFBQWEsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7QUFDbkksQ0FBQztBQUVELFNBQVMsS0FBSyxDQUFDLFVBQW9DLEVBQUUsVUFBb0MsRUFBRSxPQUF3SCxFQUFFLHFCQUE2QztJQUNqUSxNQUFNLGdCQUFnQixHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQyxDQUFDO0lBQ2xHLE1BQU0sZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7SUFFbEcsT0FBTyxVQUFVLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7QUFDdkcsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsR0FBUSxFQUFFLHFCQUE2QztJQUNoRixNQUFNLFlBQVksR0FBRyxxQkFBcUIsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZFLE9BQU8sQ0FBQyxDQUFDLFlBQVksSUFBSSxDQUFDLFlBQVksOERBQW1ELENBQUMsQ0FBQyxDQUFDO0FBQzdGLENBQUM7QUFZRCxNQUFNLG9CQUFxQixTQUFRLFNBQVM7SUFFM0MsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQTJCLEVBQUUsMEJBQTRELEVBQUUsNEJBQThELEVBQUUscUJBQTZDO1FBQ2pPLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLE9BQU8sRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQ3BELENBQUM7UUFFRCxNQUFNLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDekUsTUFBTSxtQkFBbUIsR0FBNkIsRUFBRSxDQUFDO1FBRXpELDhFQUE4RTtRQUM5RSw4RUFBOEU7UUFDOUUsMkVBQTJFO1FBQzNFLE1BQU0sWUFBWSxHQUFHLDBCQUEwQixDQUFDO1FBQ2hELElBQUksMEJBQTBCLEVBQUUsQ0FBQztZQUNoQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUNyQyxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDN0MsTUFBTSxjQUFjLEdBQUcsb0JBQW9CLENBQUMsV0FBVyxDQUFDLDRCQUE0QixJQUFJLDBCQUEwQixFQUFFLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO2dCQUV0SixJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUNwQixjQUFjLENBQUMsSUFBSSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUM7b0JBQ3RDLGNBQWMsQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQztvQkFFeEMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUMxQyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUM1RSxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO2FBQU0sQ0FBQztZQUNQLG1CQUFtQixDQUFDLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0csQ0FBQztRQUVELGlEQUFpRDtRQUNqRCxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVuRSxNQUFNLFNBQVMsR0FBRyxJQUFJLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLHFCQUFxQixDQUFDLENBQUMsQ0FBQztRQUM1TSxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSwyQkFBMkIsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBRXBLLE9BQU8sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFFTyxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQStCLEVBQUUsZUFBb0IsRUFBRSxxQkFBNkM7UUFDOUgsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDbkQsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdDLElBQUksYUFBYSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixDQUFDLEVBQUUsQ0FBQztnQkFDdkUsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFLRCxZQUFZLEVBQVUsRUFBVSxLQUFhLEVBQUUsT0FBaUMsRUFBRSxTQUFrQixFQUFFLGFBQXlCLEVBQVUsV0FBb0IsRUFBRSxnQkFBdUM7UUFDck0sS0FBSyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFEakUsVUFBSyxHQUFMLEtBQUssQ0FBUTtRQUE0RixnQkFBVyxHQUFYLFdBQVcsQ0FBUztRQUg1SSxzQkFBaUIsR0FBNkIsRUFBRSxDQUFDO1FBS2pFLElBQUksQ0FBQyxVQUFVLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxDQUF5QixnQkFBZ0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVsRyw0Q0FBNEM7UUFDNUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN4QixJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDekMsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsSUFBSSxJQUFJO1FBQ1AsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ25CLENBQUM7SUFFRCxJQUFJLFVBQVU7UUFDYixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekIsQ0FBQztJQUVELElBQUksZ0JBQWdCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsa0JBQWtCLENBQUMsR0FBUSxFQUFFLGFBQXVCO1FBQ25ELElBQUksYUFBYSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDL0MseURBQXlEO1lBQ3pELEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDcEIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELHNCQUFzQixDQUFDLEdBQVE7UUFDOUIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNqQyxDQUFDO0NBQ0Q7QUFFTSxJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFnQjtJQStCNUIsWUFDcUIsVUFBOEIsRUFDekIsUUFBaUMsRUFDbEMscUJBQTZDLEVBQ3hELFVBQXVCLEVBQ1oscUJBQTZDO1FBaENyRCwwQkFBcUIsR0FBRyxJQUFJLE9BQU8sRUFBc0MsQ0FBQztRQUNsRix5QkFBb0IsR0FBOEMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQztRQUUzRiw4QkFBeUIsR0FBRyxJQUFJLE9BQU8sRUFBUSxDQUFDO1FBQ3hELDZCQUF3QixHQUFnQixJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxDQUFDO1FBRXJFLHdDQUFtQyxHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFDbEUsdUNBQWtDLEdBQWdCLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxLQUFLLENBQUM7UUFjekYsMkJBQXNCLEdBQXVDLEVBQUUsQ0FBQztRQUV6RSxhQUFRLEdBQVksS0FBSyxDQUFDO1FBRWpCLGtDQUE2QixHQUFHLElBQUksR0FBRyxFQUE4QyxDQUFDO1FBOG1Cdkcsd0JBQXdCO1FBRWhCLHdCQUFtQixHQUFHLENBQUMsQ0FBQztRQXNFZiwwQ0FBcUMsR0FBRyxJQUFJLFlBQVksRUFBNkMsQ0FBQztRQStCdkgsaUNBQWlDO1FBRWhCLDJCQUFzQixHQUFHLElBQUksR0FBRyxFQUF1QyxDQUFDO1FBOXNCeEYsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7UUFDOUIsSUFBSSxDQUFDLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDO1FBQ3BELElBQUksQ0FBQyxzQkFBc0IsR0FBRyxxQkFBcUIsQ0FBQztRQUNwRCxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUN4QyxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7UUFFOUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ25FLElBQUksQ0FBQyxlQUFlLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUNqRixNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksb0JBQW9CLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ3RQLENBQUM7SUFFRCxvQkFBb0IsQ0FBQyxJQUEyQixFQUFFLE9BQWdCO1FBQ2pFLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxxQkFBcUI7UUFDcEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzdCLENBQUM7SUFFRCxvQkFBb0I7SUFFcEIsSUFBSSxTQUFTO1FBQ1osT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7SUFDOUIsQ0FBQztJQUVELElBQUksSUFBSTtRQUNQLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDdkUsQ0FBQztJQUVELElBQUksYUFBYTtRQUNoQixJQUFJLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzNCLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUN6QyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDdEMsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsMENBQTBDO2dCQUN4SixDQUFDO2dCQUVELE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDLCtDQUErQztZQUM1RixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxJQUFZLGdCQUFnQjtRQUMzQixPQUFPLElBQUksQ0FBQyxxQkFBcUIsSUFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUM7SUFDL0QsQ0FBQztJQUVELG1CQUFtQjtRQUNsQixJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDNUIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsS0FBSyxDQUFDLG9CQUFvQjtRQUN6QixNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzVCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVELHNCQUFzQixDQUFDLFNBQWdDLEVBQUUsS0FBYSxFQUFFLFdBQW1CLEVBQUUsR0FBRyxxQkFBMkQ7UUFDMUosTUFBTSxzQ0FBc0MsR0FBeUMsRUFBRSxDQUFDO1FBQ3hGLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxFQUFFLENBQUM7WUFDMUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxFQUFFO2dCQUMzQyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsc0NBQXNDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsV0FBVyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ3pKLHNDQUFzQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsRUFBRSxXQUFXLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxXQUFXLENBQUMsSUFBSSxJQUFJLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3ZJLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNsQyxPQUFPLEtBQUssQ0FBQyxDQUFDLDBEQUEwRDtRQUN6RSxDQUFDO1FBRUQsSUFBSSxDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxRQUFRLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDcEUsT0FBTyxLQUFLLENBQUMsQ0FBQyxtQkFBbUI7UUFDbEMsQ0FBQztRQUVELElBQUksV0FBVyxLQUFLLENBQUMsSUFBSSxzQ0FBc0MsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDOUUsT0FBTyxLQUFLLENBQUMsQ0FBQywyQkFBMkI7UUFDMUMsQ0FBQztRQUVELE1BQU0sdUJBQXVCLEdBQTZCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDOUgsSUFBSSxLQUFLLEdBQUcsV0FBVyxHQUFHLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzFELE9BQU8sS0FBSyxDQUFDLENBQUMsa0NBQWtDO1FBQ2pELENBQUM7UUFFRCwrRUFBK0U7UUFDL0UsTUFBTSxtQkFBbUIsR0FBRyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0QsbUJBQW1CLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsR0FBRyxzQ0FBc0MsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssRUFBRSxTQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV0TSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsbUJBQW1CLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDckQsTUFBTSxNQUFNLEdBQUcsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEMsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLEtBQUssQ0FBQyxJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUM5SSxPQUFPLEtBQUssQ0FBQyxDQUFDLDRDQUE0QztZQUMzRCxDQUFDO1FBQ0YsQ0FBQztRQUVELG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxZQUFZO1FBQ3hFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixFQUFFLG1CQUFtQixFQUFFLDBDQUEwQyxFQUFFLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3hKLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNoRCxPQUFPLEtBQUssQ0FBQyxDQUFDLDJCQUEyQjtRQUMxQyxDQUFDO1FBRUQsdUJBQXVCO1FBQ3ZCLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pCLE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQyxXQUFXLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQztZQUN4RCxJQUFJLENBQUMsTUFBTSxDQUFDLHVCQUF1QixDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLHNDQUFzQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRTtnQkFFaEksd0VBQXdFO2dCQUN4RSwyRUFBMkU7Z0JBQzNFLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxTQUFTLENBQUM7Z0JBRXZDLHFCQUFxQjtnQkFDckIsTUFBTSxPQUFPLEdBQTZCLEVBQUUsTUFBTSxFQUFFLEVBQUUsVUFBVSxFQUFFLFNBQVMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxXQUFXLElBQUksU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQzNJLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLGFBQWEsRUFBRSx5REFBeUQsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQy9LLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELHlCQUF5QjtRQUN6QixJQUFJLENBQUMsc0JBQXNCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUVqRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxHQUFlLEVBQUUsYUFBdUI7UUFDMUQsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzVCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxHQUFlLEVBQUUsYUFBdUI7UUFDakUsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUM1QixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFFRCxLQUFLLENBQUMsc0JBQXNCLENBQUMsR0FBZTtRQUMzQyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzVCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRUQsT0FBTztRQUVOLDZDQUE2QztRQUM3QyxnREFBZ0Q7UUFDaEQsZ0NBQWdDO1FBQ2hDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUM1QixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztRQUMxQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDMUIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELDZDQUE2QztRQUM3QyxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO0lBQzlCLENBQUM7SUFFRCxlQUFlLENBQUMsU0FBOEIsRUFBRSxnQkFBMEI7UUFFekUsSUFBSSxRQUF5QixDQUFDO1FBQzlCLElBQUksSUFBSSxHQUFXLEVBQUUsQ0FBQztRQUN0QixJQUFJLE9BQU8sU0FBUyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ25DLFFBQVEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQy9CLElBQUksR0FBRyxTQUFTLENBQUM7UUFDbEIsQ0FBQzthQUFNLElBQUksT0FBTyxTQUFTLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDN0MsUUFBUSxHQUFHLFNBQVMsQ0FBQztZQUNyQixJQUFJLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUNyQyxRQUFRLEVBQ1IsSUFBSSxDQUNKLENBQUM7UUFFRixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxJQUFJLE9BQU8sZ0JBQWdCLEtBQUssV0FBVyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3RFLGdCQUFnQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUM3RCxDQUFDO1FBRUQsSUFBSSxNQUFNLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDaEQsSUFBSSxnQkFBZ0IsSUFBSSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDckMsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLEVBQUUsQ0FBQztRQUNyQyxDQUFDO1FBQ0QsT0FBTyxNQUFPLENBQUM7SUFDaEIsQ0FBQztJQUVPLHNCQUFzQixDQUFDLE9BQWlDO1FBRS9ELGtGQUFrRjtRQUNsRixnRUFBZ0U7UUFDaEUsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUMzQixJQUFJLENBQUMscUJBQXFCLEdBQUcsb0JBQW9CLENBQUMsa0JBQWtCLENBQUM7Z0JBQ3BFLEVBQUUsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsRUFBRTtnQkFDNUIsSUFBSSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJO2dCQUNoQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWE7Z0JBQ2xELE9BQU87Z0JBQ1AsVUFBVSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO2FBQzVDLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxTQUFTLElBQUksU0FBUyxDQUFDO1FBQzFGLENBQUM7SUFDRixDQUFDO0lBRUQsb0JBQW9CLENBQUMsSUFBMkI7UUFFL0MsTUFBTSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEdBQUcsb0JBQW9CLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMscUJBQXFCLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFFdkssNkVBQTZFO1FBQzdFLHlCQUF5QjtRQUN6QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsU0FBUyxJQUFJLFNBQVMsQ0FBQztRQUNsRCxJQUFJLENBQUMscUJBQXFCLEdBQUcsU0FBUyxDQUFDO1FBRXZDLFNBQVM7UUFDVCxJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7WUFDN0MsS0FBSztZQUNMLE9BQU87U0FDUCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxpQkFBaUI7SUFFakI7O09BRUc7SUFDSCxTQUFTLENBQUMsT0FBdUMsRUFBRSxPQUE4QyxFQUFFLFVBQThCLEVBQUUsV0FBZ0MsRUFBRSxRQUFrQyxpQkFBaUIsQ0FBQyxJQUFJO1FBQzVOLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLHNEQUFzRCxXQUFXLENBQUMsS0FBSyx5QkFBeUIsQ0FBQyxDQUFDO1FBRXpILElBQUksYUFBYSxHQUFXLEVBQUUsQ0FBQztRQUMvQixJQUFJLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDM0IsSUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDdEIsZUFBZSxHQUFHLEtBQUssQ0FBQztRQUN6QixDQUFDO2FBQU0sSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDbEMsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDakMsYUFBYSxHQUFHLE9BQU8sQ0FBQztZQUN6QixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsYUFBYSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUM7WUFDakMsQ0FBQztRQUNGLENBQUM7UUFFRCw4Q0FBOEM7UUFDOUMsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUU7WUFDL0QsT0FBTyxFQUFFLENBQUMsYUFBYSxDQUFDO1lBQ3hCLFVBQVU7WUFDVixrQkFBa0IsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMscUJBQXFCLENBQUMsSUFBSTtZQUNyRyxjQUFjLEVBQUU7Z0JBQ2YsS0FBSyxFQUFFLEtBQUs7YUFDWjtTQUNELEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDWCxDQUFDO0lBR0QsVUFBVSxDQUFDLFlBQTJDLEVBQ3JELFVBQW9DLEVBQUUsRUFDdEMsV0FBZ0MsRUFDaEMsUUFBa0MsaUJBQWlCLENBQUMsSUFBSTtRQUN4RCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQywwREFBMEQsV0FBVyxDQUFDLEtBQUssNkJBQTZCLENBQUMsQ0FBQztRQUNqSSxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDM0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxjQUFjO0lBQzNCLHFHQUFxRztJQUNyRyx3R0FBd0c7SUFDeEcsS0FBc0ssRUFDdEssT0FBaUMsRUFDakMsS0FBK0I7UUFFL0IsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUNuQyxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUVELE1BQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUN2RixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7WUFDdkMsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBQ2xFLE1BQU0sSUFBSSxLQUFLLENBQUMsaUNBQWlDLElBQUksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkYsQ0FBQztRQUVELE1BQU0sWUFBWSxHQUE2QyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUU7WUFFbEcsTUFBTSxlQUFlLEdBQUcsNEJBQTRCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRXRFLE1BQU0sV0FBVyxHQUE2QjtnQkFDN0MsY0FBYyxFQUFFLE9BQU8sT0FBTyxDQUFDLGNBQWMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDakcsb0JBQW9CLEVBQUUsT0FBTyxPQUFPLENBQUMsY0FBYyxFQUFFLEtBQUssS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQ3BILDBCQUEwQixFQUFFLE9BQU8sT0FBTyxDQUFDLGNBQWMsRUFBRSxNQUFNLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTO2dCQUM1SCwwQkFBMEIsRUFBRSxPQUFPLE9BQU8sQ0FBQyxjQUFjLEVBQUUsTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDNUgsd0JBQXdCLEVBQUUsT0FBTyxDQUFDLGtCQUFrQixLQUFLLFNBQVMsSUFBSSxPQUFPLENBQUMsa0JBQWtCLEtBQUsscUJBQXFCLENBQUMsSUFBSTtnQkFDL0gsOEJBQThCLEVBQUUsT0FBTyxDQUFDLGtCQUFrQixLQUFLLFNBQVMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsS0FBSyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQztnQkFDeEosVUFBVSxFQUFFLE9BQU8sQ0FBQyxVQUFVO2dCQUM5QixjQUFjLEVBQUUsZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDeEUsY0FBYyxFQUFFLE9BQU8sQ0FBQyxlQUFlO2dCQUN2QyxPQUFPLEVBQUUsaUJBQWlCO2dCQUMxQixnQkFBZ0IsRUFBRSxLQUFLLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJO2FBQzdELENBQUM7WUFFRixNQUFNLFlBQVksR0FBRyx5QkFBeUIsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDOUUsTUFBTSxXQUFXLEdBQUcsWUFBWSxFQUFFLE1BQU0sQ0FBQztZQUN6QyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQzlCLFdBQVcsQ0FBQyxjQUFjLEdBQUcsWUFBWSxFQUFFLE9BQU8sQ0FBQztZQUNwRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsV0FBVyxDQUFDLFdBQVcsR0FBRyxZQUFZLEVBQUUsT0FBTyxDQUFDO1lBQ2pELENBQUM7WUFFRCxPQUFPO2dCQUNOLE1BQU0sRUFBRSxXQUFXO2dCQUNuQixPQUFPLEVBQUUsV0FBVzthQUNwQixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFTyxLQUFLLENBQUMsY0FBYyxDQUMzQixZQUFrRSxFQUNsRSxLQUF3QjtRQUV4QixNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQ3hGLE1BQU0sQ0FBQyxNQUFNLElBQUksSUFBSSxFQUNyQixNQUFNLENBQUMsT0FBTyxFQUNkLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUM1RSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRVQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRWpDLGlDQUFpQztRQUNqQyxNQUFNLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxFQUFzQixDQUFDO1FBRTdDLEtBQUssTUFBTSxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7WUFDOUIsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3pDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RCLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3RCLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxLQUE4QixFQUFFLE9BQW1ELEVBQUUsV0FBZ0MsRUFBRSxRQUFrQyxpQkFBaUIsQ0FBQyxJQUFJO1FBQy9MLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLDZEQUE2RCxXQUFXLENBQUMsS0FBSyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBR3ZJLE1BQU0sVUFBVSxHQUFHLENBQUMsT0FBdUMsRUFBMEMsRUFBRTtZQUN0RyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsT0FBTztvQkFDTixNQUFNLEVBQUUsU0FBUztvQkFDakIsT0FBTyxFQUFFLEVBQUU7aUJBQ1gsQ0FBQztZQUNILENBQUM7WUFDRCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBRWpHLE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBRXBHLE9BQU87Z0JBQ04sT0FBTyxFQUFFO29CQUVSLGNBQWMsRUFBRSxPQUFPLE9BQU8sQ0FBQyxjQUFjLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLFNBQVM7b0JBQ2pHLG9CQUFvQixFQUFFLE9BQU8sT0FBTyxDQUFDLGNBQWMsRUFBRSxLQUFLLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTO29CQUNySCwwQkFBMEIsRUFBRSxPQUFPLE9BQU8sQ0FBQyxjQUFjLEVBQUUsTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUztvQkFDN0gsMEJBQTBCLEVBQUUsT0FBTyxPQUFPLENBQUMsY0FBYyxFQUFFLE1BQU0sS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVM7b0JBQzdILHdCQUF3QixFQUFFLE9BQU8sQ0FBQyxrQkFBa0IsS0FBSyxTQUFTLElBQUksT0FBTyxDQUFDLGtCQUFrQixLQUFLLHFCQUFxQixDQUFDLElBQUk7b0JBQy9ILDhCQUE4QixFQUFFLE9BQU8sQ0FBQyxrQkFBa0IsS0FBSyxTQUFTLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEtBQUsscUJBQXFCLENBQUMscUJBQXFCLENBQUM7b0JBQ3hKLFlBQVksRUFBRSxPQUFPLENBQUMsUUFBUTtvQkFDOUIsVUFBVSxFQUFFLE9BQU8sQ0FBQyxVQUFVO29CQUM5QixjQUFjLEVBQUUsT0FBTyxDQUFDLGVBQWU7b0JBQ3ZDLGNBQWMsRUFBRSxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQzt3QkFDeEMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxjQUFjLEVBQUUsYUFBYSxJQUFJLEdBQUc7d0JBQ3hELFlBQVksRUFBRSxPQUFPLENBQUMsY0FBYyxFQUFFLFlBQVksSUFBSSxLQUFLO3FCQUMzRCxDQUFDLENBQUMsQ0FBQyxTQUFTO29CQUNiLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxrQkFBa0I7b0JBRTlDLGNBQWMsRUFBRSxhQUFhLEVBQUUsT0FBTztvQkFDdEMsY0FBYyxFQUFFLGVBQWU7aUJBQ0k7Z0JBQ3BDLE1BQU0sRUFBRSxhQUFhLEVBQUUsTUFBTTthQUNvQixDQUFDO1FBQ3BELENBQUMsQ0FBQztRQUVGLE1BQU0sZUFBZSxHQUEyRCxDQUFDLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUNuSCxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUVuRCxNQUFNLFlBQVksR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxFQUFzRCxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTFILE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsTUFBTSxlQUFlLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBZ0QsQ0FBQyxDQUFDO1FBQ3JHLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FDeEMsS0FBSyxFQUNMLFlBQVksRUFDWixDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFDdEQsS0FBSyxDQUNMLENBQUM7UUFDRixNQUFNLGFBQWEsR0FBRyxJQUFJLHFCQUFxQixDQUEyQixLQUFLLEVBQUMsT0FBTyxFQUFDLEVBQUU7WUFDekYsV0FBVyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUN6QyxNQUFNLE1BQU0sR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO2dCQUN4QixNQUFNLEdBQUcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO2dCQUNsQixJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO29CQUMzQixPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksZ0JBQWdCLENBQ25DLEdBQUcsRUFDSCxNQUFNLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQzt3QkFDckMsWUFBWSxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDO3dCQUN2SSxXQUFXLEVBQUUsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7cUJBQ2xJLENBQUMsQ0FBQyxFQUNILE1BQU0sQ0FBQyxXQUFXLENBRWxCLENBQUMsQ0FBQztnQkFDSixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLGtCQUFrQixDQUNyQyxHQUFHLEVBQ0gsTUFBTSxDQUFDLElBQUksRUFDWCxNQUFNLENBQUMsVUFBVSxDQUNqQixDQUFDLENBQUM7Z0JBRUosQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDSixNQUFNLFFBQVEsQ0FBQztRQUNoQixDQUFDLENBQUMsQ0FBQztRQUVILE9BQU87WUFDTixPQUFPLEVBQUUsYUFBYTtZQUN0QixRQUFRLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO2dCQUM3QixXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3RCLE9BQU87b0JBQ04sUUFBUSxFQUFFLENBQUMsRUFBRSxRQUFRLElBQUksS0FBSztpQkFDOUIsQ0FBQztZQUNILENBQUMsQ0FBQztTQUNGLENBQUM7SUFDSCxDQUFDO0lBR0QsS0FBSyxDQUFDLG1CQUFtQixDQUFDLEtBQTZCLEVBQUUsWUFBa0UsRUFBRSxRQUE0RCxFQUFFLFFBQWtDLGlCQUFpQixDQUFDLElBQUk7UUFDbFAsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRXBELElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQztRQUN2QixLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDakMsVUFBVSxHQUFHLElBQUksQ0FBQztRQUNuQixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtZQUM1QyxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNoQixPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ25DLENBQUMsQ0FBQyxPQUFRLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO2dCQUM5QixNQUFNLE1BQU0sR0FBMkIsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN6RCxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3ZCLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDO1FBRUYsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUNuQyxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSixNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQ3hGLEtBQUssRUFDTCxNQUFNLENBQUMsTUFBTSxJQUFJLElBQUksRUFDckIsTUFBTSxDQUFDLE9BQU8sRUFDZCxTQUFTLEVBQ1QsS0FBSyxDQUFDLElBQUksRUFBRSxDQUNaLElBQUksRUFBRSxDQUFDLENBQUM7WUFDVCxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM5QyxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7Z0JBQ2pDLE9BQU87b0JBQ04sUUFBUSxFQUFFLEdBQUcsRUFBRSxRQUFRLElBQUksQ0FBQyxHQUFHLEVBQUUsUUFBUSxJQUFJLEtBQUssQ0FBQztvQkFDbkQsT0FBTyxFQUFFLENBQUMsR0FBRyxFQUFFLE9BQU8sSUFBSSxFQUFFLEVBQUUsR0FBRyxFQUFFLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUU7aUJBQ3hELENBQUM7WUFDSCxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUM7UUFFL0IsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDZCxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM5QyxNQUFNLEdBQUcsQ0FBQztRQUNYLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLGVBQWUsQ0FBQyxLQUE2QixFQUFFLE9BQXVFLEVBQUUsUUFBbUQsRUFBRSxXQUFnQyxFQUFFLFFBQWtDLGlCQUFpQixDQUFDLElBQUk7UUFDNVEsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsNERBQTRELFdBQVcsQ0FBQyxLQUFLLCtCQUErQixDQUFDLENBQUM7UUFFckksTUFBTSxjQUFjLEdBQW9DLE9BQU8sT0FBTyxDQUFDLGNBQWMsS0FBSyxXQUFXLENBQUMsQ0FBQztZQUN0RztnQkFDQyxVQUFVLEVBQUUsR0FBRztnQkFDZixZQUFZLEVBQUUsS0FBSzthQUNuQixDQUFDLENBQUM7WUFDSCxPQUFPLENBQUMsY0FBYyxDQUFDO1FBRXhCLE1BQU0sYUFBYSxHQUFHLHlCQUF5QixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFFbkYsTUFBTSxjQUFjLEdBQUcsQ0FBQyxPQUFPLE9BQU8sQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMvRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ3ZELE1BQU0sWUFBWSxHQUE2QjtZQUM5QyxjQUFjLEVBQUUsT0FBTyxPQUFPLENBQUMsY0FBYyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ2pHLG9CQUFvQixFQUFFLE9BQU8sT0FBTyxDQUFDLGNBQWMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUN2RywwQkFBMEIsRUFBRSxPQUFPLE9BQU8sQ0FBQyxvQkFBb0IsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ3pILDBCQUEwQixFQUFFLE9BQU8sT0FBTyxDQUFDLG9CQUFvQixLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDekgsd0JBQXdCLEVBQUUsT0FBTyxPQUFPLENBQUMsa0JBQWtCLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsSUFBSTtZQUM5Ryw4QkFBOEIsRUFBRSxPQUFPLE9BQU8sQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJO1lBQ2hILFlBQVksRUFBRSxPQUFPLENBQUMsUUFBUTtZQUM5QixVQUFVLEVBQUUsT0FBTyxDQUFDLFVBQVU7WUFDOUIsY0FBYztZQUNkLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxZQUFZLEVBQUUsK0RBQStEO1lBRXpHLGNBQWMsRUFBRSxhQUFhLEVBQUUsT0FBTztZQUN0QyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7U0FDMUUsQ0FBQztRQUVGLE1BQU0sUUFBUSxHQUFHLENBQUMsTUFBOEIsRUFBRSxHQUFRLEVBQUUsRUFBRTtZQUM3RCxJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUMzQixRQUFRLENBQUM7b0JBQ1IsR0FBRztvQkFDSCxPQUFPLEVBQUU7d0JBQ1IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxXQUFXO3dCQUN4QixPQUFPLEVBQUUsYUFBYSxDQUNyQixNQUFNLENBQUMsY0FBYyxFQUNyQixDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7cUJBQ2hIO29CQUNELE1BQU0sRUFBRSxhQUFhLENBQ3BCLE1BQU0sQ0FBQyxjQUFjLEVBQ3JCLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztpQkFDM0UsQ0FBQyxDQUFDO1lBQ3JDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxRQUFRLENBQUM7b0JBQ1IsR0FBRztvQkFDSCxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUk7b0JBQ2pCLFVBQVUsRUFBRSxNQUFNLENBQUMsVUFBVTtpQkFDTSxDQUFDLENBQUM7WUFDdkMsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUVGLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3JILENBQUM7SUFFRCx1QkFBdUIsQ0FBQyxNQUFzQixFQUFFLFNBQWlCO1FBQ2hFLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQVE7UUFDbEIsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUUvRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBUTtRQUNwQixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRTlELE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBRUQsT0FBTyxDQUFDLGVBQXlCO1FBQ2hDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELFlBQVksQ0FBQyxHQUFXO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVELG1CQUFtQixDQUFDLFFBQWtCO1FBQ3JDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQsMkJBQTJCLENBQUMsR0FBVztRQUN0QyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUVELGdCQUFnQjtRQUNmLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQ3hDLENBQUM7SUFFRCxnQkFBZ0I7SUFFaEIsSUFBSSxPQUFPO1FBQ1YsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxvQkFBb0IsQ0FBQyxPQUEyQztRQUMvRCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVELHFCQUFxQixDQUFDLE9BQTZDO1FBQ2xFLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQseUJBQXlCO1FBQ3hCLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDckIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3ZDLENBQUM7SUFDRixDQUFDO0lBRUQsbUNBQW1DO1FBQ2xDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNqRCxDQUFDO0lBRUQsaUJBQWlCLENBQUMsUUFBb0I7UUFDckMsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFNRCxxQkFBcUI7SUFDckIsbUNBQW1DLENBQUMsTUFBYyxFQUFFLFFBQTRDO1FBQy9GLElBQUksSUFBSSxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3BELE1BQU0sSUFBSSxLQUFLLENBQUMscURBQXFELE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDaEYsQ0FBQztRQUVELElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuRixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUMxQyxJQUFJLENBQUMsTUFBTSxDQUFDLG9DQUFvQyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQztRQUV6RSxPQUFPLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDeEIsSUFBSSxDQUFDLDZCQUE2QixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsRCxJQUFJLENBQUMsTUFBTSxDQUFDLHNDQUFzQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELHdCQUF3QjtJQUN4QixLQUFLLENBQUMseUJBQXlCLENBQUMsZUFBOEIsRUFBRSxpQkFBb0M7UUFDbkcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMscURBQXFELEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDOUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxDQUFDLENBQUM7WUFDNUQsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTFGLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMzRSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLGVBQWUsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0YsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLDBCQUEwQixDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3BGLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzdFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxLQUFLLENBQUMsZ0NBQWdDLENBQUMsZUFBOEIsRUFBRSxTQUFpQixFQUFFLFNBQWlCLEVBQUUsaUJBQW9DO1FBQ2hKLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQzlGLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1lBQzVELE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywwREFBMEQsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUUxRixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxlQUFlLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNGLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUN6RyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywwREFBMEQsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMxRixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBSUQsdUNBQXVDLENBQUMsU0FBZ0M7UUFDdkUsT0FBTyxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLEVBQUU7WUFDekMsTUFBTSxlQUFlLEdBQWtFLFNBQVMsT0FBTyxDQUFDLENBQUMsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxSSxlQUFlLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztZQUN0QyxPQUFPLElBQUksQ0FBQyxxQ0FBcUMsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNsRyxDQUFDLENBQUM7SUFDSCxDQUFDO0lBRUQsaURBQWlEO0lBQ2pELEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxlQUE4QixFQUFFLEtBQXdCLEVBQUUsT0FBZTtRQUMvRyxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFFOUUsSUFBSSxNQUFNLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFFRCxNQUFNLElBQUksQ0FBQyxxQ0FBcUMsQ0FBQyxTQUFTLENBQUMsRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQzdJLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN2QixNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDaEMsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsR0FBRyxHQUFHLE9BQU8sRUFBRSxDQUFDO2dCQUNoQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxzQ0FBc0MsRUFBa0UsUUFBUyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMvSixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1lBQ25DLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7SUFDRixDQUFDO0lBTUQscUJBQXFCO0lBQ3JCLDRCQUE0QixDQUFDLE1BQWMsRUFBRSxRQUFxQztRQUNqRixJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUM3QyxNQUFNLElBQUksS0FBSyxDQUFDLHFEQUFxRCxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ2hGLENBQUM7UUFFRCxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNsRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsdUJBQXVCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyw2QkFBNkIsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFFbEUsT0FBTyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ3hCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDM0MsSUFBSSxDQUFDLE1BQU0sQ0FBQywrQkFBK0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsR0FBUSxFQUFFLE9BQTBDLEVBQUUsaUJBQW9DO1FBQ25ILE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDakcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVELHdCQUF3QjtJQUN4QixLQUFLLENBQUMsb0JBQW9CLENBQUMsR0FBa0IsRUFBRSxZQUFvQixFQUFFLGlCQUFvQztRQUN4RyxPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsWUFBWSxFQUFFLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUN2RixDQUFDO0lBRUQsb0JBQW9CO0lBRXBCLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBbUIsRUFBRSxJQUE4QztRQUMvRSxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4RCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTlELE1BQU0sTUFBTSxHQUFHLENBQUMsTUFBTSxjQUFjLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRTtZQUM1RSxHQUFHLE9BQU87WUFDVixjQUFjLEVBQUUsSUFBSTtZQUNwQixpQkFBaUIsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFO2dCQUNyQyxJQUFJLGdCQUFnQixLQUFLLElBQUksSUFBSSxnQkFBZ0IsS0FBSyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztvQkFDakYsK0NBQStDO29CQUMvQywrQ0FBK0M7b0JBQy9DLDRCQUE0QjtvQkFDNUIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dCQUNuRCxDQUFDO2dCQUVELE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDM0UsQ0FBQztTQUNELENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUVYLE9BQU8sYUFBYSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFlLEVBQUUsSUFBOEM7UUFDM0UsTUFBTSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0QsTUFBTSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRTlFLCtDQUErQztRQUMvQyxJQUFJLFFBQVEsS0FBSyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNsQyxPQUFPLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQzVDLENBQUM7UUFFRCxvQ0FBb0M7UUFDcEMsTUFBTSxHQUFHLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3BGLE9BQU8sZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ3JDLENBQUM7SUFFTyx3QkFBd0IsQ0FBQyxJQUE4QztRQUM5RSxNQUFNLEdBQUcsR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDOUQsTUFBTSxRQUFRLEdBQUcsT0FBTyxJQUFJLEVBQUUsUUFBUSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBRWhGLE9BQU8sQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNuRCxDQUFDO0NBQ0QsQ0FBQTtBQXQwQlksZ0JBQWdCO0lBZ0MxQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsdUJBQXVCLENBQUE7SUFDdkIsV0FBQSxzQkFBc0IsQ0FBQTtJQUN0QixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEsc0JBQXNCLENBQUE7R0FwQ1osZ0JBQWdCLENBczBCNUI7O0FBRUQsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsZUFBZSxDQUFvQixtQkFBbUIsQ0FBQyxDQUFDO0FBR3pGLFNBQVMseUJBQXlCLENBQUMsT0FBd0Q7SUFDMUYsSUFBSSxPQUEyQixDQUFDO0lBQ2hDLElBQUksYUFBOEIsQ0FBQztJQUNuQyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ2IsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNqQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ25CLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUM7WUFDMUIsYUFBYSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFFRCxPQUFPO1lBQ04sT0FBTztZQUNQLE1BQU0sRUFBRSxhQUFhO1NBQ3JCLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQztBQU9ELFNBQVMsNEJBQTRCLENBQUMsUUFBMEM7SUFDL0UsT0FBTyxDQUNOLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQyxPQUFPLEVBQTBDLEVBQUU7UUFDakUsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNqQyxJQUFJLE9BQU8sS0FBSyxFQUFFLEVBQUUsQ0FBQztnQkFDcEIsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztZQUNELE9BQU87Z0JBQ04sT0FBTyxFQUFFLE9BQU87Z0JBQ2hCLEdBQUcsRUFBRSxTQUFTO2FBQ3VCLENBQUM7UUFDeEMsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLGFBQWEsR0FBRyx5QkFBeUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN6RCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3BCLE9BQU8sU0FBUyxDQUFDO1lBQ2xCLENBQUM7WUFDRCxPQUFPO2dCQUNOLE9BQU8sRUFBRSxhQUFhLENBQUMsT0FBTztnQkFDOUIsR0FBRyxFQUFFLGFBQWEsQ0FBQyxNQUFNO2FBQ1ksQ0FBQztRQUN4QyxDQUFDO0lBQ0YsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUNSLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFtQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3ZELENBQUMifQ==