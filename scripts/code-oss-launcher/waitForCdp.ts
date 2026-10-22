/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Waits until Code OSS's CDP endpoint responds. Imported by the launcher; the standalone command
// `waitForCdp.ts <pid> <port> [timeout-ms]` prints the elapsed milliseconds and
// exits with 0 when ready, 1 on timeout, and 2 when the process exited first.

import http from 'node:http';
import process from 'node:process';

export type CdpWaitResult = { readonly status: 'ready'; readonly elapsedMs: number } | { readonly status: 'timeout' | 'exited' };

export async function waitForCdp(pid: number, port: number, timeoutMs: number): Promise<CdpWaitResult> {
	const start = performance.now();
	while (performance.now() - start < timeoutMs) {
		if (!isProcessRunning(pid)) {
			return { status: 'exited' };
		}

		const remainingMs = timeoutMs - (performance.now() - start);
		if (await probe(port, Math.min(200, remainingMs)) && performance.now() - start < timeoutMs && isProcessRunning(pid)) {
			return { status: 'ready', elapsedMs: Math.round(performance.now() - start) };
		}

		await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, timeoutMs - (performance.now() - start)))));
	}
	return { status: 'timeout' };
}

function isProcessRunning(pid: number): boolean {
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

function probe(port: number, requestTimeoutMs: number): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		let settled = false;
		const finish = (ready: boolean) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				request.destroy();
				resolve(ready);
			}
		};
		const request = http.get({ host: '127.0.0.1', port, path: '/json/version' }, response => {
			if (response.statusCode !== 200) {
				response.resume();
				finish(false);
				return;
			}
			let body = '';
			response.setEncoding('utf8');
			response.on('data', (chunk: string) => {
				body += chunk;
				if (body.length > 64 * 1024) {
					response.destroy();
					finish(false);
				}
			});
			response.on('end', () => {
				try {
					const version: { webSocketDebuggerUrl?: string } = JSON.parse(body);
					finish(typeof version?.webSocketDebuggerUrl === 'string' && /^wss?:\/\//.test(version.webSocketDebuggerUrl));
				} catch {
					finish(false);
				}
			});
			response.on('error', () => finish(false));
		});
		const timer = setTimeout(() => finish(false), requestTimeoutMs);
		request.on('error', () => finish(false));
	});
}

if (import.meta.main) {
	const [pidArg, portArg, timeoutArg = '90000'] = process.argv.slice(2);
	const pid = Number(pidArg);
	const port = Number(portArg);
	const timeoutMs = Number(timeoutArg);

	if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(port) || port <= 0 || port > 65535 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		console.error('Usage: waitForCdp.ts <pid> <port> [timeout-ms]');
		process.exit(3);
	}

	const result = await waitForCdp(pid, port, timeoutMs);
	if (result.status === 'ready') {
		process.stdout.write(String(result.elapsedMs));
		process.exit(0);
	}
	process.exit(result.status === 'timeout' ? 1 : 2);
}
