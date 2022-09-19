/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { Terminal } from 'xterm';
import { BaseRenderLayer } from './BaseRenderLayer';
import { ICellData } from 'common/Types';
import { CellData } from 'common/buffer/CellData';
import { IColorSet } from 'browser/Types';
import { IRenderDimensions, IRequestRedrawEvent } from 'browser/renderer/Types';
import { IEventEmitter } from 'common/EventEmitter';
import { ICoreBrowserService } from 'browser/services/Services';
import { ICoreService } from 'common/services/Services';

interface ICursorState {
	x: number;
	y: number;
	isFocused: boolean;
	style: string;
	width: number;
}

/**
 * The time between cursor blinks.
 */
const BLINK_INTERVAL = 600;

export class CursorRenderLayer extends BaseRenderLayer {
	private _state: ICursorState;
	private _cursorRenderers: { [key: string]: (terminal: Terminal, x: number, y: number, cell: ICellData) => void };
	private _cursorBlinkStateManager: CursorBlinkStateManager | undefined;
	private _cell: ICellData = new CellData();

	constructor(
		terminal: Terminal,
		container: HTMLElement,
		zIndex: number,
		colors: IColorSet,
		private _onRequestRefreshRowsEvent: IEventEmitter<IRequestRedrawEvent>,
		coreBrowserService: ICoreBrowserService,
		private readonly _coreService: ICoreService
	) {
		super(container, 'cursor', zIndex, true, colors, coreBrowserService);
		this._state = {
			x: 0,
			y: 0,
			isFocused: false,
			style: '',
			width: 0
		};
		this._cursorRenderers = {
			'bar': this._renderBarCursor.bind(this),
			'block': this._renderBlockCursor.bind(this),
			'underline': this._renderUnderlineCursor.bind(this)
		};
		this.onOptionsChanged(terminal);
	}

	public override dispose(): void {
		this._cursorBlinkStateManager?.dispose();
		this._cursorBlinkStateManager = undefined;
		super.dispose();
	}

	public resize(terminal: Terminal, dim: IRenderDimensions): void {
		super.resize(terminal, dim);
		// Resizing the canvas discards the contents of the canvas so clear state
		this._state = {
			x: 0,
			y: 0,
			isFocused: false,
			style: '',
			width: 0
		};
	}

	public reset(terminal: Terminal): void {
		this._clearCursor();
		this._cursorBlinkStateManager?.restartBlinkAnimation(terminal);
		this.onOptionsChanged(terminal);
	}

	public onBlur(terminal: Terminal): void {
		this._cursorBlinkStateManager?.pause();
		this._onRequestRefreshRowsEvent.fire({ start: terminal.buffer.active.cursorY, end: terminal.buffer.active.cursorY });
	}

	public onFocus(terminal: Terminal): void {
		this._cursorBlinkStateManager?.resume(terminal);
		this._onRequestRefreshRowsEvent.fire({ start: terminal.buffer.active.cursorY, end: terminal.buffer.active.cursorY });
	}

	public onOptionsChanged(terminal: Terminal): void {
		if (terminal.options.cursorBlink) {
			if (!this._cursorBlinkStateManager) {
				this._cursorBlinkStateManager = new CursorBlinkStateManager(() => {
					this._render(terminal, true);
				}, this._coreBrowserService);
			}
		} else {
			this._cursorBlinkStateManager?.dispose();
			this._cursorBlinkStateManager = undefined;
		}
		// Request a refresh from the terminal as management of rendering is being
		// moved back to the terminal
		this._onRequestRefreshRowsEvent.fire({ start: terminal.buffer.active.cursorY, end: terminal.buffer.active.cursorY });
	}

	public onCursorMove(terminal: Terminal): void {
		this._cursorBlinkStateManager?.restartBlinkAnimation(terminal);
	}

	public onGridChanged(terminal: Terminal, startRow: number, endRow: number): void {
		if (!this._cursorBlinkStateManager || this._cursorBlinkStateManager.isPaused) {
			this._render(terminal, false);
		} else {
			this._cursorBlinkStateManager.restartBlinkAnimation(terminal);
		}
	}

	private _render(terminal: Terminal, triggeredByAnimationFrame: boolean): void {
		// Don't draw the cursor if it's hidden
		if (!this._coreService.isCursorInitialized || this._coreService.isCursorHidden) {
			this._clearCursor();
			return;
		}

		const cursorY = terminal.buffer.active.baseY + terminal.buffer.active.cursorY;
		const viewportRelativeCursorY = cursorY - terminal.buffer.active.viewportY;

		// in case cursor.x == cols adjust visual cursor to cols - 1
		const cursorX = Math.min(terminal.buffer.active.cursorX, terminal.cols - 1);

		// Don't draw the cursor if it's off-screen
		if (viewportRelativeCursorY < 0 || viewportRelativeCursorY >= terminal.rows) {
			this._clearCursor();
			return;
		}

		// TODO: Need fast buffer API for loading cell
		(terminal as any)._core.buffer.lines.get(cursorY).loadCell(cursorX, this._cell);
		if (this._cell.content === undefined) {
			return;
		}

		if (!this._coreBrowserService.isFocused) {
			this._clearCursor();
			this._ctx.save();
			this._ctx.fillStyle = this._colors.cursor.css;
			const cursorStyle = terminal.options.cursorStyle;
			if (cursorStyle && cursorStyle !== 'block') {
				this._cursorRenderers[cursorStyle](terminal, cursorX, viewportRelativeCursorY, this._cell);
			} else {
				this._renderBlurCursor(terminal, cursorX, viewportRelativeCursorY, this._cell);
			}
			this._ctx.restore();
			this._state.x = cursorX;
			this._state.y = viewportRelativeCursorY;
			this._state.isFocused = false;
			this._state.style = cursorStyle!;
			this._state.width = this._cell.getWidth();
			return;
		}

		// Don't draw the cursor if it's blinking
		if (this._cursorBlinkStateManager && !this._cursorBlinkStateManager.isCursorVisible) {
			this._clearCursor();
			return;
		}

		if (this._state) {
			// The cursor is already in the correct spot, don't redraw
			if (this._state.x === cursorX &&
				this._state.y === viewportRelativeCursorY &&
				this._state.isFocused === this._coreBrowserService.isFocused &&
				this._state.style === terminal.options.cursorStyle &&
				this._state.width === this._cell.getWidth()) {
				return;
			}
			this._clearCursor();
		}

		this._ctx.save();
		this._cursorRenderers[terminal.options.cursorStyle || 'block'](terminal, cursorX, viewportRelativeCursorY, this._cell);
		this._ctx.restore();

		this._state.x = cursorX;
		this._state.y = viewportRelativeCursorY;
		this._state.isFocused = false;
		this._state.style = terminal.options.cursorStyle!;
		this._state.width = this._cell.getWidth();
	}

	private _clearCursor(): void {
		if (this._state) {
			// Avoid potential rounding errors when device pixel ratio is less than 1
			if (this._coreBrowserService.dpr < 1) {
				this._clearAll();
			} else {
				this._clearCells(this._state.x, this._state.y, this._state.width, 1);
			}
			this._state = {
				x: 0,
				y: 0,
				isFocused: false,
				style: '',
				width: 0
			};
		}
	}

	private _renderBarCursor(terminal: Terminal, x: number, y: number, cell: ICellData): void {
		this._ctx.save();
		this._ctx.fillStyle = this._colors.cursor.css;
		this._fillLeftLineAtCell(x, y, terminal.options.cursorWidth);
		this._ctx.restore();
	}

	private _renderBlockCursor(terminal: Terminal, x: number, y: number, cell: ICellData): void {
		this._ctx.save();
		this._ctx.fillStyle = this._colors.cursor.css;
		this._fillCells(x, y, cell.getWidth(), 1);
		this._ctx.fillStyle = this._colors.cursorAccent.css;
		this._fillCharTrueColor(terminal, cell, x, y);
		this._ctx.restore();
	}

	private _renderUnderlineCursor(terminal: Terminal, x: number, y: number, cell: ICellData): void {
		this._ctx.save();
		this._ctx.fillStyle = this._colors.cursor.css;
		this._fillBottomLineAtCells(x, y);
		this._ctx.restore();
	}

	private _renderBlurCursor(terminal: Terminal, x: number, y: number, cell: ICellData): void {
		this._ctx.save();
		this._ctx.strokeStyle = this._colors.cursor.css;
		this._strokeRectAtCell(x, y, cell.getWidth(), 1);
		this._ctx.restore();
	}
}

class CursorBlinkStateManager {
	public isCursorVisible: boolean;

	private _animationFrame: number | undefined;
	private _blinkStartTimeout: number | undefined;
	private _blinkInterval: number | undefined;

	/**
	 * The time at which the animation frame was restarted, this is used on the
	 * next render to restart the timers so they don't need to restart the timers
	 * multiple times over a short period.
	 */
	private _animationTimeRestarted: number | undefined;

	constructor(
		private _renderCallback: () => void,
		private _coreBrowserService: ICoreBrowserService
	) {
		this.isCursorVisible = true;
		if (this._coreBrowserService.isFocused) {
			this._restartInterval();
		}
	}

	public get isPaused(): boolean { return !(this._blinkStartTimeout || this._blinkInterval); }

	public dispose(): void {
		if (this._blinkInterval) {
			this._coreBrowserService.window.clearInterval(this._blinkInterval);
			this._blinkInterval = undefined;
		}
		if (this._blinkStartTimeout) {
			this._coreBrowserService.window.clearTimeout(this._blinkStartTimeout);
			this._blinkStartTimeout = undefined;
		}
		if (this._animationFrame) {
			this._coreBrowserService.window.cancelAnimationFrame(this._animationFrame);
			this._animationFrame = undefined;
		}
	}

	public restartBlinkAnimation(terminal: Terminal): void {
		if (this.isPaused) {
			return;
		}
		// Save a timestamp so that the restart can be done on the next interval
		this._animationTimeRestarted = Date.now();
		// Force a cursor render to ensure it's visible and in the correct position
		this.isCursorVisible = true;
		if (!this._animationFrame) {
			this._animationFrame = this._coreBrowserService.window.requestAnimationFrame(() => {
				this._renderCallback();
				this._animationFrame = undefined;
			});
		}
	}

	private _restartInterval(timeToStart: number = BLINK_INTERVAL): void {
		// Clear any existing interval
		if (this._blinkInterval) {
			this._coreBrowserService.window.clearInterval(this._blinkInterval);
			this._blinkInterval = undefined;
		}

		// Setup the initial timeout which will hide the cursor, this is done before
		// the regular interval is setup in order to support restarting the blink
		// animation in a lightweight way (without thrashing clearInterval and
		// setInterval).
		this._blinkStartTimeout = this._coreBrowserService.window.setTimeout(() => {
			// Check if another animation restart was requested while this was being
			// started
			if (this._animationTimeRestarted) {
				const time = BLINK_INTERVAL - (Date.now() - this._animationTimeRestarted);
				this._animationTimeRestarted = undefined;
				if (time > 0) {
					this._restartInterval(time);
					return;
				}
			}

			// Hide the cursor
			this.isCursorVisible = false;
			this._animationFrame = this._coreBrowserService.window.requestAnimationFrame(() => {
				this._renderCallback();
				this._animationFrame = undefined;
			});

			// Setup the blink interval
			this._blinkInterval = this._coreBrowserService.window.setInterval(() => {
				// Adjust the animation time if it was restarted
				if (this._animationTimeRestarted) {
					// calc time diff
					// Make restart interval do a setTimeout initially?
					const time = BLINK_INTERVAL - (Date.now() - this._animationTimeRestarted);
					this._animationTimeRestarted = undefined;
					this._restartInterval(time);
					return;
				}

				// Invert visibility and render
				this.isCursorVisible = !this.isCursorVisible;
				this._animationFrame = this._coreBrowserService.window.requestAnimationFrame(() => {
					this._renderCallback();
					this._animationFrame = undefined;
				});
			}, BLINK_INTERVAL);
		}, timeToStart);
	}

	public pause(): void {
		this.isCursorVisible = true;
		if (this._blinkInterval) {
			this._coreBrowserService.window.clearInterval(this._blinkInterval);
			this._blinkInterval = undefined;
		}
		if (this._blinkStartTimeout) {
			this._coreBrowserService.window.clearTimeout(this._blinkStartTimeout);
			this._blinkStartTimeout = undefined;
		}
		if (this._animationFrame) {
			this._coreBrowserService.window.cancelAnimationFrame(this._animationFrame);
			this._animationFrame = undefined;
		}
	}

	public resume(terminal: Terminal): void {
		// Clear out any existing timers just in case
		this.pause();

		this._animationTimeRestarted = undefined;
		this._restartInterval();
		this.restartBlinkAnimation(terminal);
	}
}
