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
import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore, dispose } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ISearchService } from '../../services/search/common/search.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { revive } from '../../../base/common/marshalling.js';
import * as Constants from '../../contrib/search/common/constants.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
let MainThreadSearch = class MainThreadSearch {
    constructor(extHostContext, _searchService, _telemetryService, _configurationService, contextKeyService) {
        this._searchService = _searchService;
        this._telemetryService = _telemetryService;
        this.contextKeyService = contextKeyService;
        this._searchProvider = new Map();
        this._aiSearchProviderHandles = new Set();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSearch);
        this._proxy.$enableExtensionHostSearch();
    }
    dispose() {
        this._searchProvider.forEach(value => value.dispose());
        this._searchProvider.clear();
        this._aiSearchProviderHandles.clear();
        Constants.SearchContext.hasAIResultProvider.bindTo(this.contextKeyService).set(false);
    }
    $registerTextSearchProvider(handle, scheme) {
        this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, 1 /* SearchProviderType.text */, scheme, handle, this._proxy));
    }
    $registerAITextSearchProvider(handle, scheme) {
        Constants.SearchContext.hasAIResultProvider.bindTo(this.contextKeyService).set(true);
        this._aiSearchProviderHandles.add(handle);
        this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, 2 /* SearchProviderType.aiText */, scheme, handle, this._proxy));
    }
    $registerFileSearchProvider(handle, scheme) {
        this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, 0 /* SearchProviderType.file */, scheme, handle, this._proxy));
    }
    $unregisterProvider(handle) {
        dispose(this._searchProvider.get(handle));
        this._searchProvider.delete(handle);
        if (this._aiSearchProviderHandles.delete(handle) && this._aiSearchProviderHandles.size === 0) {
            Constants.SearchContext.hasAIResultProvider.bindTo(this.contextKeyService).set(false);
        }
    }
    $handleFileMatch(handle, session, data) {
        const provider = this._searchProvider.get(handle);
        if (!provider) {
            throw new Error('Got result for unknown provider');
        }
        provider.handleFindMatch(session, data);
    }
    $handleTextMatch(handle, session, data) {
        const provider = this._searchProvider.get(handle);
        if (!provider) {
            throw new Error('Got result for unknown provider');
        }
        provider.handleFindMatch(session, data);
    }
    $handleKeywordResult(handle, session, data) {
        const provider = this._searchProvider.get(handle);
        if (!provider) {
            throw new Error('Got result for unknown provider');
        }
        provider.handleKeywordResult(session, data);
    }
    $handleTelemetry(eventName, data) {
        this._telemetryService.publicLog(eventName, data);
    }
};
MainThreadSearch = __decorate([
    extHostNamedCustomer(MainContext.MainThreadSearch),
    __param(1, ISearchService),
    __param(2, ITelemetryService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService)
], MainThreadSearch);
export { MainThreadSearch };
class SearchOperation {
    static { this._idPool = 0; }
    constructor(progress, id = ++SearchOperation._idPool, matches = new Map(), keywords = []) {
        this.progress = progress;
        this.id = id;
        this.matches = matches;
        this.keywords = keywords;
        //
    }
    addMatch(match) {
        const existingMatch = this.matches.get(match.resource.toString());
        if (existingMatch) {
            // TODO@rob clean up text/file result types
            // If a file search returns the same file twice, we would enter this branch.
            // It's possible that could happen, #90813
            if (existingMatch.results && match.results) {
                existingMatch.results.push(...match.results);
            }
        }
        else {
            this.matches.set(match.resource.toString(), match);
        }
        this.progress?.(match);
    }
    addKeyword(result) {
        this.keywords.push(result);
        this.progress?.(result);
    }
}
class RemoteSearchProvider {
    constructor(searchService, type, _scheme, _handle, _proxy) {
        this._scheme = _scheme;
        this._handle = _handle;
        this._proxy = _proxy;
        this._registrations = new DisposableStore();
        this._searches = new Map();
        this._registrations.add(searchService.registerSearchResultProvider(this._scheme, type, this));
    }
    async getAIName() {
        if (this.cachedAIName === undefined) {
            this.cachedAIName = await this._proxy.$getAIName(this._handle);
        }
        return this.cachedAIName;
    }
    dispose() {
        this._registrations.dispose();
    }
    fileSearch(query, token = CancellationToken.None) {
        return this.doSearch(query, undefined, token);
    }
    textSearch(query, onProgress, token = CancellationToken.None) {
        return this.doSearch(query, onProgress, token);
    }
    doSearch(query, onProgress, token = CancellationToken.None) {
        if (!query.folderQueries.length) {
            throw new Error('Empty folderQueries');
        }
        const search = new SearchOperation(onProgress);
        this._searches.set(search.id, search);
        const searchP = this._provideSearchResults(query, search.id, token);
        return Promise.resolve(searchP).then((result) => {
            this._searches.delete(search.id);
            return { results: Array.from(search.matches.values()), aiKeywords: Array.from(search.keywords), stats: result.stats, limitHit: result.limitHit, messages: result.messages };
        }, err => {
            this._searches.delete(search.id);
            return Promise.reject(err);
        });
    }
    clearCache(cacheKey) {
        return Promise.resolve(this._proxy.$clearCache(cacheKey));
    }
    handleFindMatch(session, dataOrUri) {
        const searchOp = this._searches.get(session);
        if (!searchOp) {
            // ignore...
            return;
        }
        dataOrUri.forEach(result => {
            if (result.results) {
                searchOp.addMatch(revive(result));
            }
            else {
                searchOp.addMatch({
                    resource: URI.revive(result)
                });
            }
        });
    }
    handleKeywordResult(session, data) {
        const searchOp = this._searches.get(session);
        if (!searchOp) {
            // ignore...
            return;
        }
        searchOp.addKeyword(data);
    }
    _provideSearchResults(query, session, token) {
        switch (query.type) {
            case 1 /* QueryType.File */:
                return this._proxy.$provideFileSearchResults(this._handle, session, query, token);
            case 2 /* QueryType.Text */:
                return this._proxy.$provideTextSearchResults(this._handle, session, query, token);
            default:
                return this._proxy.$provideAITextSearchResults(this._handle, session, query, token);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFNlYXJjaC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkU2VhcmNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDMUYsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQWtCLGlCQUFpQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDcEcsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBMkksY0FBYyxFQUE2QyxNQUFNLHdDQUF3QyxDQUFDO0FBQzVQLE9BQU8sRUFBRSxjQUFjLEVBQXNCLFdBQVcsRUFBeUIsTUFBTSwrQkFBK0IsQ0FBQztBQUN2SCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxLQUFLLFNBQVMsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUloRixJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFnQjtJQU01QixZQUNDLGNBQStCLEVBQ2YsY0FBK0MsRUFDNUMsaUJBQXFELEVBQ2pELHFCQUE0QyxFQUMvQyxpQkFBK0M7UUFIbEMsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQzNCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7UUFFMUMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFv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