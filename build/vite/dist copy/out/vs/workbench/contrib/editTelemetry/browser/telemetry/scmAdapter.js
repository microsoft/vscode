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
import { WeakCachedFunction } from '../../../../../base/common/cache.js';
import { Event } from '../../../../../base/common/event.js';
import { observableSignalFromEvent, derived } from '../../../../../base/common/observable.js';
import { ISCMService } from '../../../scm/common/scm.js';
let ScmAdapter = class ScmAdapter {
    constructor(_scmService) {
        this._scmService = _scmService;
        this._repos = new WeakCachedFunction((repo) => new ScmRepoAdapter(repo));
        this._reposChangedSignal = observableSignalFromEvent(this, Event.any(this._scmService.onDidAddRepository, this._scmService.onDidRemoveRepository));
    }
    getRepo(uri, reader) {
        this._reposChangedSignal.read(reader);
        const repo = this._scmService.getRepository(uri);
        if (!repo) {
            return undefined;
        }
        return this._repos.get(repo);
    }
};
ScmAdapter = __decorate([
    __param(0, ISCMService)
], ScmAdapter);
export { ScmAdapter };
export class ScmRepoAdapter {
    constructor(_repo) {
        this._repo = _repo;
        this.headBranchNameObs = derived(reader => this._repo.provider.historyProvider.read(reader)?.historyItemRef.read(reader)?.name);
        this.headCommitHashObs = derived(reader => this._repo.provider.historyProvider.read(reader)?.historyItemRef.read(reader)?.revision);
    }
    async isIgnored(uri) {
        return false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtQWRhcHRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvc2NtQWRhcHRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLHlCQUF5QixFQUF3QixPQUFPLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVwSCxPQUFPLEVBQWtCLFdBQVcsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRWxFLElBQU0sVUFBVSxHQUFoQixNQUFNLFVBQVU7SUFLdEIsWUFDYyxXQUF5QztRQUF4QixnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQUx0QyxXQUFNLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLElBQW9CLEVBQUUsRUFBRSxDQUFDLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFPcEcsSUFBSSxDQUFDLG1CQUFtQixHQUFHLHlCQUF5QixDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7SUFDcEosQ0FBQztJQUVNLE9BQU8sQ0FBQyxHQUFRLEVBQUUsTUFBMkI7UUFDbkQsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDWCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM5QixDQUFDO0NBQ0QsQ0FBQTtBQW5CWSxVQUFVO0lBTXBCLFdBQUEsV0FBVyxDQUFBO0dBTkQsVUFBVSxDQW1CdEI7O0FBRUQsTUFBTSxPQUFPLGNBQWM7SUFJMUIsWUFDa0IsS0FBcUI7UUFBckIsVUFBSyxHQUFMLEtBQUssQ0FBZ0I7UUFKdkIsc0JBQWlCLEdBQW9DLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1SixzQkFBaUIsR0FBb0MsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBS2hMLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQVE7UUFDdkIsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0NBQ0QifQ==