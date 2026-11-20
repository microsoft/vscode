/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { Duplex } from 'stream';
import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { killTree } from '../../../base/node/processes.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { shellEscape } from './sshRemoteAgentHostHelpers.js';

/** Expands OpenSSH proxy tokens without interpreting host or user names as shell syntax. */
export function expandSSHProxyCommand(command: string, host: string, originalHost: string, port: number, user: string, windows = process.platform === 'win32'): string {
	const tokens: Readonly<Record<string, string>> = { h: host, n: originalHost, p: String(port), r: user };
	let quote: '\'' | '"' | undefined;
	let result = '';
	for (let index = 0; index < command.length; index++) {
		const char = command[index];
		if (char === '%') {
			const token = command[++index];
			if (token === '%') {
				result += '%';
				continue;
			}
			const value = tokens[token];
			if (value === undefined) {
				throw new Error(localize('sshProxyUnsupportedToken', "Unsupported SSH ProxyCommand token: %{0}", token ?? ''));
			}
			if (windows) {
				if (/[%!^&|<>()"\r\n]/.test(value)) {
					throw new Error(localize('sshProxyUnsafeToken', "SSH ProxyCommand cannot safely expand this host or username on Windows."));
				}
				result += quote === '"' ? value : `"${value}"`;
			} else {
				result += quote === '\''
					? value.replace(/'/g, '\'\\\'\'')
					: quote === '"'
						? value.replace(/["\\$`]/g, '\\$&')
						: shellEscape(value);
			}
		} else {
			result += char;
			if (!windows && char === '\\' && quote !== '\'') {
				result += command[++index] ?? '';
			} else if (char === '"' || (!windows && char === '\'')) {
				if (!quote) {
					quote = char;
				} else if (quote === char) {
					quote = undefined;
				}
			}
		}
	}
	return result;
}

/** Owns the proxy process and the raw SSH stream it provides. */
export class SSHProxyCommand extends Disposable {
	readonly stream: Duplex;
	private readonly _child: ChildProcessWithoutNullStreams;
	private _stderr = '';
	private _stopped = false;
	private _exitStatus: string | number | undefined;
	private readonly _exited = new DeferredPromise<void>();

	constructor(command: string, logService: ILogService, windows = process.platform === 'win32', terminateProcess: typeof killTree = killTree) {
		super();
		this._child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
		this.stream = Duplex.from({ readable: this._child.stdout, writable: this._child.stdin });
		this._register(toDisposable(() => {
			this._stopped = true;
			this.stream.end();
			if (this._child.pid !== undefined && this._child.exitCode === null && this._child.signalCode === null) {
				void terminateProcess(this._child.pid, windows, message => logService.debug(`[SSHRemoteAgentHost] ${message}`)).catch(error => logService.warn('[SSHRemoteAgentHost] Failed to stop SSH ProxyCommand', error)).finally(() => this.stream.destroy());
			} else {
				this.stream.destroy();
			}
		}));
		this._child.stderr.on('data', (data: Buffer) => {
			this._stderr = (this._stderr + data.toString()).slice(-8192);
		});
		this._child.once('error', error => this.stream.destroy(error));
		this._child.once('exit', (code, signal) => {
			this._exitStatus = signal ?? code ?? 'unknown';
			void this._exited.complete();
			if (!this._stopped && !this.stream.destroyed) {
				this.stream.destroy(new Error(this._describeExit(this._exitStatus)));
			}
		});
	}

	/**
	 * Describes how the proxy exited. When the proxy has closed its output but not exited yet, waits briefly for it, so a
	 * connection the proxy dropped is reported with the proxy's error instead of only the SSH library's.
	 */
	async describeFailure(): Promise<string | undefined> {
		if (this._exitStatus === undefined && this._child.stdout.readableEnded) {
			await raceTimeout(this._exited.p, 1000);
		}
		return this._exitStatus === undefined ? undefined : this._describeExit(this._exitStatus);
	}

	private _describeExit(status: string | number): string {
		return localize('sshProxyExited', "SSH ProxyCommand exited ({0}): {1}", status, this._stderr.trim());
	}
}
