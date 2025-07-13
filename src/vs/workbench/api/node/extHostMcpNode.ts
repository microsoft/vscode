/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { parseEnvFile } from '../../../base/common/envfile.js';
import { untildify } from '../../../base/common/labels.js';
import { DisposableMap } from '../../../base/common/lifecycle.js';
import * as path from '../../../base/common/path.js';
import { StreamSplitter } from '../../../base/node/nodeStreams.js';
import { findExecutable } from '../../../base/node/processes.js';
import { ILogService, LogLevel } from '../../../platform/log/common/log.js';
import { McpConnectionState, McpServerLaunch, McpServerTransportStdio, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { McpStdioStateHandler } from '../../contrib/mcp/node/mcpStdioStateHandler.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { ExtHostMcpService } from '../common/extHostMcp.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';

export class NodeExtHostMpcService extends ExtHostMcpService {
	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initDataService: IExtHostInitDataService,
		@ILogService logService: ILogService,
	) {
		super(extHostRpc, logService, initDataService);
	}

	private nodeServers = this._register(new DisposableMap<number, McpStdioStateHandler>());

	protected override _startMcp(id: number, launch: McpServerLaunch): void {
		if (launch.type === McpServerTransportType.Stdio) {
			this.startNodeMpc(id, launch);
		} else {
			super._startMcp(id, launch);
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

	private async startNodeMpc(id: number, launch: McpServerTransportStdio) {
		const onError = (err: Error | string) => this._proxy.$onDidChangeState(id, {
			state: McpConnectionState.Kind.Error,
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
			let cwd = launch.cwd ? untildify(launch.cwd, home) : home;
			if (!path.isAbsolute(cwd)) {
				cwd = path.join(home, cwd);
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
