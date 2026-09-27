/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fork } from 'child_process';
import { readFileSync } from 'fs';
import { connect, createServer, Socket } from 'net';
import { dirname, join } from 'path';
import { createInterface } from 'readline';

async function createMockProxy(upstream: URL): Promise<{ url: string; dispose(): void }> {
	if (upstream.protocol !== 'http:') {
		throw new Error('The WSL mock server must use HTTP.');
	}
	const sockets = new Set<Socket>();
	const server = createServer(socket => {
		const target = connect({ host: upstream.hostname, port: Number(upstream.port || 80) });
		for (const connection of [socket, target]) {
			sockets.add(connection);
			connection.once('close', () => {
				sockets.delete(connection);
				socket.destroy();
				target.destroy();
			});
			connection.on('error', error => console.error('WSL mock proxy connection failed:', error));
		}
		socket.pipe(target).pipe(socket);
	});
	const dispose = () => {
		server.close();
		for (const socket of sockets) {
			socket.destroy();
		}
	};
	try {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				server.off('error', reject);
				resolve();
			});
		});
		server.on('error', error => {
			console.error('WSL mock proxy failed:', error);
			process.exitCode = 1;
			dispose();
		});
		const address = server.address();
		if (!address || typeof address === 'string') {
			throw new Error('The WSL mock proxy did not bind a TCP port.');
		}
		const url = new URL(upstream);
		url.hostname = '127.0.0.1';
		url.port = String(address.port);
		return { url: url.href, dispose };
	} catch (error) {
		dispose();
		throw error;
	}
}

/** Adapts the shipped IPC Agent Host to the smoke fixture's standalone startup contract. */
async function main(): Promise<void> {
	const [bootstrap, tokenFile, userDataPath] = process.argv.slice(2);
	if (!bootstrap || !tokenFile || !userDataPath) {
		throw new Error('Expected bootstrap-fork path, connection-token file, and isolated user-data path.');
	}
	const token = readFileSync(tokenFile, 'utf8').trim();
	if (!/^[0-9a-zA-Z_-]+$/.test(token)) {
		throw new Error('Invalid fixture Agent Host connection token.');
	}
	const upstream = process.env.VSCODE_SMOKE_TEST_WSL_MOCK_UPSTREAM;
	const proxy = upstream ? await createMockProxy(new URL(upstream)) : undefined;
	if (proxy) {
		process.once('exit', () => proxy.dispose());
	}
	let child: ReturnType<typeof fork>;
	try {
		child = fork(bootstrap, [
			'--type=agentHost',
			'--user-data-dir', userDataPath,
			'--log', 'trace',
			'--telemetry-level', 'off',
		], {
			execPath: process.execPath,
			execArgv: [],
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
			env: {
				...process.env,
				...(proxy ? {
					COPILOT_API_URL: proxy.url,
					COPILOT_DEBUG_GITHUB_API_URL: proxy.url,
					VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: proxy.url,
				} : {}),
				VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
				VSCODE_AGENT_HOST_PORT: '0',
				VSCODE_AGENT_HOST_HOST: '127.0.0.1',
				VSCODE_AGENT_HOST_CONNECTION_TOKEN: token,
				VSCODE_AGENT_HOST_LAUNCH_KIND: 'vscode_cli',
				VSCODE_PARENT_PID: String(process.pid),
				VSCODE_PIPE_LOGGING: 'false',
				VSCODE_HANDLES_UNCAUGHT_ERRORS: 'true',
				VSCODE_NLS_CONFIG: JSON.stringify({
					userLocale: 'en',
					osLocale: 'en',
					resolvedLanguage: 'en',
					defaultMessagesFile: join(dirname(bootstrap), 'nls.messages.json'),
				}),
			},
		});
	} catch (error) {
		proxy?.dispose();
		throw error;
	}
	let stopping = false;
	const stop = () => {
		if (!stopping) {
			stopping = true;
			if (child.connected) {
				child.disconnect();
			}
			child.kill();
			proxy?.dispose();
		}
	};
	const output = createInterface({ input: child.stdout! });
	output.on('line', line => {
		const port = /^Agent host server listening on 127\.0\.0\.1:(?<port>\d+)$/.exec(line)?.groups?.port;
		if (port) {
			process.stdout.write(`READY:${port}\n`);
			process.stdout.write(`ws://127.0.0.1:${port}?tkn=${token}\n`);
		} else {
			process.stdout.write(`${line}\n`);
		}
	});
	child.stderr!.pipe(process.stderr);
	child.on('error', error => {
		console.error(error);
		process.exitCode = 1;
		stop();
	});
	child.on('close', code => {
		proxy?.dispose();
		output.close();
		process.stdin.pause();
		process.exitCode = stopping ? 0 : code ?? 1;
	});
	if (!process.argv.includes('--ignore-stdin')) {
		process.stdin.resume();
		process.stdin.on('end', stop);
	}
	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
	process.on('exit', () => child.kill());
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
