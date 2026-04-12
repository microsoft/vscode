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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived } from '../../../../base/common/observable.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
let ChecksViewModel = class ChecksViewModel extends Disposable {
    constructor(gitHubService, sessionManagementService) {
        super();
        this.activeSessionResourceObs = derived(this, reader => {
            const session = sessionManagementService.activeSession.read(reader);
            return session?.resource;
        });
        this.checksObs = derived(this, reader => {
            const session = sessionManagementService.activeSession.read(reader);
            if (!session) {
                return undefined;
            }
            const gitHubInfo = session.gitHubInfo.read(reader);
            if (!gitHubInfo?.pullRequest) {
                return undefined;
            }
            const prModel = gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
            const pr = prModel.pullRequest.read(reader);
            if (!pr) {
                return undefined;
            }
            // Use the PR's headSha (commit SHA) rather than the branch
            // name so CI checks can still be fetched after branch deletion
            // (e.g. after the PR is merged).
            const ciModel = gitHubService.getPullRequestCI(gitHubInfo.owner, gitHubInfo.repo, pr.headSha);
            ciModel.refresh();
            ciModel.startPolling();
            reader.store.add({ dispose: () => ciModel.stopPolling() });
            return ciModel;
        });
    }
};
ChecksViewModel = __decorate([
    __param(0, IGitHubService),
    __param(1, ISessionsManagementService)
], ChecksViewModel);
export { ChecksViewModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hlY2tzVmlld01vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGFuZ2VzL2Jyb3dzZXIvY2hlY2tzVmlld01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFlLE1BQU0sdUNBQXVDLENBQUM7QUFFN0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXZFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRTFGLElBQU0sZUFBZSxHQUFyQixNQUFNLGVBQWdCLFNBQVEsVUFBVTtJQUk5QyxZQUNpQixhQUE2QixFQUNqQix3QkFBb0Q7UUFFaEYsS0FBSyxFQUFFLENBQUM7UUFFUixJQUFJLENBQUMsd0JBQXdCLEdBQUcsT0FBTyxDQUFrQixJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUU7WUFDdkUsTUFBTSxPQUFPLEdBQUcsd0JBQXdCLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNwRSxPQUFPLE9BQU8sRUFBRSxRQUFRLENBQUM7UUFDMUIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUU7WUFDdkMsTUFBTSxPQUFPLEdBQUcsd0JBQXdCLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNwRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztZQUVELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ25ELElBQUksQ0FBQyxVQUFVLEVBQUUsV0FBVyxFQUFFLENBQUM7Z0JBQzlCLE9BQU8sU0FBUyxDQUFDO1lBQ2xCLENBQUM7WUFFRCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQy9HLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzVDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDVCxPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO1lBRUQsMkRBQTJEO1lBQzNELCtEQUErRDtZQUMvRCxpQ0FBaUM7WUFDakMsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDOUYsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xCLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN2QixNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRTNELE9BQU8sT0FBTyxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUE7QUEzQ1ksZUFBZTtJQUt6QixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsMEJBQTBCLENBQUE7R0FOaEIsZUFBZSxDQTJDM0IifQ==