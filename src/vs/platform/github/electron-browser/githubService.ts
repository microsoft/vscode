/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { ISharedProcessService } from '../../ipc/electron-browser/services.js';
import { ILogService } from '../../log/common/log.js';
import { IGitHubAccountClient } from '../common/account/account.js';
import { IGitHubAnonymousClient } from '../common/anonymous/anonymous.js';
import { GitHubAuthorizationContext } from '../common/githubTypes.js';
import { GITHUB_CHANNEL_NAME, GITHUB_CREDENTIALS_CHANNEL_NAME, IGitHubCredentialBroker, ISharedProcessGitHubService } from '../common/remote/ipc.js';
import { GitHubChannelClient, GitHubCredentialsChannel } from '../common/remote/ipcClient.js';

class SharedProcessGitHubService extends Disposable implements ISharedProcessGitHubService {
	declare readonly _serviceBrand: undefined;
	private readonly client: GitHubChannelClient;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IGitHubCredentialBroker credentialBroker: IGitHubCredentialBroker,
		@ILogService logService: ILogService,
	) {
		super();
		sharedProcessService.registerChannel(GITHUB_CREDENTIALS_CHANNEL_NAME, this._register(new GitHubCredentialsChannel(credentialBroker)));
		this.client = new GitHubChannelClient(sharedProcessService.getChannel(GITHUB_CHANNEL_NAME), logService);
	}

	acquireAnonymousClient(signal: AbortSignal): Promise<IGitHubAnonymousClient> {
		return this.client.acquireAnonymousClient(signal);
	}

	acquireClient(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<IGitHubAccountClient> {
		return this.client.acquireClient(authorization, signal);
	}
}

registerSingleton(ISharedProcessGitHubService, SharedProcessGitHubService, InstantiationType.Delayed);
