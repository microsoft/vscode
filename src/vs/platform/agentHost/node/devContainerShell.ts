/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChildProcessWithoutNullStreams } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { Sequencer } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { shellEscape } from './sshRemoteAgentHostHelpers.js';

export interface IDevContainerShellResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly code: number;
}

/**
 * Runs commands one at a time through one long-lived `/bin/sh` in the
 * container, because each Dev Container CLI exec takes seconds to start.
 * Each command runs in its own `/bin/sh -c` without stdin, as it would in a
 * separate exec, and per-command markers delimit its output and exit code.
 */
export class DevContainerShell implements IDisposable {
	private readonly _sequencer = new Sequencer();
	private readonly _markerPrefix = `__vscode_dev_container_${generateUuid().replace(/-/g, '')}_`;
	private _commandCount = 0;
	private readonly _stdoutDecoder = new StringDecoder('utf8');
	private readonly _stderrDecoder = new StringDecoder('utf8');
	private _stdout = '';
	private _stderr = '';
	private _pending: { readonly marker: string; readonly resolve: (result: IDevContainerShellResult) => void; readonly reject: (error: Error) => void } | undefined;
	private _error: Error | undefined;
	private readonly _cancellationListener: IDisposable;

	constructor(
		private readonly _process: ChildProcessWithoutNullStreams,
		token: CancellationToken,
		private readonly _reportOutput: (text: string) => void,
	) {
		_process.stdout.on('data', data => {
			this._stdout += this._stdoutDecoder.write(data);
			this._resolvePending();
		});
		_process.stderr.on('data', data => {
			this._stderr += this._stderrDecoder.write(data);
			this._resolvePending();
		});
		// Write failures after an exit surface through the close event.
		_process.stdin.on('error', () => { });
		_process.once('error', error => this._fail(error));
		_process.once('close', (code, signal) => {
			const stderr = (this._stderr + this._stderrDecoder.end()).trim();
			this._stderr = '';
			if (stderr) {
				this._reportOutput(`${stderr}\n`);
			}
			this._fail(new Error(localize('devContainerShell.exited', "Dev Container shell exited ({0}): {1}", signal ?? `exit ${code}`, stderr)));
		});
		this._cancellationListener = token.onCancellationRequested(() => this.dispose());
		if (token.isCancellationRequested) {
			this.dispose();
		}
		// Keeps the CLI's startup output out of the first command's stderr.
		void this._sequencer.queue(() => this._run(undefined)).catch(() => { });
	}

	run(command: string): Promise<IDevContainerShellResult> {
		return this._sequencer.queue(() => this._run(command));
	}

	dispose(): void {
		const running = !!this._pending;
		this._fail(new CancellationError());
		this._process.stdin.end();
		if (running) {
			this._process.kill();
		}
	}

	private async _run(command: string | undefined): Promise<IDevContainerShellResult> {
		if (this._error) {
			throw this._error;
		}
		const marker = `${this._markerPrefix}${this._commandCount++}_`;
		const result = new Promise<IDevContainerShellResult>((resolve, reject) => this._pending = { marker, resolve, reject });
		if (command !== undefined) {
			this._reportOutput(`$ ${command}\n`);
		}
		this._process.stdin.write(`${command === undefined ? ':' : `/bin/sh -c ${shellEscape(command)} </dev/null`}; printf '%s%s\\n' ${marker} "$?"; printf '%s\\n' ${marker} >&2\n`);
		const { stdout, stderr, code } = await result;
		if (stdout || stderr) {
			this._reportOutput(stdout + stderr);
		}
		return { stdout, stderr, code };
	}

	private _resolvePending(): void {
		const pending = this._pending;
		if (!pending) {
			return;
		}
		const stdoutEnd = this._stdout.indexOf(pending.marker);
		const codeEnd = stdoutEnd === -1 ? -1 : this._stdout.indexOf('\n', stdoutEnd);
		const stderrEnd = this._stderr.indexOf(pending.marker);
		const stderrMarkerEnd = stderrEnd === -1 ? -1 : this._stderr.indexOf('\n', stderrEnd);
		if (codeEnd === -1 || stderrMarkerEnd === -1) {
			return;
		}
		const result = {
			stdout: this._stdout.slice(0, stdoutEnd),
			stderr: this._stderr.slice(0, stderrEnd),
			code: Number(this._stdout.slice(stdoutEnd + pending.marker.length, codeEnd)),
		};
		this._stdout = this._stdout.slice(codeEnd + 1);
		this._stderr = this._stderr.slice(stderrMarkerEnd + 1);
		this._pending = undefined;
		pending.resolve(result);
	}

	private _fail(error: Error): void {
		this._error ??= error;
		this._cancellationListener?.dispose();
		const pending = this._pending;
		this._pending = undefined;
		pending?.reject(this._error);
	}
}
