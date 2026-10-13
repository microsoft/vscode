/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IReference } from '../../../../base/common/lifecycle.js';
import { IGitHubClient, IGitHubService } from '../../../../platform/github/common/githubService.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IWorkbenchGitHubService = refineServiceDecorator<IGitHubService, IWorkbenchGitHubService>(IGitHubService);

export interface IWorkbenchGitHubService extends IGitHubService {
	readonly onDidChangeDefaultClient: Event<void>;
	acquireDefaultAccountClient(signal: AbortSignal): Promise<IReference<IGitHubClient>>;
	acquireSessionClient(providerId: string, sessionId: string, signal: AbortSignal): Promise<IReference<IGitHubClient>>;
}
