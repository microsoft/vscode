/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, dispose, IDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { Emitter, Event } from '../../base/common/event.js';
import { mainWindow } from '../../base/browser/window.js';

export type MobileNavigationLayer = 'sidebar' | 'editor' | 'panel' | 'auxbar' | 'customView';

type MobileNavigationEntry = { readonly layer: MobileNavigationLayer } | { readonly layer: 'sheet'; readonly dismiss: () => void };

/**
 * Keeps one browser-history guard while mobile layers are open. Back dismisses
 * the top layer and rearms the guard if necessary. Closing a nested layer by UI
 * therefore cannot rewind history underneath a replacement or another sheet.
 */
export class MobileNavigationStack extends Disposable {

	private readonly _stack: MobileNavigationEntry[] = [];
	private _pendingHistoryPop = false;

	private readonly _onDidPop = this._register(new Emitter<MobileNavigationLayer>());
	readonly onDidPop: Event<MobileNavigationLayer> = this._onDidPop.event;

	constructor(
		private readonly _history: Pick<History, 'state' | 'pushState' | 'back'> = mainWindow.history,
		onPopState: Event<Pick<PopStateEvent, 'state'>> = Event.fromDOMEventEmitter<PopStateEvent>(mainWindow, 'popstate'),
	) {
		super();

		this._register(onPopState(e => this._onPopState(e)));
		this._syncHistory();
	}

	push(layer: MobileNavigationLayer): void {
		this._stack.push({ layer });
		this._syncHistory();
	}

	registerSheet(dismiss: () => void): IDisposable {
		const entry: MobileNavigationEntry = { layer: 'sheet', dismiss };
		this._stack.push(entry);
		this._syncHistory();
		return toDisposable(() => this._remove(entry));
	}

	pop(): MobileNavigationEntry['layer'] | undefined {
		const entry = this._stack.pop();
		try {
			if (entry) {
				if (entry.layer === 'sheet') {
					entry.dismiss();
				} else {
					this._onDidPop.fire(entry.layer);
				}
			}
		} finally {
			this._syncHistory();
		}
		return entry?.layer;
	}

	peek(): MobileNavigationEntry['layer'] | undefined {
		return this._stack.length > 0
			? this._stack[this._stack.length - 1].layer
			: undefined;
	}

	has(layer: MobileNavigationLayer): boolean {
		return this._stack.some(e => e.layer === layer);
	}

	clear(): void {
		try {
			this._clearSheets();
		} finally {
			this._syncHistory();
		}
	}

	private _clearSheets(): void {
		const sheets = this._stack.splice(0).reverse().filter(entry => entry.layer === 'sheet');
		dispose(sheets.map(entry => toDisposable(entry.dismiss)));
	}

	/**
	 * Removes the topmost matching part without invoking its close handler.
	 * Sheets use their individual registrations so closing one cannot remove
	 * a different sheet of the same kind.
	 */
	popSilently(layer: MobileNavigationLayer): void {
		for (let i = this._stack.length - 1; i >= 0; i--) {
			if (this._stack[i].layer === layer) {
				this._remove(this._stack[i]);
				return;
			}
		}
	}

	private _remove(entry: MobileNavigationEntry): void {
		const index = this._stack.indexOf(entry);
		if (index !== -1) {
			this._stack.splice(index, 1);
			this._syncHistory();
		}
	}

	private _isOwnHistoryState(state: unknown): boolean {
		return typeof state === 'object' && state !== null && (state as { vscodeMobileNavigation?: unknown }).vscodeMobileNavigation === true;
	}

	private _syncHistory(): void {
		if (this._pendingHistoryPop) {
			return;
		}
		if (this._stack.length > 0) {
			if (!this._isOwnHistoryState(this._history.state)) {
				this._history.pushState({ vscodeMobileNavigation: true }, '');
			}
		} else if (this._isOwnHistoryState(this._history.state)) {
			this._pendingHistoryPop = true;
			this._history.back();
		}
	}

	private _onPopState(e: Pick<PopStateEvent, 'state'>): void {
		if (this._isOwnHistoryState(e.state)) {
			this._syncHistory();
			return;
		}
		if (this._pendingHistoryPop) {
			this._pendingHistoryPop = false;
			this._syncHistory();
			return;
		}

		this.pop();
	}

	override dispose(): void {
		// Release sheets without starting a history traversal in a shutting-down window.
		try {
			this._clearSheets();
		} finally {
			super.dispose();
		}
	}
}
