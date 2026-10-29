/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise } from '../../../base/common/async.js';
import { dirname, join } from '../../../base/common/path.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { StreamSplitter } from '../../../base/node/nodeStreams.js';
import { ChildProcess, spawn, SpawnOptions, StdioOptions } from 'child_process';
import { homedir } from 'os';

/** Callback for a single line of CLI output. */
export type CodeTunnelCliOutput = (message: string, isError: boolean) => void;

/** A running tunnel CLI invocation and its actual-process lifetime. */
export interface ICodeTunnelCliRun {
	/** Resolves with the process exit code; rejects if the process could not be spawned. */
	readonly result: CancelablePromise<number>;
	/** Kills the process if needed and resolves after its `exit` or `error` event. */
	stop(): Promise<void>;
}

/** How long a stopped CLI process gets to exit before it is force-killed. */
const STOP_GRACE_PERIOD_MS = 5_000;

/** Injectable process-spawning implementation for the tunnel CLI. */
export type CodeTunnelSpawn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

/** Resolves the absolute path of a tunnel CLI binary for an installation. */
export function resolveTunnelCommandLocation(appRoot: string, platform: NodeJS.Platform, tunnelApplicationName: string | undefined, win32VersionedUpdate: boolean): string {
	let binParentLocation: string;
	if (platform === 'darwin') {
		binParentLocation = appRoot;
	} else if (platform === 'win32') {
		binParentLocation = win32VersionedUpdate ? dirname(dirname(dirname(appRoot))) : dirname(dirname(appRoot));
	} else {
		binParentLocation = dirname(dirname(appRoot));
	}
	return join(binParentLocation, 'bin', `${tunnelApplicationName}${platform === 'win32' ? '.exe' : ''}`);
}

/** How to reach and run a VS Code installation's bundled CLI. */
export interface ICodeTunnelCliOptions {
	readonly appRoot: string;
	readonly isBuilt: boolean;
	readonly tunnelApplicationName: string | undefined;
	readonly win32VersionedUpdate: boolean;
	/** Injectable for tests; defaults to the real `child_process.spawn`. */
	readonly spawn?: CodeTunnelSpawn;
	/** Receives the service's own diagnostics, separate from CLI output. */
	readonly onLog?: (message: string) => void;
}

/** Runs the code-tunnel CLI for a VS Code installation. */
export class CodeTunnelCli {

	private _commandLocation: string | undefined;
	private readonly _spawn: CodeTunnelSpawn;
	private readonly _onLog: (message: string) => void;

	constructor(private readonly _options: ICodeTunnelCliOptions) {
		this._spawn = _options.spawn ?? spawn;
		this._onLog = _options.onLog ?? (() => { });
	}

	/** Absolute path of the `code-tunnel` binary for this installation. */
	get commandLocation(): string {
		if (!this._commandLocation) {
			this._commandLocation = resolveTunnelCommandLocation(
				this._options.appRoot,
				isWindows ? 'win32' : isMacintosh ? 'darwin' : 'linux',
				this._options.tunnelApplicationName,
				this._options.win32VersionedUpdate
			);
		}
		return this._commandLocation;
	}

	/** Runs the code CLI with the specified complete command arguments. */
	run(logLabel: string, args: readonly string[], onOutput: CodeTunnelCliOutput, env?: Record<string, string>): ICodeTunnelCliRun {
		let tunnelProcess: ChildProcess | undefined;
		let didStop = false;
		let resolveExit: (() => void) | undefined;
		const exited = new Promise<void>(resolve => resolveExit = resolve);
		const stop = (): Promise<void> => {
			if (tunnelProcess && !didStop) {
				didStop = true;
				const child = tunnelProcess;
				this._onLog(`${logLabel} terminating(${child.pid})`);
				child.kill();
				// Callers serialize on this promise, so a CLI that ignores the
				// termination signal would wedge them forever. Escalate instead
				// of waiting indefinitely: SIGKILL cannot be caught, so `exit`
				// always follows and `exited` always settles.
				const forceKill = setTimeout(() => {
					this._onLog(`${logLabel} did not exit within ${STOP_GRACE_PERIOD_MS}ms, force killing(${child.pid})`);
					child.kill('SIGKILL');
				}, STOP_GRACE_PERIOD_MS);
				void exited.finally(() => clearTimeout(forceKill));
			}
			return exited;
		};
		const result = createCancelablePromise<number>(token => {
			return new Promise((resolve, reject) => {
				if (token.isCancellationRequested) {
					resolve(-1);
				}
				const stdio: StdioOptions = ['ignore', 'pipe', 'pipe'];

				const cancellationListener = token.onCancellationRequested(() => {
					void stop();
				});
				try {
					if (!this._options.isBuilt) {
						onOutput('Building tunnel CLI from sources and run\n', false);
						onOutput(`${logLabel} Spawning: cargo run -- ${args.join(' ')}\n`, false);
						tunnelProcess = this._spawn('cargo', ['run', '--', ...args], { cwd: join(this._options.appRoot, 'cli'), stdio, env: { ...process.env, RUST_BACKTRACE: '1', ...env } });
					} else {
						onOutput('Running tunnel CLI\n', false);
						const tunnelCommand = this.commandLocation;
						onOutput(`${logLabel} Spawning: ${tunnelCommand} ${args.join(' ')}\n`, false);
						tunnelProcess = this._spawn(tunnelCommand, args, { cwd: homedir(), stdio, env: { ...process.env, ...env } });
					}
				} catch (error) {
					cancellationListener.dispose();
					resolveExit?.();
					reject(error);
					return;
				}

				tunnelProcess.stdout!.pipe(new StreamSplitter('\n')).on('data', data => {
					if (tunnelProcess) {
						onOutput(data.toString(), false);
					}
				});
				tunnelProcess.stderr!.pipe(new StreamSplitter('\n')).on('data', data => {
					if (tunnelProcess) {
						onOutput(data.toString(), true);
					}
				});
				tunnelProcess.on('exit', e => {
					if (tunnelProcess) {
						cancellationListener.dispose();
						onOutput(`${logLabel} exit(${tunnelProcess.pid}): + ${e} `, false);
						tunnelProcess = undefined;
						resolveExit?.();
						resolve(e || 0);
					}
				});
				tunnelProcess.on('error', e => {
					if (tunnelProcess) {
						cancellationListener.dispose();
						onOutput(`${logLabel} error(${tunnelProcess.pid}): + ${e} `, true);
						tunnelProcess = undefined;
						resolveExit?.();
						reject(e);
					}
				});
			});
		});
		return { result, stop };
	}
}
