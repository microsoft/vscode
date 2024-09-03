/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestOptions, IRequestContext } from '../../../../base/parts/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { RequestChannelClient } from '../../../../platform/request/common/requestIpc.js';
import { IRemoteAgentService, IRemoteAgentConnection } from '../../remote/common/remoteAgentService.js';
import { RequestService } from '../../../../platform/request/browser/requestService.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';

export class BrowserRequestService extends RequestService {

	constructor(
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILoggerService loggerService: ILoggerService
	) {
		super(configurationService, loggerService);
	}

	override async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		try {
			const context = await super.request(options, token);
			const connection = this.remoteAgentService.getConnection();
			if (connection && context.res.statusCode === 405) {
				return this._makeRemoteRequest(connection, options, token);
			}
			return context;
		} catch (error) {
			const connection = this.remoteAgentService.getConnection();
			if (connection) {
				return this._makeRemoteRequest(connection, options, token);
			}
			throw error;
		}
	}

	private _makeRemoteRequest(connection: IRemoteAgentConnection, options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		return connection.withChannel('request', channel => new RequestChannelClient(channel).request(options, token));
	}
}

// --- Internal commands to help authentication for extensions

CommandsRegistry.registerCommand('_workbench.fetchJSON', async function (accessor: ServicesAccessor, url: string, method: string) {
	const result = await fetch(url, { method, headers: { Accept: 'application/json' } });

	if (result.ok) {
		return result.json();
	} else {
		throw new Error(result.statusText);
	}
});
