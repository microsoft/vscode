/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { NodeRemoteResourceResponse } from '../../remote/common/electronRemoteResources.js';

type ManagedRemoteResourceRequestHandler = (request: GlobalRequest) => Promise<GlobalResponse>;

export function createManagedRemoteResourceRequestHandler(
	requestRemoteResource: (url: URI) => Promise<NodeRemoteResourceResponse>,
	logService: ILogService,
): ManagedRemoteResourceRequestHandler {
	const notFound = (): GlobalResponse => new Response('Not found', { status: 404 });

	return async request => {
		const url = URI.parse(request.url);
		if (!url.authority.startsWith('window:')) {
			return notFound();
		}

		try {
			const response = await requestRemoteResource(url);
			return new Response(Buffer.from(response.body, 'base64'), {
				status: response.statusCode,
				headers: response.mimeType ? { 'Content-Type': response.mimeType } : undefined
			});
		} catch (error) {
			logService.warn('error dispatching remote resource call', error);
			return new Response(null, { status: 500 });
		}
	};
}
