/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../base/common/uuid.js';

export function generateNonce(): string {
	return generateUuid();
}

export function isLocalhost(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function buildProxyUrl(targetUrl: URL, proxyOrigin: string): string {
	const proxiedUrl = new URL(targetUrl.toString());
	const proxy = new URL(proxyOrigin);
	proxiedUrl.protocol = proxy.protocol;
	proxiedUrl.hostname = proxy.hostname;
	proxiedUrl.port = proxy.port;
	return proxiedUrl.toString();
}

