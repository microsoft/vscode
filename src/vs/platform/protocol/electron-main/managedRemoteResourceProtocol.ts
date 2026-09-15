/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProtocolRequest, ProtocolResponse } from 'electron';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { NodeRemoteResourceResponse } from '../../remote/common/electronRemoteResources.js';

type ManagedRemoteResourceRequestHandler = (request: ProtocolRequest, callback: (response: Buffer | ProtocolResponse) => void) => void;

export function createManagedRemoteResourceRequestHandler(
	requestRemoteResource: (url: URI) => Promise<NodeRemoteResourceResponse>,
	logService: ILogService,
): ManagedRemoteResourceRequestHandler {
	const notFound = (): ProtocolResponse => ({ statusCode: 404, data: Buffer.from('Not found') });

	return (request, callback) => {
		const url = URI.parse(request.url);
		if (!url.authority.startsWith('window:')) {
			return callback(notFound());
		}

		requestRemoteResource(url).then(
			response => callback({ ...response, data: Buffer.from(response.body, 'base64') }),
			error => {
				logService.warn('error dispatching remote resource call', error);
				callback({ statusCode: 500, data: Buffer.from(String(error)) });
			});
	};
}
