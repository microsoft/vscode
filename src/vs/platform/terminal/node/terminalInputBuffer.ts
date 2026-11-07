/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';

const enum Constants {
	InputChunkSize = 256,
	InputChunkDelay = 5,
}

const bracketedPasteStartSequence = '\x1b[200~';

/**
 * Buffers input to avoid overwhelming programs that change terminal modes while consuming lines.
 */
export class TerminalInputBuffer extends Disposable {
	private readonly _queue: (string | Buffer)[] = [];
	private _writeTimeout: Timeout | undefined;

	constructor(
		private readonly _write: (data: string | Buffer) => void,
		private readonly _throttleMultilineInput: boolean,
	) {
		super();
		this._register(toDisposable(() => {
			if (this._writeTimeout) {
				clearTimeout(this._writeTimeout);
				this._writeTimeout = undefined;
			}
			this._queue.length = 0;
		}));
	}

	write(data: string | Buffer): void {
		if (typeof data === 'string' && this._shouldThrottle(data)) {
			const buffer = Buffer.from(data);
			for (let offset = 0; offset < buffer.length; offset += Constants.InputChunkSize) {
				this._queue.push(buffer.subarray(offset, offset + Constants.InputChunkSize));
			}
		} else if (this._queue.length > 0 || this._writeTimeout) {
			this._queue.push(data);
		} else {
			this._write(data);
			return;
		}

		if (!this._writeTimeout) {
			this._writeNext();
		}
	}

	private _shouldThrottle(data: string): boolean {
		return this._throttleMultilineInput
			&& Buffer.byteLength(data) > Constants.InputChunkSize
			&& /[\r\n]/.test(data)
			&& !data.startsWith(bracketedPasteStartSequence);
	}

	private _writeNext(): void {
		const data = this._queue.shift();
		if (data === undefined) {
			return;
		}
		this._write(data);
		if (this._queue.length > 0) {
			this._writeTimeout = setTimeout(() => {
				this._writeTimeout = undefined;
				this._writeNext();
			}, Constants.InputChunkDelay);
		}
	}
}
