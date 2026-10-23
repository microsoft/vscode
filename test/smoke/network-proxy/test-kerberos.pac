/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

function FindProxyForURL(url, host) {
	// Keep the Actions runner control plane off the authenticated proxy. The smoke-test
	// process cannot use this DIRECT route because PF blocks its non-loopback traffic.
	if (
		dnsDomainIs(host, '.actions.githubusercontent.com') ||
		shExpMatch(host, 'cloudtest*.queue.core.windows.net') ||
		dnsDomainIs(host, '.prod.cloudtest.microsoft.com')
	) {
		return 'DIRECT';
	}

	return 'PROXY localhost:43144';
}
