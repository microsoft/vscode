/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestOptions, IRequestContext } from 'vs/base/parts/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { RequestChannelClient } from 'vs/platform/request/common/requestIpc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { RequestService } from 'vs/platform/request/browser/requestService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IRequestService } from 'vs/platform/request/common/request';

export class BrowserRequestService extends RequestService {

	private readonly remoteRequestChannel: RequestChannelClient | null;

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService
	) {
		super(configurationService, logService);
		const connection = remoteAgentService.getConnection();
		this.remoteRequestChannel = connection ? new RequestChannelClient(connection.getChannel('request')) : null;
	}

	async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		try {
			const context = await super.request(options, token);
			if (this.remoteRequestChannel && context.res.statusCode === 405) {
				return this.remoteRequestChannel.request(options, token);
			}
			return context;
		} catch (error) {
			if (this.remoteRequestChannel) {
				const result = await this.remoteRequestChannel.request(options, token);
				return result;
			}
			throw error;
		}
	}
}

registerSingleton(IRequestService, BrowserRequestService, true);
