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

export const IWorkbenchGitHubService = refineServiceDecorator<IGitHubService, IWorkbenchGitHubService>(IGitHubService);

export interface IWorkbenchGitHubService extends IGitHubService {
	readonly onDidChangeDefaultClient: Event<void>;
	acquireAnonymousApiClient(signal: AbortSignal): Promise<IGitHubAnonymousClient>;
	acquireDefaultAccountClient(signal: AbortSignal): Promise<IReference<IGitHubClient>>;
	acquireDefaultAccountApiClient(signal: AbortSignal): Promise<IGitHubAccountClient>;
	acquireSessionClient(providerId: string, sessionId: string, signal: AbortSignal): Promise<IReference<IGitHubClient>>;
}
