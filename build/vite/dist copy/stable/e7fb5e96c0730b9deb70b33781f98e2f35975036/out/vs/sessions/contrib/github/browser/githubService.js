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
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { GitHubApiClient } from './githubApiClient.js';
import { GitHubRepositoryFetcher } from './fetchers/githubRepositoryFetcher.js';
import { GitHubPRFetcher } from './fetchers/githubPRFetcher.js';
import { GitHubPRCIFetcher } from './fetchers/githubPRCIFetcher.js';
import { GitHubRepositoryModel } from './models/githubRepositoryModel.js';
import { GitHubPullRequestModel } from './models/githubPullRequestModel.js';
import { GitHubPullRequestCIModel } from './models/githubPullRequestCIModel.js';
export const IGitHubService = createDecorator('sessionsGitHubService');
const LOG_PREFIX = '[GitHubService]';
let GitHubService = class GitHubService extends Disposable {
    constructor(instantiationService, _logService) {
        super();
        this._logService = _logService;
        this._repositories = this._register(new DisposableMap());
        this._pullRequests = this._register(new DisposableMap());
        this._ciModels = this._register(new DisposableMap());
        this._apiClient = this._register(instantiationService.createInstance(GitHubApiClient));
        this._repoFetcher = new GitHubRepositoryFetcher(this._apiClient);
        this._prFetcher = new GitHubPRFetcher(this._apiClient);
        this._ciFetcher = new GitHubPRCIFetcher(this._apiClient);
    }
    getRepository(owner, repo) {
        const key = `${owner}/${repo}`;
        let model = this._repositories.get(key);
        if (!model) {
            this._logService.trace(`${LOG_PREFIX} Creating repository model for ${key}`);
            model = new GitHubRepositoryModel(owner, repo, this._repoFetcher, this._logService);
            this._repositories.set(key, model);
        }
        return model;
    }
    getPullRequest(owner, repo, prNumber) {
        const key = `${owner}/${repo}/${prNumber}`;
        let model = this._pullRequests.get(key);
        if (!model) {
            this._logService.trace(`${LOG_PREFIX} Creating PR model for ${key}`);
            model = new GitHubPullRequestModel(owner, repo, prNumber, this._prFetcher, this._logService);
            this._pullRequests.set(key, model);
        }
        return model;
    }
    getPullRequestCI(owner, repo, headRef) {
        const key = `${owner}/${repo}/${headRef}`;
        let model = this._ciModels.get(key);
        if (!model) {
            this._logService.trace(`${LOG_PREFIX} Creating CI model for ${key}`);
            model = new GitHubPullRequestCIModel(owner, repo, headRef, this._ciFetcher, this._logService);
            this._ciModels.set(key, model);
        }
        return model;
    }
};
GitHubService = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILogService)
], GitHubService);
export { GitHubService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxlQUFlLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNwSCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQXdCaEYsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBaUIsdUJBQXVCLENBQUMsQ0FBQztBQUV2RixNQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQztBQUU5QixJQUFNLGFBQWEsR0FBbkIsTUFBTSxhQUFjLFNBQVEsVUFBVTtJQWE1QyxZQUN3QixvQkFBMkMsRUFDckQsV0FBeUM7UUFFdEQsS0FBSyxFQUFFLENBQUM7UUFGc0IsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFOdEMsa0JBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUFpQyxDQUFDLENBQUM7UUFDbkYsa0JBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUFrQyxDQUFDLENBQUM7UUFDcEYsY0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQW9DLENBQUMsQ0FBQztRQVFsRyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFDdkYsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLHVCQUF1QixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksZUFBZSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFRCxhQUFhLENBQUMsS0FBYSxFQUFFLElBQVk7UUFDeEMsTUFBTSxHQUFHLEdBQUcsR0FBRyxLQUFLLElBQUksSUFBSSxFQUFFLENBQUM7UUFDL0IsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxVQUFVLGtDQUFrQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQzdFLEtBQUssR0FBRyxJQUFJLHFCQUFxQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDcEYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxjQUFjLENBQUMsS0FBYSxFQUFFLElBQVksRUFBRSxRQUFnQjtRQUMzRCxNQUFNLEdBQUcsR0FBRyxHQUFHLEtBQUssSUFBSSxJQUFJLElBQUksUUFBUSxFQUFFLENBQUM7UUFDM0MsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxVQUFVLDBCQUEwQixHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ3JFLEtBQUssR0FBRyxJQUFJLHNCQUFzQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzdGLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwQyxDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsZ0JBQWdCLENBQUMsS0FBYSxFQUFFLElBQVksRUFBRSxPQUFlO1FBQzVELE1BQU0sR0FBRyxHQUFHLEdBQUcsS0FBSyxJQUFJLElBQUksSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUMxQyxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLFVBQVUsMEJBQTBCLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDckUsS0FBSyxHQUFHLElBQUksd0JBQXdCLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDOUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRCxDQUFBO0FBekRZLGFBQWE7SUFjdkIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLFdBQVcsQ0FBQTtHQWZELGFBQWEsQ0F5RHpCIn0=