/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { NodeRemoteResourceResponse } from '../../remote/common/electronRemoteResources.js';

type ManagedRemoteResourceRequestHandler = (request: GlobalRequest) => Promise<GlobalResponse>;
type ManagedRemoteResourceUriHandler = (url: URI) => Promise<GlobalResponse>;

export function createManagedRemoteResourceRequestHandler(
	requestRemoteResource: (url: URI) => Promise<NodeRemoteResourceResponse>,
	logService: ILogService,
): ManagedRemoteResourceRequestHandler {
	const handleUri = createManagedRemoteResourceUriHandler(requestRemoteResource, logService);
	return request => handleUri(URI.parse(request.url));
}

/**
 * Like {@link createManagedRemoteResourceRequestHandler}, but takes the {@link URI} as is. A URI
 * does not survive serialization into a `Request` unchanged, for example `URI.toString()` lowercases
 * drive letters, so callers that authorized a specific path must use this to read exactly that path.
 */
export function createManagedRemoteResourceUriHandler(
	requestRemoteResource: (url: URI) => Promise<NodeRemoteResourceResponse>,
	logService: ILogService,
): ManagedRemoteResourceUriHandler {
	const notFound = (): GlobalResponse => new Response('Not found', { status: 404 });

	return async url => {
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
