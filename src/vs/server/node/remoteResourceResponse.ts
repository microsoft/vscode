/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas, VSCODE_AUTHORITY } from '../../base/common/network.js';

const NATIVE_WORKBENCH_ORIGIN = `${Schemas.vscodeFileResource}://${VSCODE_AUTHORITY}`;

export function getRemoteResourceResponseHeaders(requestOrigin: string | undefined, isAllowedWebEndpointOrigin: (origin: string) => boolean): Record<string, string> {
	const headers: Record<string, string> = {
		'Content-Security-Policy': `default-src 'none'; sandbox`,
		'X-Content-Type-Options': 'nosniff',
		'Vary': 'Origin',
	};

	if (requestOrigin && (requestOrigin === NATIVE_WORKBENCH_ORIGIN || isAllowedWebEndpointOrigin(requestOrigin))) {
		headers['Access-Control-Allow-Origin'] = requestOrigin;
	}

	return headers;
}
