/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestOptions, IRequestContext } from '../../../../base/parts/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { MANAGED_SETTINGS_REQUEST_CALL_SITE } from '../../../../platform/defaultAccount/common/managedSettingsRequestIpc.js';
import { RequestChannelClient } from '../../../../platform/request/common/requestIpc.js';
import { IRemoteAgentService, IRemoteAgentConnection } from '../../remote/common/remoteAgentService.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { AbstractRequestService, AuthInfo, Credentials, IRequestService, readHeader } from '../../../../platform/request/common/request.js';
import { request } from '../../../../base/parts/request/common/requestImpl.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { localize } from '../../../../nls.js';
import { LogService } from '../../../../platform/log/common/logService.js';
import { windowLogGroup } from '../../log/common/logConstants.js';

export class BrowserRequestService extends AbstractRequestService implements IRequestService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILoggerService loggerService: ILoggerService,
	) {
		const logger = loggerService.createLogger(`network`, { name: localize('network', "Network"), group: windowLogGroup });
		const logService = new LogService(logger);
		super(logService);
		this._register(logger);
		this._register(logService);
	}

	async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		const connection = this.remoteAgentService.getConnection();
		if (options.callSite === MANAGED_SETTINGS_REQUEST_CALL_SITE && readHeader(options.headers, 'User-Agent')) {
			if (!connection) {
				throw new Error('Cannot send an explicit User-Agent without a remote request service');
			}
			return this._makeRemoteRequest(connection, options, token);
		}

		try {
			if (!options.proxyAuthorization) {
				options.proxyAuthorization = this.configurationService.inspect<string>('http.proxyAuthorization').userLocalValue;
			}
			const context = await this.logAndRequest(options, () => request(options, token, () => navigator.onLine));

			if (connection && context.res.statusCode === 405) {
				return this._makeRemoteRequest(connection, options, token);
			}
			return context;
		} catch (error) {
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
