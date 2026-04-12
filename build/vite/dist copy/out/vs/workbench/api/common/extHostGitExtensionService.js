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
var ExtHostGitExtensionService_1;
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostExtensionService } from './extHostExtensionService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { GitRefTypeDto, MainContext } from './extHost.protocol.js';
import { ResourceMap } from '../../../base/common/map.js';
const GIT_EXTENSION_ID = 'vscode.git';
function toGitRefTypeDto(type) {
    switch (type) {
        case 0 /* GitRefType.Head */: return GitRefTypeDto.Head;
        case 1 /* GitRefType.RemoteHead */: return GitRefTypeDto.RemoteHead;
        case 2 /* GitRefType.Tag */: return GitRefTypeDto.Tag;
        default: throw new Error(`Unknown GitRefType: ${type}`);
    }
}
function toGitBranchDto(branch) {
    return {
        name: branch.name,
        commit: branch.commit,
        type: toGitRefTypeDto(branch.type),
        remote: branch.remote,
        base: branch.base,
        upstream: branch.upstream ? toGitUpstreamRefDto(branch.upstream) : undefined,
        ahead: branch.ahead,
        behind: branch.behind,
    };
}
function toGitUpstreamRefDto(upstream) {
    return {
        remote: upstream.remote,
        name: upstream.name,
        commit: upstream.commit,
    };
}
// Status values from the git extension's const enum Status
var GitStatus;
(function (GitStatus) {
    GitStatus[GitStatus["INDEX_ADDED"] = 1] = "INDEX_ADDED";
    GitStatus[GitStatus["INDEX_DELETED"] = 2] = "INDEX_DELETED";
    GitStatus[GitStatus["INDEX_RENAMED"] = 3] = "INDEX_RENAMED";
    GitStatus[GitStatus["MODIFIED"] = 5] = "MODIFIED";
    GitStatus[GitStatus["DELETED"] = 6] = "DELETED";
    GitStatus[GitStatus["UNTRACKED"] = 7] = "UNTRACKED";
    GitStatus[GitStatus["INTENT_TO_ADD"] = 9] = "INTENT_TO_ADD";
    GitStatus[GitStatus["INTENT_TO_RENAME"] = 10] = "INTENT_TO_RENAME";
})(GitStatus || (GitStatus = {}));
function toGitChangeDto(change) {
    switch (change.status) {
        // Added: no original
        case 1 /* GitStatus.INDEX_ADDED */:
        case 7 /* GitStatus.UNTRACKED */:
        case 9 /* GitStatus.INTENT_TO_ADD */:
            return { uri: change.uri, originalUri: undefined, modifiedUri: change.uri };
        // Deleted: no modified
        case 2 /* GitStatus.INDEX_DELETED */:
        case 6 /* GitStatus.DELETED */:
            return { uri: change.uri, originalUri: change.uri, modifiedUri: undefined };
        // Renamed: original is old name, modified is new name
        case 3 /* GitStatus.INDEX_RENAMED */:
        case 10 /* GitStatus.INTENT_TO_RENAME */:
            return { uri: change.uri, originalUri: change.originalUri, modifiedUri: change.renameUri };
        // Modified and everything else: both original and modified
        default:
            return { uri: change.uri, originalUri: change.originalUri, modifiedUri: change.uri };
    }
}
var GitRefType;
(function (GitRefType) {
    GitRefType[GitRefType["Head"] = 0] = "Head";
    GitRefType[GitRefType["RemoteHead"] = 1] = "RemoteHead";
    GitRefType[GitRefType["Tag"] = 2] = "Tag";
})(GitRefType || (GitRefType = {}));
export const IExtHostGitExtensionService = createDecorator('IExtHostGitExtensionService');
let ExtHostGitExtensionService = class ExtHostGitExtensionService extends Disposable {
    static { ExtHostGitExtensionService_1 = this; }
    static { this._handlePool = 0; }
    constructor(extHostRpc, _extHostExtensionService) {
        super();
        this._extHostExtensionService = _extHostExtensionService;
        this._repositories = new Map();
        this._repositoryByUri = new ResourceMap();
        this._disposables = this._register(new DisposableStore());
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadGitExtension);
    }
    async $isGitExtensionAvailable() {
        const registry = await this._extHostExtensionService.getExtensionRegistry();
        return !!registry.getExtensionDescription(GIT_EXTENSION_ID);
    }
    async $openRepository(uri) {
        const api = await this._ensureGitApi();
        if (!api) {
            return undefined;
        }
        const repository = await api.openRepository(URI.revive(uri));
        if (!repository) {
            return undefined;
        }
        const existingHandle = this._repositoryByUri.get(repository.rootUri);
        if (existingHandle !== undefined) {
            const state = await this._getRepositoryState(repository);
            return { handle: existingHandle, rootUri: repository.rootUri, state };
        }
        let repositoryState = repository.state;
        if (repositoryState.HEAD === undefined) {
            // Opening the repository does not wait for the repository state to be
            // initialized so we need to wait for the first change event to ensure
            // that the repository state is fully loaded before we return it to the
            // main thread.
            await Event.toPromise(repositoryState.onDidChange, this._disposables);
            repositoryState = repository.state;
        }
        // Store the repository and its handle in the maps
        const handle = ExtHostGitExtensionService_1._handlePool++;
        this._repositories.set(handle, repository);
        this._repositoryByUri.set(repository.rootUri, handle);
        // Subscribe to repository state changes
        this._disposables.add(repository.state.onDidChange(() => {
            this._proxy.$onDidChangeRepository(handle);
        }));
        const state = await this._getRepositoryState(repository);
        return { handle, rootUri: repository.rootUri, state };
    }
    async $getRefs(handle, query, token) {
        const repository = this._repositories.get(handle);
        if (!repository) {
            return [];
        }
        try {
            const refs = await repository.getRefs(query, token);
            const result = refs.map(ref => {
                if (!ref.name || !ref.commit) {
                    return undefined;
                }
                const id = ref.type === 0 /* GitRefType.Head */
                    ? `refs/heads/${ref.name}`
                    : ref.type === 1 /* GitRefType.RemoteHead */
                        ? `refs/remotes/${ref.remote}/${ref.name}`
                        : `refs/tags/${ref.name}`;
                return {
                    id,
                    name: ref.name,
                    type: toGitRefTypeDto(ref.type),
                    revision: ref.commit
                };
            });
            return result.filter(ref => !!ref);
        }
        catch {
            return [];
        }
    }
    async $getRepositoryState(handle) {
        const repository = this._repositories.get(handle);
        if (!repository) {
            return undefined;
        }
        return this._getRepositoryState(repository);
    }
    async _getRepositoryState(repository) {
        const state = repository.state;
        // Base branch
        const base = await this._getBranchBase(repository);
        return {
            HEAD: state.HEAD ? toGitBranchDto({ ...state.HEAD, base }) : undefined,
            mergeChanges: state.mergeChanges.map(toGitChangeDto),
            indexChanges: state.indexChanges.map(toGitChangeDto),
            workingTreeChanges: state.workingTreeChanges.map(toGitChangeDto),
            untrackedChanges: state.untrackedChanges.map(toGitChangeDto),
        };
    }
    async _getBranchBase(repository) {
        const state = repository.state;
        if (!state.HEAD?.name) {
            return undefined;
        }
        const baseBranch = await repository.getBranchBase(state.HEAD.name);
        if (!baseBranch?.name) {
            return undefined;
        }
        const isProtected = repository.isBranchProtected(baseBranch);
        return { name: baseBranch.name, isProtected };
    }
    async $diffBetweenWithStats(handle, ref1, ref2, path) {
        const repository = this._repositories.get(handle);
        if (!repository) {
            return [];
        }
        try {
            const changes = await repository.diffBetweenWithStats(ref1, ref2, path);
            return changes.map(c => ({
                ...toGitChangeDto(c),
                insertions: c.insertions,
                deletions: c.deletions,
            }));
        }
        catch {
            return [];
        }
    }
    async $diffBetweenWithStats2(handle, ref, path) {
        const repository = this._repositories.get(handle);
        if (!repository) {
            return [];
        }
        try {
            const changes = await repository.diffBetweenWithStats2(ref, path);
            return changes.map(c => ({
                ...toGitChangeDto(c),
                insertions: c.insertions,
                deletions: c.deletions,
            }));
        }
        catch {
            return [];
        }
    }
    async _ensureGitApi() {
        if (this._gitApi) {
            return this._gitApi;
        }
        try {
            await this._extHostExtensionService.activateByIdWithErrors(new ExtensionIdentifier(GIT_EXTENSION_ID), { startup: false, extensionId: new ExtensionIdentifier(GIT_EXTENSION_ID), activationEvent: 'api' });
            const exports = this._extHostExtensionService.getExtensionExports(new ExtensionIdentifier(GIT_EXTENSION_ID));
            if (!!exports && typeof exports.getAPI === 'function') {
                this._gitApi = exports.getAPI(1);
            }
        }
        catch {
            // Git extension not available
        }
        return this._gitApi;
    }
    dispose() {
        this._disposables.dispose();
        super.dispose();
    }
};
ExtHostGitExtensionService = ExtHostGitExtensionService_1 = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostExtensionService)
], ExtHostGitExtensionService);
export { ExtHostGitExtensionService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEdpdEV4dGVuc2lvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0R2l0RXh0ZW5zaW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEYsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxFQUFvSCxhQUFhLEVBQTRDLFdBQVcsRUFBK0IsTUFBTSx1QkFBdUIsQ0FBQztBQUM1UCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFMUQsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZLENBQUM7QUFFdEMsU0FBUyxlQUFlLENBQUMsSUFBZ0I7SUFDeEMsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNkLDRCQUFvQixDQUFDLENBQUMsT0FBTyxhQUFhLENBQUMsSUFBSSxDQUFDO1FBQ2hELGtDQUEwQixDQUFDLENBQUMsT0FBTyxhQUFhLENBQUMsVUFBVSxDQUFDO1FBQzVELDJCQUFtQixDQUFDLENBQUMsT0FBTyxhQUFhLENBQUMsR0FBRyxDQUFDO1FBQzlDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsdUJBQXVCLElBQUksRUFBRSxDQUFDLENBQUM7SUFDekQsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxNQUFjO0lBQ3JDLE9BQU87UUFDTixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUk7UUFDakIsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1FBQ3JCLElBQUksRUFBRSxlQUFlLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNsQyxNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07UUFDckIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO1FBQ2pCLFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDNUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLO1FBQ25CLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTtLQUNyQixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsUUFBcUI7SUFDakQsT0FBTztRQUNOLE1BQU0sRUFBRSxRQUFRLENBQUMsTUFBTTtRQUN2QixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUk7UUFDbkIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNO0tBQ3ZCLENBQUM7QUFDSCxDQUFDO0FBRUQsMkRBQTJEO0FBQzNELElBQVcsU0FTVjtBQVRELFdBQVcsU0FBUztJQUNuQix1REFBZSxDQUFBO0lBQ2YsMkRBQWlCLENBQUE7SUFDakIsMkRBQWlCLENBQUE7SUFDakIsaURBQVksQ0FBQTtJQUNaLCtDQUFXLENBQUE7SUFDWCxtREFBYSxDQUFBO0lBQ2IsMkRBQWlCLENBQUE7SUFDakIsa0VBQXFCLENBQUE7QUFDdEIsQ0FBQyxFQVRVLFNBQVMsS0FBVCxTQUFTLFFBU25CO0FBRUQsU0FBUyxjQUFjLENBQUMsTUFBYztJQUNyQyxRQUFRLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN2QixxQkFBcUI7UUFDckIsbUNBQTJCO1FBQzNCLGlDQUF5QjtRQUN6QjtZQUNDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFN0UsdUJBQXVCO1FBQ3ZCLHFDQUE2QjtRQUM3QjtZQUNDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFFN0Usc0RBQXNEO1FBQ3RELHFDQUE2QjtRQUM3QjtZQUNDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRTVGLDJEQUEyRDtRQUMzRDtZQUNDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3ZGLENBQUM7QUFDRixDQUFDO0FBNERELElBQVcsVUFJVjtBQUpELFdBQVcsVUFBVTtJQUNwQiwyQ0FBSSxDQUFBO0lBQ0osdURBQVUsQ0FBQTtJQUNWLHlDQUFHLENBQUE7QUFDSixDQUFDLEVBSlUsVUFBVSxLQUFWLFVBQVUsUUFJcEI7QUFxQkQsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsZUFBZSxDQUE4Qiw2QkFBNkIsQ0FBQyxDQUFDO0FBRWhILElBQU0sMEJBQTBCLEdBQWhDLE1BQU0sMEJBQTJCLFNBQVEsVUFBVTs7YUFHMUMsZ0JBQVcsR0FBVyxDQUFDLEFBQVosQ0FBYTtJQVd2QyxZQUNxQixVQUE4QixFQUN4Qix3QkFBbUU7UUFFN0YsS0FBSyxFQUFFLENBQUM7UUFGbUMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEwQjtRQVA3RSxrQkFBYSxHQUFHLElBQUksR0FBRyxFQUFzQixDQUFDO1FBQzlDLHFCQUFnQixHQUFHLElBQUksV0FBVyxFQUFVLENBQUM7UUFFN0MsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQVFyRSxJQUFJLENBQUMsTUFBTSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVELEtBQUssQ0FBQyx3QkFBd0I7UUFDN0IsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsd0JBQXdCLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUM1RSxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRUQsS0FBSyxDQUFDLGVBQWUsQ0FBQyxHQUFrQjtRQUN2QyxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN2QyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDVixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JFLElBQUksY0FBYyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2xDLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3pELE9BQU8sRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxVQUFVLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO1FBQ3ZFLENBQUM7UUFFRCxJQUFJLGVBQWUsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBQ3ZDLElBQUksZUFBZSxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUN4QyxzRUFBc0U7WUFDdEUsc0VBQXNFO1lBQ3RFLHVFQUF1RTtZQUN2RSxlQUFlO1lBQ2YsTUFBTSxLQUFLLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3RFLGVBQWUsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBQ3BDLENBQUM7UUFFRCxrREFBa0Q7UUFDbEQsTUFBTSxNQUFNLEdBQUcsNEJBQTBCLENBQUMsV0FBVyxFQUFFLENBQUM7UUFFeEQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUV0RCx3Q0FBd0M7UUFDeEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFO1lBQ3ZELElBQUksQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pELE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFVBQVUsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDdkQsQ0FBQztJQUVELEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBYyxFQUFFLEtBQXFCLEVBQUUsS0FBZ0M7UUFDckYsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pCLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUVELElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxHQUFHLE1BQU0sVUFBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEQsTUFBTSxNQUFNLEdBQThCLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQ3hELElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUM5QixPQUFPLFNBQVMsQ0FBQztnQkFDbEIsQ0FBQztnQkFFRCxNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUMsSUFBSSw0QkFBb0I7b0JBQ3RDLENBQUMsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxJQUFJLEVBQUU7b0JBQzFCLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxrQ0FBMEI7d0JBQ25DLENBQUMsQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsSUFBSSxFQUFFO3dCQUMxQyxDQUFDLENBQUMsYUFBYSxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBRTVCLE9BQU87b0JBQ04sRUFBRTtvQkFDRixJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUk7b0JBQ2QsSUFBSSxFQUFFLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO29CQUMvQixRQUFRLEVBQUUsR0FBRyxDQUFDLE1BQU07aUJBQ0EsQ0FBQztZQUN2QixDQUFDLENBQUMsQ0FBQztZQUVILE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNwQyxDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxNQUFjO1FBQ3ZDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVPLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxVQUFzQjtRQUN2RCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBRS9CLGNBQWM7UUFDZCxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFbkQsT0FBTztZQUNOLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUN0RSxZQUFZLEVBQUUsS0FBSyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDO1lBQ3BELFlBQVksRUFBRSxLQUFLLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUM7WUFDcEQsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUM7WUFDaEUsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUM7U0FDNUQsQ0FBQztJQUNILENBQUM7SUFFTyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQXNCO1FBQ2xELE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUM7UUFDL0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUM7WUFDdkIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sVUFBVSxHQUFHLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ25FLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUM7WUFDdkIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM3RCxPQUFPLEVBQUUsSUFBSSxFQUFFLFVBQVUsQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFLENBQUM7SUFDL0MsQ0FBQztJQUVELEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxNQUFjLEVBQUUsSUFBWSxFQUFFLElBQVksRUFBRSxJQUFhO1FBQ3BGLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSixNQUFNLE9BQU8sR0FBRyxNQUFNLFVBQVUsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3hFLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3hCLEdBQUcsY0FBYyxDQUFDLENBQUMsQ0FBQztnQkFDcEIsVUFBVSxFQUFFLENBQUMsQ0FBQyxVQUFVO2dCQUN4QixTQUFTLEVBQUUsQ0FBQyxDQUFDLFNBQVM7YUFDdEIsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxNQUFjLEVBQUUsR0FBVyxFQUFFLElBQWE7UUFDdEUsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pCLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUVELElBQUksQ0FBQztZQUNKLE1BQU0sT0FBTyxHQUFHLE1BQU0sVUFBVSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNsRSxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QixHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLFVBQVUsRUFBRSxDQUFDLENBQUMsVUFBVTtnQkFDeEIsU0FBUyxFQUFFLENBQUMsQ0FBQyxTQUFTO2FBQ3RCLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYTtRQUMxQixJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNsQixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7UUFDckIsQ0FBQztRQUVELElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLHdCQUF3QixDQUFDLHNCQUFzQixDQUN6RCxJQUFJLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDLEVBQ3pDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsSUFBSSxtQkFBbUIsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsQ0FDbEcsQ0FBQztZQUVGLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztZQUM3RyxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksT0FBUSxPQUF3QixDQUFDLE1BQU0sS0FBSyxVQUFVLEVBQUUsQ0FBQztnQkFDekUsSUFBSSxDQUFDLE9BQU8sR0FBSSxPQUF3QixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRCxDQUFDO1FBQ0YsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLDhCQUE4QjtRQUMvQixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFUSxPQUFPO1FBQ2YsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUM1QixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQzs7QUEzTVcsMEJBQTBCO0lBZXBDLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSx3QkFBd0IsQ0FBQTtHQWhCZCwwQkFBMEIsQ0E0TXRDIn0=