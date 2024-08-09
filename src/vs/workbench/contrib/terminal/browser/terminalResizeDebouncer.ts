/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, runWhenWindowIdle } from 'vs/base/browser/dom';
import { debounce } from 'vs/base/common/decorators';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import type { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';

const enum Constants {
	/**
	 * The _normal_ buffer length threshold at which point resizing starts being debounced.
	 */
	StartDebouncingThreshold = 200,
}

export class TerminalResizeDebouncer extends Disposable {
	private _latestX: number = 0;
	private _latestY: number = 0;

	private readonly _resizeXJob = this._register(new MutableDisposable());
	private readonly _resizeYJob = this._register(new MutableDisposable());

	constructor(
		private readonly _isVisible: () => boolean,
		private readonly _getXterm: () => XtermTerminal | undefined,
		private readonly _resizeBothCallback: (cols: number, rows: number) => void,
		private readonly _resizeXCallback: (cols: number) => void,
		private readonly _resizeYCallback: (rows: number) => void,
	) {
		super();
	}

	async resize(cols: number, rows: number, immediate: boolean): Promise<void> {
		this._latestX = cols;
		this._latestY = rows;

		// Resize immediately if requested explicitly or if the buffer is small
		if (immediate || this._getXterm()!.raw.buffer.normal.length < Constants.StartDebouncingThreshold) {
			this._resizeXJob.clear();
			this._resizeYJob.clear();
			this._resizeBothCallback(cols, rows);
			return;
		}

		// Resize in an idle callback if the terminal is not visible
		const win = getWindow(this._getXterm()!.raw.element);
		if (win && !this._isVisible()) {
			if (!this._resizeXJob.value) {
				this._resizeXJob.value = runWhenWindowIdle(win, async () => {
					this._resizeXCallback(this._latestX);
					this._resizeXJob.clear();
				});
			}
			if (!this._resizeYJob.value) {
				this._resizeYJob.value = runWhenWindowIdle(win, async () => {
					this._resizeYCallback(this._latestY);
					this._resizeYJob.clear();
				});
			}
			return;
		}

		// Update dimensions independently as vertical resize is cheap and horizontal resize is
		// expensive due to reflow.
		this._resizeYCallback(rows);
		this._latestX = cols;
		this._debounceResizeX(cols);
	}

	flush(): void {
		if (this._resizeXJob.value || this._resizeYJob.value) {
			this._resizeXJob.clear();
			this._resizeYJob.clear();
			this._resizeBothCallback(this._latestX, this._latestY);
		}
	}

	@debounce(100)
	private _debounceResizeX(cols: number) {
		this._resizeXCallback(cols);
	}
}
