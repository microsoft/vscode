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
import { autorun } from '../../../../base/common/observable.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { GitHubService, IGitHubService } from './githubService.js';
/**
 * Immediately refreshes PR data when the active session changes so that
 * CI checks and PR state are up-to-date without waiting for the next
 * polling cycle.
 */
let GitHubActiveSessionRefreshContribution = class GitHubActiveSessionRefreshContribution extends Disposable {
    static { this.ID = 'sessions.contrib.githubActiveSessionRefresh'; }
    constructor(_sessionsManagementService, _gitHubService) {
        super();
        this._sessionsManagementService = _sessionsManagementService;
        this._gitHubService = _gitHubService;
        this._register(autorun(reader => {
            const session = this._sessionsManagementService.activeSession.read(reader);
            if (!session) {
                this._lastSessionResource = undefined;
                return;
            }
            if (this._lastSessionResource?.toString() === session.resource.toString()) {
                return;
            }
            this._lastSessionResource = session.resource;
            const gitHubInfo = session.gitHubInfo.read(reader);
            if (!gitHubInfo?.pullRequest) {
                return;
            }
            const prModel = this._gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
            prModel.refresh();
        }));
    }
};
GitHubActiveSessionRefreshContribution = __decorate([
    __param(0, ISessionsManagementService),
    __param(1, IGitHubService)
], GitHubActiveSessionRefreshContribution);
registerSingleton(IGitHubService, GitHubService, 1 /* InstantiationType.Delayed */);
registerWorkbenchContribution2(GitHubActiveSessionRefreshContribution.ID, GitHubActiveSessionRefreshContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL2Jyb3dzZXIvZ2l0aHViLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhFLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQTBCLDhCQUE4QixFQUFrQixNQUFNLCtDQUErQyxDQUFDO0FBQ3ZJLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxhQUFhLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFbkU7Ozs7R0FJRztBQUNILElBQU0sc0NBQXNDLEdBQTVDLE1BQU0sc0NBQXVDLFNBQVEsVUFBVTthQUU5QyxPQUFFLEdBQUcsNkNBQTZDLEFBQWhELENBQWlEO0lBSW5FLFlBQzhDLDBCQUFzRCxFQUNsRSxjQUE4QjtRQUUvRCxLQUFLLEVBQUUsQ0FBQztRQUhxQywrQkFBMEIsR0FBMUIsMEJBQTBCLENBQTRCO1FBQ2xFLG1CQUFjLEdBQWQsY0FBYyxDQUFnQjtRQUkvRCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMzRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFNBQVMsQ0FBQztnQkFDdEMsT0FBTztZQUNSLENBQUM7WUFDRCxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsS0FBSyxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7Z0JBQzNFLE9BQU87WUFDUixDQUFDO1lBQ0QsSUFBSSxDQUFDLG9CQUFvQixHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUM7WUFDN0MsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsQ0FBQztnQkFDOUIsT0FBTztZQUNSLENBQUM7WUFDRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNySCxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7O0FBN0JJLHNDQUFzQztJQU96QyxXQUFBLDBCQUEwQixDQUFBO0lBQzFCLFdBQUEsY0FBYyxDQUFBO0dBUlgsc0NBQXNDLENBOEIzQztBQUVELGlCQUFpQixDQUFDLGNBQWMsRUFBRSxhQUFhLG9DQUE0QixDQUFDO0FBQzVFLDhCQUE4QixDQUFDLHNDQUFzQyxDQUFDLEVBQUUsRUFBRSxzQ0FBc0MsdUNBQStCLENBQUMifQ==