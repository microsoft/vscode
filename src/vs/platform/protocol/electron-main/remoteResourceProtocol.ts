/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { net } from 'electron';
import { Schemas } from '../../../base/common/network.js';
import { ILogService } from '../../log/common/log.js';

type RemoteResourceRequestHandler = (request: GlobalRequest) => Promise<GlobalResponse>;

export function createRemoteResourceRequestHandler(logService: ILogService): RemoteResourceRequestHandler {
	return async request => {
		try {
			return await net.fetch(
				request.url.replace(`${Schemas.vscodeRemoteResource}:`, `${Schemas.http}:`),
				{
					method: request.method,
					headers: request.headers,
					body: request.body,
					bypassCustomProtocolHandlers: true
				}
			);
		} catch (error) {
			logService.warn('error loading remote resource', error);
			return Response.error();
		}
	};
}
