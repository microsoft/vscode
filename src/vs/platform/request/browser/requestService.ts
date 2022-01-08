/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { request } from 'vs/base/parts/request/browser/request';
import { IRequestContext, IRequestOptions } from 'vs/base/parts/request/common/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IRequestService } from 'vs/platform/request/common/request';

/**
 * This service exposes the `request` API, while using the global
 * or configured proxy settings.
 */
export class RequestService implements IRequestService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService
	) {
	}

	request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		this.logService.trace('RequestService#request', options.url);

		if (!options.proxyAuthorization) {
			options.proxyAuthorization = this.configurationService.getValue<string>('http.proxyAuthorization');
		}

		return request(options, token);
	}

	async resolveProxy(url: string): Promise<string | undefined> {
		return undefined; // not implemented in the web
	}
}
