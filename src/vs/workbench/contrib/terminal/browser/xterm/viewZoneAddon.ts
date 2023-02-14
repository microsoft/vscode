/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITerminalViewZoneController } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IDecoration, ITerminalAddon, Terminal } from 'xterm';

/**
 * An addon to xterm.js that allows inserting a view zone into the terminal just below the cursor,
 * allowing the insertion of arbitrary content into the by making space in the _actual_ buffer. When
 * the view zone is removed, the space made in the buffer behind the view zone remains, this will
 * typically be harmless and will lead to a more consistent experience.
 */
export class ViewZoneAddon extends Disposable implements ITerminalAddon, ITerminalViewZoneController {
	protected _terminal: Terminal | undefined;

	private _decoration: IDecoration | undefined;

	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	/**
	 * Inserts a new view zone, disposing of any existing view zones.
	 */
	async insert(): Promise<IDecoration> {
		const term = this._terminal;
		if (!term) {
			throw new Error('Cannot insert view zone before addon is activated');

		}
		if (this._decoration) {
			throw new Error('NYI'); // TODO: Implement
		}

		// TODO: Prevent exceeding some max lines cap
		// TODO: Handle terminal input/output, hide the view zone when this happens? Do nothing?

		// Save cursor, cursor next line, force new line, insert new line, restore cursor
		await new Promise<void>(r => term.write('\x1b[s\x1b[1E\n\x1b[L\x1b[u', r));
		let allowBufferChanges = true;
		let insertedLines = 1;

		// Insert a marker 1 line below the cursor, this uses ! as it should always succeed due to
		// the sequence sent above.
		const marker = term.registerMarker(1)!;
		this._decoration = term.registerDecoration({
			marker,
			width: term.cols
		});
		if (!this._decoration) {
			throw new Error('Decoration couldn\'t be registered');
		}

		// When the decoration resizes, insert lines into the buffer if needed
		let initialized = false;
		this._decoration.onRender((e: HTMLElement) => {
			if (!initialized) {
				initialized = true;
				// Prevent the main textarea from stealing focus
				e.addEventListener('mousedown', (e: MouseEvent) => e.stopImmediatePropagation());
				const resizeObserver = new ResizeObserver(entries => {
					if (!allowBufferChanges || entries.length === 0) {
						return;
					}
					const entry = entries[0];
					const lineHeight = parseInt(e.style.lineHeight.replace('px', ''));
					const availableHeight = lineHeight * insertedLines;
					if (availableHeight < entry.contentRect.height) {
						// TODO: .
						const newLines = insertedLines + Math.ceil((entry.contentRect.height - availableHeight) / lineHeight);
						for (let i = insertedLines; i < newLines; i++) {
							term.write(`\x1b[s\x1b[${i}E\n\x1b[L\x1b[u`);
						}
						insertedLines = newLines;
					}
				});
				resizeObserver.observe(e);
				this._register(toDisposable(() => resizeObserver.disconnect()));
			}
		});

		// When any output occurs in the terminal, stop modifying the buffer. This is unexpected to
		// occur in normal usage but it could happen at which point we accept the view zone may not
		// by in the correct position in favor of not corrupting the buffer.
		const onDataListener = term.onData(() => {
			allowBufferChanges = false;
		});

		// Clean up
		this._decoration.onDispose(() => {
			onDataListener.dispose();
			this._decoration = undefined;
		});

		return this._decoration;
	}
}
