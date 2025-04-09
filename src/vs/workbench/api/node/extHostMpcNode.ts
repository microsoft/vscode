/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { parseEnvFile } from '../../../base/common/envfile.js';
import { URI } from '../../../base/common/uri.js';
import { StreamSplitter } from '../../../base/node/nodeStreams.js';
import { LogLevel } from '../../../platform/log/common/log.js';
import { McpConnectionState, McpServerLaunch, McpServerTransportStdio, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { ExtHostMcpService } from '../common/extHostMcp.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { findExecutable } from '../../../base/node/processes.js';

export class NodeExtHostMpcService extends ExtHostMcpService {
	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		super(extHostRpc);
	}

	private nodeServers = new Map<number, {
		abortCtrl: AbortController;
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
			nodeServer.abortCtrl.abort();
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

		const abortCtrl = new AbortController();
		let child: ChildProcessWithoutNullStreams;
		try {
			const cwd = launch.cwd ? URI.revive(launch.cwd).fsPath : homedir();
			const { executable, args, shell } = await formatSubprocessArguments(launch.command, launch.args, cwd, env);
			this._proxy.$onDidPublishLog(id, LogLevel.Debug, `Server command line: ${executable} ${args.join(' ')}`);
			child = spawn(executable, args, {
				stdio: 'pipe',
				cwd: launch.cwd ? URI.revive(launch.cwd).fsPath : homedir(),
				signal: abortCtrl.signal,
				env,
				shell,
			});
		} catch (e) {
			onError(e);
			abortCtrl.abort();
			return;
		}

		this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Starting });

		child.stdout.pipe(new StreamSplitter('\n')).on('data', line => this._proxy.$onDidReceiveMessage(id, line.toString()));

		child.stdin.on('error', onError);
		child.stdout.on('error', onError);

		// Stderr handling is not currently specified https://github.com/modelcontextprotocol/specification/issues/177
		// Just treat it as generic log data for now
		child.stderr.pipe(new StreamSplitter('\n')).on('data', line => this._proxy.$onDidPublishLog(id, LogLevel.Warning, `[server stderr] ${line.toString().trimEnd()}`));

		child.on('spawn', () => this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Running }));

		child.on('error', e => {
			if (abortCtrl.signal.aborted) {
				this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Stopped });
			} else {
				onError(e);
			}
		});
		child.on('exit', code =>
			code === 0 || abortCtrl.signal.aborted
				? this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Stopped })
				: this._proxy.$onDidChangeState(id, {
					state: McpConnectionState.Kind.Error,
					message: `Process exited with code ${code}`,
				})
		);

		this.nodeServers.set(id, { abortCtrl, child });
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
