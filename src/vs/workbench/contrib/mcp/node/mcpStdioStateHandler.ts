/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams } from 'child_process';
import { TimeoutTimer } from '../../../../base/common/async.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { killTree } from '../../../../base/node/processes.js';
import { isWindows } from '../../../../base/common/platform.js';

const enum McpProcessState {
	Running,
	StdinEnded,
	KilledPolite,
	KilledForceful,
}

/**
 * Manages graceful shutdown of MCP stdio connections following the MCP specification.
 *
 * Per spec, shutdown should:
 * 1. Close the input stream to the child process
 * 2. Wait for the server to exit, or send SIGTERM if it doesn't exit within 10 seconds
 * 3. Send SIGKILL if the server doesn't exit within 10 seconds after SIGTERM
 * 4. Allow forceful killing if called twice
 */
export class McpStdioStateHandler implements IDisposable {
	private static readonly GRACE_TIME_MS = 10_000;

	private _procState = McpProcessState.Running;
	private _nextTimeout?: IDisposable;

	public get stopped() {
		return this._procState !== McpProcessState.Running;
	}

	constructor(
		private readonly _child: ChildProcessWithoutNullStreams,
		private readonly _graceTimeMs: number = McpStdioStateHandler.GRACE_TIME_MS
	) { }

	/**
	 * Initiates graceful shutdown. If called while shutdown is already in progress,
	 * forces immediate termination.
	 */
	public stop(): void {
		if (this._procState === McpProcessState.Running) {
			let graceTime = this._graceTimeMs;
			try {
				this._child.stdin.end();
			} catch (error) {
				// If stdin.end() fails, continue with termination sequence
				// This can happen if the stream is already in an error state
				graceTime = 1;
			}
			this._procState = McpProcessState.StdinEnded;
			this._nextTimeout = new TimeoutTimer(() => this.killPolite(), graceTime);
		} else {
			this._nextTimeout?.dispose();
			this.killForceful();
		}
	}

	private async killPolite() {
		this._procState = McpProcessState.KilledPolite;
		this._nextTimeout = new TimeoutTimer(() => this.killForceful(), this._graceTimeMs);

		if (this._child.pid) {
			if (!isWindows) {
				await killTree(this._child.pid, false).catch(() => {
					this._child.kill('SIGTERM');
				});
			}
		} else {
			this._child.kill('SIGTERM');
		}
	}

	private async killForceful() {
		this._procState = McpProcessState.KilledForceful;

		if (this._child.pid) {
			await killTree(this._child.pid, true).catch(() => {
				this._child.kill('SIGKILL');
			});
		} else {
			this._child.kill();
		}
	}

	public write(message: string): void {
		if (!this.stopped) {
			this._child.stdin.write(message + '\n');
		}
	}

	public dispose() {
		this._nextTimeout?.dispose();
	}
}
