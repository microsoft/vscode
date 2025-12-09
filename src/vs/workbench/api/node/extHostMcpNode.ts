/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import type { RequestInit as UndiciRequestInit } from 'undici';
import { parseEnvFile } from '../../../base/common/envfile.js';
import { untildify } from '../../../base/common/labels.js';
import { Lazy } from '../../../base/common/lazy.js';
import { DisposableMap } from '../../../base/common/lifecycle.js';
import * as path from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { StreamSplitter } from '../../../base/node/nodeStreams.js';
import { findExecutable } from '../../../base/node/processes.js';
import { LogLevel } from '../../../platform/log/common/log.js';
import { McpConnectionState, McpServerLaunch, McpServerTransportStdio, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { McpStdioStateHandler } from '../../contrib/mcp/node/mcpStdioStateHandler.js';
import { CommonRequestInit, CommonResponse, ExtHostMcpService, McpHTTPHandle } from '../common/extHostMcp.js';

export class NodeExtHostMpcService extends ExtHostMcpService {
	private nodeServers = this._register(new DisposableMap<number, McpStdioStateHandler>());

	protected override _startMcp(id: number, launch: McpServerLaunch, defaultCwd?: URI, errorOnUserInteraction?: boolean): void {
		if (launch.type === McpServerTransportType.Stdio) {
			this.startNodeMpc(id, launch, defaultCwd);
		} else if (launch.type === McpServerTransportType.HTTP) {
			this._sseEventSources.set(id, new McpHTTPHandleNode(id, launch, this._proxy, this._logService, errorOnUserInteraction));
		} else {
			super._startMcp(id, launch, defaultCwd, errorOnUserInteraction);
		}
	}

	override $stopMcp(id: number): void {
		const nodeServer = this.nodeServers.get(id);
		if (nodeServer) {
			nodeServer.stop(); // will get removed from map when process is fully stopped
		} else {
			super.$stopMcp(id);
		}
	}

	override $sendMessage(id: number, message: string): void {
		const nodeServer = this.nodeServers.get(id);
		if (nodeServer) {
			nodeServer.write(message);
		} else {
			super.$sendMessage(id, message);
		}
	}

	private async startNodeMpc(id: number, launch: McpServerTransportStdio, defaultCwd?: URI): Promise<void> {
		const onError = (err: Error | string) => this._proxy.$onDidChangeState(id, {
			state: McpConnectionState.Kind.Error,
			// eslint-disable-next-line local/code-no-any-casts
			code: err.hasOwnProperty('code') ? String((err as any).code) : undefined,
			message: typeof err === 'string' ? err : err.message,
		});

		// MCP servers are run on the same authority where they are defined, so
		// reading the envfile based on its path off the filesystem here is fine.
		const env = { ...process.env };
		if (launch.envFile) {
			try {
				for (const [key, value] of parseEnvFile(await readFile(launch.envFile, 'utf-8'))) {
					env[key] = value;
				}
			} catch (e) {
				onError(`Failed to read envFile '${launch.envFile}': ${e.message}`);
				return;
			}
		}
		for (const [key, value] of Object.entries(launch.env)) {
			env[key] = value === null ? undefined : String(value);
		}

		let child: ChildProcessWithoutNullStreams;
		try {
			const home = homedir();
			let cwd = launch.cwd ? untildify(launch.cwd, home) : (defaultCwd?.fsPath || home);
			if (!path.isAbsolute(cwd)) {
				cwd = defaultCwd ? path.join(defaultCwd.fsPath, cwd) : path.join(home, cwd);
			}

			const { executable, args, shell } = await formatSubprocessArguments(
				untildify(launch.command, home),
				launch.args.map(a => untildify(a, home)),
				cwd,
				env
			);

			this._proxy.$onDidPublishLog(id, LogLevel.Debug, `Server command line: ${executable} ${args.join(' ')}`);
			child = spawn(executable, args, {
				stdio: 'pipe',
				cwd,
				env,
				shell,
			});
		} catch (e) {
			onError(e);
			return;
		}

		// Create the connection manager for graceful shutdown
		const connectionManager = new McpStdioStateHandler(child);

		this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Starting });

		child.stdout.pipe(new StreamSplitter('\n')).on('data', line => this._proxy.$onDidReceiveMessage(id, line.toString()));

		child.stdin.on('error', onError);
		child.stdout.on('error', onError);

		// Stderr handling is not currently specified https://github.com/modelcontextprotocol/specification/issues/177
		// Just treat it as generic log data for now
		child.stderr.pipe(new StreamSplitter('\n')).on('data', line => this._proxy.$onDidPublishLog(id, LogLevel.Warning, `[server stderr] ${line.toString().trimEnd()}`));

		child.on('spawn', () => this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Running }));

		child.on('error', e => {
			onError(e);
		});
		child.on('exit', code => {
			this.nodeServers.deleteAndDispose(id);

			if (code === 0 || connectionManager.stopped) {
				this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Stopped });
			} else {
				this._proxy.$onDidChangeState(id, {
					state: McpConnectionState.Kind.Error,
					message: `Process exited with code ${code}`,
				});
			}
		});

		this.nodeServers.set(id, connectionManager);
	}
}

class McpHTTPHandleNode extends McpHTTPHandle {
	private readonly _undici = new Lazy(() => import('undici'));

	protected override async _fetchInternal(url: string, init?: CommonRequestInit): Promise<CommonResponse> {
		// Note: imported async so that we can ensure we load undici after proxy patches have been applied
		const { fetch, Agent } = await this._undici.value;

		const undiciInit: UndiciRequestInit = { ...init };

		let httpUrl = url;
		const uri = URI.parse(url);

		if (uri.scheme === 'unix' || uri.scheme === 'pipe') {
			// By convention, we put the *socket path* as the URI path, and the *request path* in the fragment
			// So, set the dispatcher with the socket path
			undiciInit.dispatcher = new Agent({
				socketPath: uri.path,
			});

			// And then rewrite the URL to be http://localhost/<fragment>
			httpUrl = uri.with({
				scheme: 'http',
				authority: 'localhost', // HTTP always wants a host (not that we're using it), but if we're using a socket or pipe then localhost is sorta right anyway
				path: uri.fragment,
			}).toString(true);
		} else {
			return super._fetchInternal(url, init);
		}

		const undiciResponse = await fetch(httpUrl, undiciInit);

		return {
			status: undiciResponse.status,
			statusText: undiciResponse.statusText,
			headers: undiciResponse.headers,
			body: undiciResponse.body as ReadableStream, // Way down in `ReadableStreamReadDoneResult<T>`, `value` is optional in the undici type but required (yet can be `undefined`) in the standard type
			url: undiciResponse.url,
			json: () => undiciResponse.json(),
			text: () => undiciResponse.text(),
		};
	}
}

const windowsShellScriptRe = /\.(bat|cmd)$/i;

/**
 * Formats arguments to avoid issues on Windows for CVE-2024-27980.
 */
export const formatSubprocessArguments = async (
	executable: string,
	args: ReadonlyArray<string>,
	cwd: string | undefined,
	env: Record<string, string | undefined>,
) => {
	if (process.platform !== 'win32') {
		return { executable, args, shell: false };
	}

	const found = await findExecutable(executable, cwd, undefined, env);
	if (found && windowsShellScriptRe.test(found)) {
		const quote = (s: string) => s.includes(' ') ? `"${s}"` : s;
		return {
			executable: quote(found),
			args: args.map(quote),
			shell: true,
		};
	}

	return { executable, args, shell: false };
};
