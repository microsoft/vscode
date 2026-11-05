/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { Disposable, DisposableStore, MutableDisposable, toDisposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import type { IXtermAttributeData, IXtermBufferLine, IXtermCellData, IXtermCore, IXtermRenderer } from '../../../terminal/browser/xterm-private.js';
import type { ITerminalTypeAheadConfiguration } from '../common/terminalTypeAheadConfiguration.js';

// Attribute bits mirror @xterm/xterm/src/common/buffer/Constants.ts.
const enum AttributeBits {
	Color = 0x3FFFFFF,
	Rgb = 0x3000000,
	Inverse = 0x4000000,
	Bold = 0x8000000,
	Underline = 0x10000000,
	Italic = 0x4000000,
	Dim = 0x8000000,
}

const core = (terminal: Terminal): IXtermCore => {
	interface XtermWithCore extends Terminal {
		_core: IXtermCore;
	}
	return (terminal as XtermWithCore)._core;
};

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]): IDisposable {
	const descriptor = Object.getOwnPropertyDescriptor(target, key);
	target[key] = replacement;
	return toDisposable(() => {
		if (target[key] === replacement) {
			if (descriptor) {
				Object.defineProperty(target, key, descriptor);
			} else {
				Reflect.deleteProperty(target, key);
			}
		}
	});
}

function styledAttributes(pen: IXtermAttributeData, style: ITerminalTypeAheadConfiguration['localEchoStyle']): IXtermAttributeData {
	const attributes = pen.clone();
	switch (style) {
		case 'bold':
			attributes.fg |= AttributeBits.Bold;
			break;
		case 'dim':
			attributes.bg |= AttributeBits.Dim;
			break;
		case 'italic':
			attributes.bg |= AttributeBits.Italic;
			break;
		case 'underlined':
			attributes.fg |= AttributeBits.Underline;
			attributes.extended.underlineStyle = 1;
			break;
		case 'inverted':
			attributes.fg |= AttributeBits.Inverse;
			break;
		default: {
			const rgb = /^#[0-9a-f]{6}$/i.test(style) ? Number.parseInt(style.slice(1), 16) : 0xFF0000;
			attributes.fg = (attributes.fg & ~AttributeBits.Color) | AttributeBits.Rgb | rgb;
		}
	}
	return attributes;
}

/** A cell drawn over the authoritative buffer. */
export type PredictedCell =
	/** Draws the authoritative cell from another column of the same row, as when text shifts. */
	| { readonly kind: 'copy'; readonly x: number }
	/** Draws a predicted character in the local echo style. */
	| { readonly kind: 'char'; readonly char: string }
	/** Draws an erased cell. */
	| { readonly kind: 'blank' };

/** Predicted contents of a single row of the active normal buffer. */
export interface IPredictedRow {
	/** Absolute line index in the active buffer. */
	readonly y: number;
	/** Column of the first cell in {@link cells}; other columns draw the authoritative buffer. */
	readonly startX: number;
	readonly cells: readonly PredictedCell[];
	/** Column of the predicted cursor, used when the authoritative cursor is on this row. */
	readonly cursorX: number;
}

/**
 * Draws predicted cells and the predicted cursor at render time without writing
 * them to the terminal, so the buffer only ever contains authoritative output.
 */
export class TypeAheadOverlay extends Disposable {
	private readonly _rendererPatch = this._register(new MutableDisposable<DisposableStore>());
	private readonly _renderServicePatch = this._register(new MutableDisposable<IDisposable>());
	private _renderService: IXtermCore['_renderService'] | undefined;
	private _row: IPredictedRow | undefined;
	private _isRendering = false;
	private _isDisposed = false;

	constructor(
		private readonly _terminal: Terminal,
		private _style: ITerminalTypeAheadConfiguration['localEchoStyle'],
	) {
		super();
		this._register(this._terminal.onRender(() => {
			if (this._attach()) {
				this._refresh(this._row);
			}
		}));
		this._attach();
	}

	setStyle(style: ITerminalTypeAheadConfiguration['localEchoStyle']): void {
		this._attach();
		this._style = style;
		this._refresh(this._row);
	}

	/** Replaces the drawn prediction, or removes it when `undefined`. */
	set(row: IPredictedRow | undefined): void {
		if (this._isDisposed) {
			return;
		}
		this._attach();
		const previous = this._row;
		this._row = row;
		this._refresh(previous);
		if (previous?.y !== row?.y) {
			this._refresh(row);
		}
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		const row = this._row;
		this._row = undefined;
		super.dispose();
		this._renderService = undefined;
		this._refresh(row);
	}

	private _attach(): boolean {
		const service = core(this._terminal)._renderService;
		if (this._isDisposed || !service || service === this._renderService) {
			return false;
		}
		this._renderService = service;
		const setRenderer = service.setRenderer;
		if (setRenderer) {
			this._renderServicePatch.value = replaceMethod(service, 'setRenderer', renderer => {
				this._patchRenderer(renderer);
				setRenderer.call(service, renderer);
			});
		}
		this._patchRenderer(service._renderer.value);
		return true;
	}

	private _patchRenderer(renderer: IXtermRenderer | undefined): void {
		this._rendererPatch.clear();
		if (!renderer) {
			return;
		}
		const store = new DisposableStore();
		this._rendererPatch.value = store;
		const renderRows = renderer.renderRows;
		store.add(replaceMethod(renderer, 'renderRows', (start, end) => {
			this._render(start, end, () => renderRows.call(renderer, start, end));
		}));
		// DOM link hover/leave redraws rows without going through renderRows.
		const setCellUnderline = renderer._setCellUnderline;
		if (setCellUnderline) {
			store.add(replaceMethod(renderer, '_setCellUnderline', (x, x2, y, y2, cols, enabled) => {
				this._render(y, y2, () => setCellUnderline.call(renderer, x, x2, y, y2, cols, enabled));
			}));
		}
	}

	private _refresh(row: IPredictedRow | undefined): void {
		if (!row || !core(this._terminal)._renderService?._renderer.value || this._terminal.buffer.active.type !== 'normal') {
			return;
		}
		const y = row.y - this._terminal.buffer.active.viewportY;
		if (Number.isSafeInteger(y) && y >= 0 && y < this._terminal.rows) {
			this._terminal.refresh(y, y);
		}
	}

	private _render(start: number, end: number, render: () => void): void {
		const row = this._row;
		const buffer = core(this._terminal)._bufferService.buffer;
		const viewportY = row ? row.y - buffer.ydisp : -1;
		if (this._isRendering || !row || this._terminal.buffer.active.type !== 'normal' ||
			!Number.isSafeInteger(row.y) || viewportY < 0 || viewportY >= this._terminal.rows || viewportY < start || viewportY > end) {
			render();
			return;
		}
		const line = this._composite(row);
		if (!line) {
			render();
			return;
		}
		const lines = buffer.lines;
		const get = lines.get;
		const descriptor = Object.getOwnPropertyDescriptor(lines, 'get');
		const cursorX = buffer.x;
		this._isRendering = true;
		try {
			lines.get = y => y === row.y ? line : get.call(lines, y);
			if (row.y === buffer.ybase + buffer.y && Number.isFinite(row.cursorX)) {
				buffer.x = Math.max(0, Math.min(Math.trunc(row.cursorX), this._terminal.cols - 1));
			}
			render();
		} finally {
			buffer.x = cursorX;
			if (descriptor) {
				Object.defineProperty(lines, 'get', descriptor);
			} else {
				Reflect.deleteProperty(lines, 'get');
			}
			this._isRendering = false;
		}
	}

	private _composite(row: IPredictedRow): IXtermBufferLine | undefined {
		try {
			const source = core(this._terminal)._bufferService.buffer.lines.get(row.y);
			if (!source || !Number.isSafeInteger(row.startX)) {
				return undefined;
			}
			const line = source.clone();
			const pen = core(this._terminal)._inputHandler._curAttrData;
			const attributes = styledAttributes(pen, this._style);
			const erased = pen.clone();
			erased.fg = 0;
			erased.bg &= AttributeBits.Color;
			const cell: IXtermCellData = { content: 0, fg: 0, bg: 0, combinedData: '', extended: pen.extended };
			const end = Math.min(row.cells.length, line.length - row.startX, this._terminal.cols - row.startX);
			for (let i = Math.max(0, -row.startX); i < end; i++) {
				const prediction = row.cells[i];
				const x = row.startX + i;
				switch (prediction.kind) {
					case 'copy':
						if (Number.isSafeInteger(prediction.x) && prediction.x >= 0 && prediction.x < source.length) {
							line.setCell(x, source.loadCell(prediction.x, cell));
						}
						break;
					case 'blank':
						line.setCellFromCodepoint(x, 0, 1, erased);
						break;
					case 'char': {
						const codepoints = Array.from(prediction.char, char => char.codePointAt(0)!);
						line.setCellFromCodepoint(x, codepoints[0] ?? 0, 1, attributes);
						for (let j = 1; j < codepoints.length; j++) {
							line.addCodepointToCell(x, codepoints[j], 1);
						}
						break;
					}
				}
			}
			return line;
		} catch {
			return undefined;
		}
	}
}
