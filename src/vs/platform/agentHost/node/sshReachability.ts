/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import type { SSHHostReachability } from '../common/sshRemoteAgentHost.js';

/** RFC 4253 limits the identification string and any preceding lines; stop reading well before that bound. */
const MAX_GREETING_LENGTH = 8192;

/**
 * Opens a TCP connection and waits for an SSH identification string
 * (`SSH-...`). Never authenticates or sends data. Refused connections,
 * lookup failures, timeouts, and non-SSH responses are all `unreachable`.
 */
export function probeSSHServer(host: string, port: number, timeoutMs: number): Promise<SSHHostReachability> {
	return new Promise(resolve => {
		const socket = net.connect({ host, port });
		let greeting = '';
		let settled = false;
		const finish = (result: SSHHostReachability) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				socket.destroy();
				resolve(result);
			}
		};
		const timer = setTimeout(() => finish('unreachable'), timeoutMs);
		socket.setEncoding('latin1');
		socket.on('data', (chunk: string) => {
			greeting += chunk;
			if (greeting.split('\n').some(line => line.startsWith('SSH-'))) {
				finish('reachable');
			} else if (greeting.length > MAX_GREETING_LENGTH) {
				finish('unreachable');
			}
		});
		socket.on('error', () => finish('unreachable'));
		socket.on('close', () => finish('unreachable'));
	});
}
