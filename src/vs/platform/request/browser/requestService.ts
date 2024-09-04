/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { request } from '../../../base/parts/request/browser/request.js';
import { IRequestContext, IRequestOptions } from '../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILoggerService } from '../../log/common/log.js';
import { AbstractRequestService, AuthInfo, Credentials, IRequestService } from '../common/request.js';

/**
 * This service exposes the `request` API, while using the global
 * or configured proxy settings.
 */
export class RequestService extends AbstractRequestService implements IRequestService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILoggerService loggerService: ILoggerService
	) {
		super(loggerService);
	}

	async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		if (!options.proxyAuthorization) {
			options.proxyAuthorization = this.configurationService.getValue<string>('http.proxyAuthorization');
		}
		return this.logAndRequest('browser', options, () => request(options, token));
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
}
