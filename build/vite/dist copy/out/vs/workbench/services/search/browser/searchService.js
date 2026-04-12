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
import { IModelService } from '../../../../editor/common/services/model.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ISearchService, TextSearchCompleteMessageType } from '../common/search.js';
import { SearchService } from '../common/searchService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { logOnceWebWorkerWarning } from '../../../../base/common/worker/webWorker.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { WebWorkerDescriptor } from '../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { LocalFileSearchWorkerHost } from '../common/localFileSearchWorkerTypes.js';
import { memoize } from '../../../../base/common/decorators.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { WebFileSystemAccess } from '../../../../platform/files/browser/webFileSystemAccess.js';
import { revive } from '../../../../base/common/marshalling.js';
let RemoteSearchService = class RemoteSearchService extends SearchService {
    constructor(modelService, editorService, telemetryService, logService, extensionService, fileService, instantiationService, uriIdentityService) {
        super(modelService, editorService, telemetryService, logService, extensionService, fileService, uriIdentityService);
        this.instantiationService = instantiationService;
        const searchProvider = this.instantiationService.createInstance(LocalFileSearchWorkerClient);
        this.registerSearchResultProvider(Schemas.file, 0 /* SearchProviderType.file */, searchProvider);
        this.registerSearchResultProvider(Schemas.file, 1 /* SearchProviderType.text */, searchProvider);
    }
};
RemoteSearchService = __decorate([
    __param(0, IModelService),
    __param(1, IEditorService),
    __param(2, ITelemetryService),
    __param(3, ILogService),
    __param(4, IExtensionService),
    __param(5, IFileService),
    __param(6, IInstantiationService),
    __param(7, IUriIdentityService)
], RemoteSearchService);
export { RemoteSearchService };
let LocalFileSearchWorkerClient = class LocalFileSearchWorkerClient extends Disposable {
    constructor(fileService, uriIdentityService, webWorkerService) {
        super();
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
        this.webWorkerService = webWorkerService;
        this._onDidReceiveTextSearchMatch = this._register(new Emitter());
        this.onDidReceiveTextSearchMatch = this._onDidReceiveTextSearchMatch.event;
        this.queryId = 0;
        this._worker = null;
    }
    async getAIName() {
        return undefined;
    }
    sendTextSearchMatch(match, queryId) {
        this._onDidReceiveTextSearchMatch.fire({ match, queryId });
    }
    get fileSystemProvider() {
        return this.fileService.getProvider(Schemas.file);
    }
    async cancelQuery(queryId) {
        const proxy = this._getOrCreateWorker().proxy;
        proxy.$cancelQuery(queryId);
    }
    async textSearch(query, onProgress, token) {
        try {
            const queryDisposables = new DisposableStore();
            const proxy = this._getOrCreateWorker().proxy;
            const results = [];
            let limitHit = false;
            await Promise.all(query.folderQueries.map(async (fq) => {
                const queryId = this.queryId++;
                queryDisposables.add(token?.onCancellationRequested(e => this.cancelQuery(queryId)) || Disposable.None);
                const handle = await this.fileSystemProvider.getHandle(fq.folder);
                if (!handle || !WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
                    console.error('Could not get directory handle for ', fq);
                    return;
                }
                // force resource to revive using URI.revive.
                // TODO @andrea see why we can't just use `revive()` below. For some reason, (<MarshalledObject>obj).$mid was undefined for result.resource
                const reviveMatch = (result) => ({
                    resource: URI.revive(result.resource),
                    results: revive(result.results)
                });
                queryDisposables.add(this.onDidReceiveTextSearchMatch(e => {
                    if (e.queryId === queryId) {
                        onProgress?.(reviveMatch(e.match));
                    }
                }));
                const ignorePathCasing = this.uriIdentityService.extUri.ignorePathCasing(fq.folder);
                const folderResults = await proxy.$searchDirectory(handle, query, fq, ignorePathCasing, queryId);
                for (const folderResult of folderResults.results) {
                    results.push(revive(folderResult));
                }
                if (folderResults.limitHit) {
                    limitHit = true;
                }
            }));
            queryDisposables.dispose();
            const result = { messages: [], results, limitHit };
            return result;
        }
        catch (e) {
            console.error('Error performing web worker text search', e);
            return {
                results: [],
                messages: [{
                        text: localize('errorSearchText', "Unable to search with Web Worker text searcher"), type: TextSearchCompleteMessageType.Warning
                    }],
            };
        }
    }
    async fileSearch(query, token) {
        try {
            const queryDisposables = new DisposableStore();
            let limitHit = false;
            const proxy = this._getOrCreateWorker().proxy;
            const results = [];
            await Promise.all(query.folderQueries.map(async (fq) => {
                const queryId = this.queryId++;
                queryDisposables.add(token?.onCancellationRequested(e => this.cancelQuery(queryId)) || Disposable.None);
                const handle = await this.fileSystemProvider.getHandle(fq.folder);
                if (!handle || !WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
                    console.error('Could not get directory handle for ', fq);
                    return;
                }
                const caseSensitive = this.uriIdentityService.extUri.ignorePathCasing(fq.folder);
                const folderResults = await proxy.$listDirectory(handle, query, fq, caseSensitive, queryId);
                for (const folderResult of folderResults.results) {
                    results.push({ resource: URI.joinPath(fq.folder, folderResult) });
                }
                if (folderResults.limitHit) {
                    limitHit = true;
                }
            }));
            queryDisposables.dispose();
            const result = { messages: [], results, limitHit };
            return result;
        }
        catch (e) {
            console.error('Error performing web worker file search', e);
            return {
                results: [],
                messages: [{
                        text: localize('errorSearchFile', "Unable to search with Web Worker file searcher"), type: TextSearchCompleteMessageType.Warning
                    }],
            };
        }
    }
    async clearCache(cacheKey) {
        if (this.cache?.key === cacheKey) {
            this.cache = undefined;
        }
    }
    _getOrCreateWorker() {
        if (!this._worker) {
            try {
                this._worker = this._register(this.webWorkerService.createWorkerClient(new WebWorkerDescriptor({
                    esmModuleLocation: FileAccess.asBrowserUri('vs/workbench/services/search/worker/localFileSearchMain.js'),
                    label: 'LocalFileSearchWorker'
                })));
                LocalFileSearchWorkerHost.setChannel(this._worker, {
                    $sendTextSearchMatch: (match, queryId) => {
                        return this.sendTextSearchMatch(match, queryId);
                    }
                });
            }
            catch (err) {
                logOnceWebWorkerWarning(err);
                throw err;
            }
        }
        return this._worker;
    }
};
__decorate([
    memoize
], LocalFileSearchWorkerClient.prototype, "fileSystemProvider", null);
LocalFileSearchWorkerClient = __decorate([
    __param(0, IFileService),
    __param(1, IUriIdentityService),
    __param(2, IWebWorkerService)
], LocalFileSearchWorkerClient);
export { LocalFileSearchWorkerClient };
registerSingleton(ISearchService, RemoteSearchService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvYnJvd3Nlci9zZWFyY2hTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRSxPQUFPLEVBQXVGLGNBQWMsRUFBa0MsNkJBQTZCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUN6TSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDM0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFvQix1QkFBdUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDcEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDL0YsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9H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