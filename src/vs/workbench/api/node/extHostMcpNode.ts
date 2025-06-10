/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { exec } from 'child_process';
import { parseEnvFile } from '../../../base/common/envfile.js';
import { untildify } from '../../../base/common/labels.js';
import { StreamSplitter } from '../../../base/node/nodeStreams.js';
import { findExecutable } from '../../../base/node/processes.js';
import { ILogService, LogLevel } from '../../../platform/log/common/log.js';
import { McpConnectionState, McpServerLaunch, McpServerTransportStdio, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { ExtHostMcpService } from '../common/extHostMcp.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import * as path from '../../../base/common/path.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { isWindows } from '../../../base/common/platform.js';

/**
 * Manages graceful shutdown of MCP stdio connections following the MCP specification.
 * 
 * Per spec, shutdown should:
 * 1. Close the input stream to the child process
 * 2. Wait for the server to exit, or send SIGTERM if it doesn't exit within 2 seconds
 * 3. Send SIGKILL if the server doesn't exit within 2 seconds after SIGTERM
 * 4. Allow forceful killing if called twice
 */
class McpStdioConnectionManager {
	private static readonly GRACE_TIME_MS = 2000;

	private _child: ChildProcessWithoutNullStreams | undefined;
	private _shutdownInProgress = false;
	private _shutdownTimeouts: NodeJS.Timeout[] = [];

	constructor(
		child: ChildProcessWithoutNullStreams,
		private readonly _onStateChange: (state: McpConnectionState) => void
	) {
		this._child = child;
	}

	/**
	 * Initiates graceful shutdown. If called while shutdown is already in progress,
	 * forces immediate termination.
	 */
	public stop(): void {
		if (this._shutdownInProgress) {
			// Second call - force kill immediately
			this._forceKill();
			return;
		}

		this._shutdownInProgress = true;
		this._gracefulShutdown();
	}

	private _gracefulShutdown(): void {
		if (!this._child) {
			this._onStateChange({ state: McpConnectionState.Kind.Stopped });
			return;
		}

		// Step 1: Close the input stream
		if (this._child.stdin && !this._child.stdin.destroyed) {
			try {
				this._child.stdin.end();
			} catch (error) {
				// If stdin.end() fails, continue with termination sequence
				// This can happen if the stream is already in an error state
			}
		}

		// Step 2: Wait for natural exit, then SIGTERM if needed
		const sigTermTimeout = setTimeout(() => {
			if (this._child && !this._child.killed) {
				this._sendSigterm();
			}
		}, McpStdioConnectionManager.GRACE_TIME_MS);
		this._shutdownTimeouts.push(sigTermTimeout);
	}

	private _sendSigterm(): void {
		if (!this._child) {
			return;
		}

		if (!isWindows) {
			this._child.kill('SIGTERM');
		} else {
			// Use taskkill for Windows
			this._windowsKill(this._child.pid);
		}

		// Step 3: Wait for exit after SIGTERM, then SIGKILL if needed
		const sigKillTimeout = setTimeout(() => {
			if (this._child && !this._child.killed) {
				this._forceKill();
			}
		}, McpStdioConnectionManager.GRACE_TIME_MS);
		this._shutdownTimeouts.push(sigKillTimeout);
	}

	private _forceKill(): void {
		if (!this._child) {
			return;
		}

		if (!isWindows) {
			this._child.kill('SIGKILL');
		} else {
			// Force kill on Windows
			this._windowsKill(this._child.pid, true);
		}
	}

	private _windowsKill(pid: number | undefined, force = false): void {
		if (!pid) {
			return;
		}

		const windir = process.env['WINDIR'] || 'C:\\Windows';
		const taskKill = path.join(windir, 'System32', 'taskkill.exe');
		const args = force ? `/F /T /PID ${pid}` : `/T /PID ${pid}`;

		exec(`"${taskKill}" ${args}`, (error) => {
			if (error && this._child) {
				// Fallback to Node.js kill if taskkill fails
				this._child.kill(force ? 'SIGKILL' : 'SIGTERM');
			}
		});
	}

	public dispose(): void {
		this._clearTimeouts();
		this._child = undefined;
	}

	private _clearTimeouts(): void {
		this._shutdownTimeouts.forEach(timeout => clearTimeout(timeout));
		this._shutdownTimeouts = [];
	}
}

export class NodeExtHostMpcService extends ExtHostMcpService {
	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initDataService: IExtHostInitDataService,
		@ILogService logService: ILogService,
	) {
		super(extHostRpc, logService, initDataService);
	}

	private nodeServers = new Map<number, {
		connectionManager: McpStdioConnectionManager;
		child: ChildProcessWithoutNullStreams;
	}>();

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
			nodeServer.connectionManager.stop();
			nodeServer.connectionManager.dispose();
			this.nodeServers.delete(id);
		} else {
			super.$stopMcp(id);
		}
	}

	override $sendMessage(id: number, message: string): void {
		const nodeServer = this.nodeServers.get(id);
		if (nodeServer) {
			nodeServer.child.stdin.write(message + '\n');
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

		const onStateChange = (state: McpConnectionState) => this._proxy.$onDidChangeState(id, state);

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
		const connectionManager = new McpStdioConnectionManager(child, onStateChange);

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
			// Clean up the connection manager when process exits
			connectionManager.dispose();
			this.nodeServers.delete(id);
			
			if (code === 0) {
				this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Stopped });
			} else {
				this._proxy.$onDidChangeState(id, {
					state: McpConnectionState.Kind.Error,
					message: `Process exited with code ${code}`,
				});
			}
		});

		this.nodeServers.set(id, { connectionManager, child });
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
