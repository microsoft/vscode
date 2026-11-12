/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { isLoopbackHost } from '../../remote/common/remoteHosts.js';
import { NonReconnectableTransportError } from './state/sessionTransport.js';

export class InsecureRemoteAgentHostError extends NonReconnectableTransportError {
	constructor() {
		super(localize('remoteAgentHost.secureConnectionRequired', "Remote agent hosts require a secure WebSocket connection (wss://). Use TLS or connect through an SSH or Dev Tunnel. Unencrypted connections are only allowed on loopback."));
	}
}

/** Returns the URL to connect to, rejecting plaintext destinations outside loopback. */
export function getRemoteAgentHostWebSocketUrl(address: string): URL {
	const url = new URL(address.startsWith('ws://') || address.startsWith('wss://') ? address : `ws://${address}`);
	// URL canonicalizes IPv4-mapped IPv6 addresses to hexadecimal.
	const loopback = isLoopbackHost(url.hostname)
		|| /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
		|| /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(url.hostname);
	if (url.protocol !== 'wss:' && !loopback) {
		throw new InsecureRemoteAgentHostError();
	}
	return url;
}
