#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from 'node:http';
import process from 'node:process';

const [pidArg, portArg, path = '/health', timeoutArg = '30000'] = process.argv.slice(2);
const pid = Number(pidArg);
const port = Number(portArg);
const timeoutMs = Number(timeoutArg);

if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(port) || port <= 0 || port > 65535 ||
	!path.startsWith('/') || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
	console.error('Usage: waitForHttp.ts <pid> <port> [path] [timeout-ms]');
	process.exit(3);
}

const start = performance.now();

function isProcessRunning(): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
			return false;
		}
		throw error;
	}
}

function probe(requestTimeoutMs: number): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		let settled = false;
		const request = http.get({ host: '127.0.0.1', port, path }, response => {
			response.resume();
			finish(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 400);
		});
		const timer = setTimeout(() => finish(false), requestTimeoutMs);
		const finish = (ready: boolean) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			request.destroy();
			resolve(ready);
		};
		request.on('error', () => finish(false));
	});
}

while (performance.now() - start < timeoutMs) {
	if (!isProcessRunning()) {
		process.exit(2);
	}

	const remainingMs = timeoutMs - (performance.now() - start);
	if (await probe(Math.min(200, remainingMs)) && performance.now() - start < timeoutMs) {
		process.stdout.write(String(Math.round(performance.now() - start)));
		process.exit(0);
	}

	await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, timeoutMs - (performance.now() - start)))));
}

process.exit(1);
