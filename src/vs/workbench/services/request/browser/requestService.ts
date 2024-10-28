/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestOptions, IRequestContext } from '../../../../base/parts/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { RequestChannelClient } from '../../../../platform/request/common/requestIpc.js';
import { IRemoteAgentService, IRemoteAgentConnection } from '../../remote/common/remoteAgentService.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { AbstractRequestService, AuthInfo, Credentials, IRequestService } from '../../../../platform/request/common/request.js';
import { request } from '../../../../base/parts/request/browser/request.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class BrowserRequestService extends AbstractRequestService implements IRequestService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		super(logService);
	}

	async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		try {
			if (!options.proxyAuthorization) {
				options.proxyAuthorization = this.configurationService.getValue<string>('http.proxyAuthorization');
			}
			const context = await this.logAndRequest(options, () => request(options, token));

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

	async resolveProxy(url: string): Promise<string | undefined> {
		return undefined; // not implemented in the web
	}

	async lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		return undefined; // not implemented in the web
	}

	async lookupKerberosAuthorization(url: string): Promise<string | undefined> {
		return undefined; // not implemented in the web
	}

	async loadCertificates(): Promise<string[]> {
		return []; // not implemented in the web
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
