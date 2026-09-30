/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ImmortalReference } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IGitHubClient } from '../../../github/common/githubService.js';
import { IAgentHostGitHubService } from '../../node/agentHostGitHubService.js';

export function createTestGitHubService(client: IGitHubClient = new class extends mock<IGitHubClient>() { }(), onDidChange: Event<void> = Event.None): IAgentHostGitHubService {
	return new class extends mock<IAgentHostGitHubService>() {
		override readonly onDidChangeRepositoryClient = onDidChange;
		override acquireRepositoryClient() { return new ImmortalReference(client); }
	}();
}
