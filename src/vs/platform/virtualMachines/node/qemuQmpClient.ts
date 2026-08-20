/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';

/**
 * Minimal QMP (QEMU Machine Protocol) client over a unix socket, used to
 * request a graceful ACPI power-down of a virtual machine.
 */
export async function qmpPowerDown(socketPath: string, timeoutMs: number): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		let buffer = '';
		let greeted = false;
		let negotiated = false;
		let done = false;

		const finish = (ok: boolean) => {
			if (!done) {
				done = true;
				clearTimeout(timer);
				socket.destroy();
				resolve(ok);
			}
		};

		const socket = net.createConnection(socketPath);
		const timer = setTimeout(() => finish(false), timeoutMs);
		socket.on('error', () => finish(false));

		const send = (command: string) => socket.write(JSON.stringify({ execute: command }) + '\n');

		socket.on('data', chunk => {
			buffer += chunk.toString('utf8');
			let index: number;
			while ((index = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, index).trim();
				buffer = buffer.slice(index + 1);
				if (!line) {
					continue;
				}
				let message: { QMP?: unknown; return?: unknown; error?: unknown };
				try {
					message = JSON.parse(line);
				} catch {
					continue;
				}
				if (message.QMP && !greeted) {
					greeted = true;
					send('qmp_capabilities');
				} else if (greeted && !negotiated && message.return !== undefined) {
					negotiated = true;
					send('system_powerdown');
				} else if (negotiated && message.return !== undefined) {
					finish(true);
				} else if (message.error) {
					finish(false);
				}
			}
		});
	});
}
