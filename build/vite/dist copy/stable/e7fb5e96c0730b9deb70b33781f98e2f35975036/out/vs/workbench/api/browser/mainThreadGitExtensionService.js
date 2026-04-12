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
import { Sequencer } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { GitRepository } from '../../contrib/git/browser/gitService.js';
import { IGitService, GitRefType } from '../../contrib/git/common/gitService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, GitRefTypeDto, MainContext } from '../common/extHost.protocol.js';
function toGitRefType(type) {
    switch (type) {
        case GitRefTypeDto.Head: return GitRefType.Head;
        case GitRefTypeDto.RemoteHead: return GitRefType.RemoteHead;
        case GitRefTypeDto.Tag: return GitRefType.Tag;
        default: throw new Error(`Unknown GitRefType: ${type}`);
    }
}
function toGitDiffChange(dto) {
    return {
        uri: URI.revive(dto.uri),
        originalUri: dto.originalUri ? URI.revive(dto.originalUri) : undefined,
        modifiedUri: dto.modifiedUri ? URI.revive(dto.modifiedUri) : undefined,
        insertions: dto.insertions,
        deletions: dto.deletions,
    };
}
function toGitRepositoryState(dto) {
    return {
        HEAD: dto?.HEAD ? {
            type: toGitRefType(dto.HEAD.type),
            name: dto.HEAD.name,
            commit: dto.HEAD.commit,
            remote: dto.HEAD.remote,
            base: dto.HEAD.base,
            upstream: dto.HEAD.upstream,
            ahead: dto.HEAD.ahead,
            behind: dto.HEAD.behind,
        } : undefined,
        mergeChanges: dto?.mergeChanges?.map(c => ({
            uri: URI.revive(c.uri),
            originalUri: c.originalUri ? URI.revive(c.originalUri) : undefined,
            modifiedUri: c.modifiedUri ? URI.revive(c.modifiedUri) : undefined,
        })) ?? [],
        indexChanges: dto?.indexChanges?.map(c => ({
            uri: URI.revive(c.uri),
            originalUri: c.originalUri ? URI.revive(c.originalUri) : undefined,
            modifiedUri: c.modifiedUri ? URI.revive(c.modifiedUri) : undefined,
        })) ?? [],
        workingTreeChanges: dto?.workingTreeChanges?.map(c => ({
            uri: URI.revive(c.uri),
            originalUri: c.originalUri ? URI.revive(c.originalUri) : undefined,
            modifiedUri: c.modifiedUri ? URI.revive(c.modifiedUri) : undefined,
        })) ?? [],
        untrackedChanges: dto?.untrackedChanges?.map(c => ({
            uri: URI.revive(c.uri),
            originalUri: c.originalUri ? URI.revive(c.originalUri) : undefined,
            modifiedUri: c.modifiedUri ? URI.revive(c.modifiedUri) : undefined,
        })) ?? [],
    };
}
let MainThreadGitExtensionService = class MainThreadGitExtensionService extends Disposable {
    get repositories() {
        return this._repositories.values();
    }
    constructor(extHostContext, gitService) {
        super();
        this.gitService = gitService;
        this._openRepositorySequencer = new Sequencer();
        this._repositoryHandles = new ResourceMap();
        this._repositories = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostGitExtension);
        this._initializeDelegate();
    }
    async _initializeDelegate() {
        // Check whether the vscode.git extension is available in the extension host
        // process before setting the delegate. The delegate should only be set once,
        // for the extension host process that runs the vscode.git extension
        const isExtensionAvailable = await this._proxy.$isGitExtensionAvailable();
        if (isExtensionAvailable && !this._store.isDisposed) {
            this._register(this.gitService.setDelegate(this));
        }
    }
    _getRepositoryByUri(uri) {
        const handle = this._repositoryHandles.get(uri);
        return handle !== undefined ? this._repositories.get(handle) : undefined;
    }
    async openRepository(uri) {
        return this._openRepositorySequencer.queue(async () => {
            // Check if we already have a repository for the given URI
            const existingRepository = this._getRepositoryByUri(uri);
            if (existingRepository) {
                return existingRepository;
            }
            // Open the repository
            const result = await this._proxy.$openRepository(uri);
            if (!result) {
                return undefined;
            }
            const repositoryRootUri = URI.revive(result.rootUri);
            // Check if we already have a repository for the given root
            const existingRepositoryForRoot = this._getRepositoryByUri(repositoryRootUri);
            if (existingRepositoryForRoot) {
                return existingRepositoryForRoot;
            }
            // Create a new repository and store it in the maps
            const state = toGitRepositoryState(result.state);
            const repository = new GitRepository(repositoryRootUri, state, this);
            this._repositories.set(result.handle, repository);
            this._repositoryHandles.set(repositoryRootUri, result.handle);
            return repository;
        });
    }
    async getRefs(root, query, token) {
        const handle = this._repositoryHandles.get(root);
        if (handle === undefined) {
            return [];
        }
        const result = await this._proxy.$getRefs(handle, query, token);
        if (token?.isCancellationRequested) {
            return [];
        }
        return result.map(ref => ({
            ...ref,
            type: toGitRefType(ref.type)
        }));
    }
    async diffBetweenWithStats(root, ref1, ref2, path) {
        const handle = this._repositoryHandles.get(root);
        if (handle === undefined) {
            return [];
        }
        const result = await this._proxy.$diffBetweenWithStats(handle, ref1, ref2, path);
        return result.map(toGitDiffChange);
    }
    async diffBetweenWithStats2(root, ref, path) {
        const handle = this._repositoryHandles.get(root);
        if (handle === undefined) {
            return [];
        }
        const result = await this._proxy.$diffBetweenWithStats2(handle, ref, path);
        return result.map(toGitDiffChange);
    }
    async $onDidChangeRepository(handle) {
        const repository = this._repositories.get(handle);
        if (!repository) {
            return;
        }
        const state = await this._proxy.$getRepositoryState(handle);
        if (!state) {
            return;
        }
        // Update the repository state
        repository.updateState(toGitRepositoryState(state));
    }
};
MainThreadGitExtensionService = __decorate([
    extHostNamedCustomer(MainContext.MainThreadGitExtension),
    __param(1, IGitService)
], MainThreadGitExtensionService);
export { MainThreadGitExtensionService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEdpdEV4dGVuc2lvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZEdpdEV4dGVuc2lvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzFELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDMUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4RSxPQUFPLEVBQXlCLFdBQVcsRUFBdUIsVUFBVSxFQUEyRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3RNLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQUUsY0FBYyxFQUE4QyxhQUFhLEVBQXlCLFdBQVcsRUFBK0IsTUFBTSwrQkFBK0IsQ0FBQztBQUUzTCxTQUFTLFlBQVksQ0FBQyxJQUFtQjtJQUN4QyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ2QsS0FBSyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDO1FBQ2hELEtBQUssYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE9BQU8sVUFBVSxDQUFDLFVBQVUsQ0FBQztRQUM1RCxLQUFLLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLFVBQVUsQ0FBQyxHQUFHLENBQUM7UUFDOUMsT0FBTyxDQUFDLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN6RCxDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLEdBQXFCO0lBQzdDLE9BQU87UUFDTixHQUFHLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDO1FBQ3hCLFdBQVcsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUN0RSxXQUFXLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDdEUsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVO1FBQzFCLFNBQVMsRUFBRSxHQUFHLENBQUMsU0FBUztLQUN4QixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsR0FBc0M7SUFDbkUsT0FBTztRQUNOLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNqQixJQUFJLEVBQUUsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ2pDLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUk7WUFDbkIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTTtZQUN2QixNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNO1lBQ3ZCLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUk7WUFDbkIsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUTtZQUMzQixLQUFLLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLO1lBQ3JCLE1BQU0sRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU07U0FDSCxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ2pDLFlBQVksRUFBRSxHQUFHLEVBQUUsWUFBWSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDMUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUN0QixXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDbEUsV0FBVyxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1NBQzdDLENBQUEsQ0FBQyxJQUFJLEVBQUU7UUFDN0IsWUFBWSxFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMxQyxHQUFHLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ3RCLFdBQVcsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUNsRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7U0FDN0MsQ0FBQSxDQUFDLElBQUksRUFBRTtRQUM3QixrQkFBa0IsRUFBRSxHQUFHLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN0RCxHQUFHLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ3RCLFdBQVcsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFD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