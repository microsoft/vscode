/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IReference } from '../../../../base/common/lifecycle.js';
import { IGitHubClient, IGitHubService } from '../../../../platform/github/common/githubService.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IGitHubAccountClient } from '../../../../platform/github/common/account/account.js';
import { IGitHubAnonymousClient } from '../../../../platform/github/common/anonymous/anonymous.js';
import { GitHubAuthorizationContext } from '../../../../platform/github/common/githubTypes.js';

export const IWorkbenchGitHubService = refineServiceDecorator<IGitHubService, IWorkbenchGitHubService>(IGitHubService);

export interface IWorkbenchGitHubService extends IGitHubService {
	readonly onDidChangeDefaultClient: Event<void>;
	acquireAnonymousApiClient(signal: AbortSignal): Promise<IGitHubAnonymousClient>;
	acquireAccountApiClient(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<IGitHubAccountClient>;
	acquireDefaultAccountClient(signal: AbortSignal): Promise<IReference<IGitHubClient>>;
	acquireDefaultAccountApiClient(signal: AbortSignal): Promise<IGitHubAccountClient>;
}
