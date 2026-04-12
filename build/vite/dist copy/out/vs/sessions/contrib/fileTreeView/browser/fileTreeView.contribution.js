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
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../sessions/common/sessionData.js';
import { GitHubFileSystemProvider } from './githubFileSystemProvider.js';
// --- View registration is currently disabled in favor of the "Add Context" picker.
// The Files view will be re-enabled once we finalize the sessions auxiliary bar layout.
// --- Session Repo FileSystem Provider Registration
let GitHubFileSystemProviderContribution = class GitHubFileSystemProviderContribution extends Disposable {
    static { this.ID = 'workbench.contrib.githubFileSystemProvider'; }
    constructor(fileService, instantiationService) {
        super();
        const provider = this._register(instantiationService.createInstance(GitHubFileSystemProvider));
        this._register(fileService.registerProvider(GITHUB_REMOTE_FILE_SCHEME, provider));
    }
};
GitHubFileSystemProviderContribution = __decorate([
    __param(0, IFileService),
    __param(1, IInstantiationService)
], GitHubFileSystemProviderContribution);
registerWorkbenchContribution2(GitHubFileSystemProviderContribution.ID, GitHubFileSystemProviderContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZVRyZWVWaWV3LmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvZmlsZVRyZWVWaWV3L2Jyb3dzZXIvZmlsZVRyZWVWaWV3LmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSw4QkFBOEIsRUFBa0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUMvRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV6RSxvRkFBb0Y7QUFDcEYsd0ZBQXdGO0FBRXhGLG9EQUFvRDtBQUVwRCxJQUFNLG9DQUFvQyxHQUExQyxNQUFNLG9DQUFxQyxTQUFRLFVBQVU7YUFFNUMsT0FBRSxHQUFHLDRDQUE0QyxBQUEvQyxDQUFnRDtJQUVsRSxZQUNlLFdBQXlCLEVBQ2hCLG9CQUEyQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQUNSLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztRQUMvRixJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyx5QkFBeUIsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ25GLENBQUM7O0FBWEksb0NBQW9DO0lBS3ZDLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxxQkFBcUIsQ0FBQTtHQU5sQixvQ0FBb0MsQ0FZekM7QUFFRCw4QkFBOEIsQ0FDN0Isb0NBQW9DLENBQUMsRUFBRSxFQUN2QyxvQ0FBb0MsdUNBRXBDLENBQUMifQ==