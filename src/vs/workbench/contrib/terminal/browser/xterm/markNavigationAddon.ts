/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { Disposable, dispose } from 'vs/base/common/lifecycle';
import { IMarkTracker } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import type { Terminal, IMarker, ITerminalAddon, IDecoration } from 'xterm';
import { timeout } from 'vs/base/common/async';
import { IColorTheme, ICssStyleCollector, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';

enum Boundary {
	Top,
	Bottom
}

export const enum ScrollPosition {
	Top,
	Middle
}

export class MarkNavigationAddon extends Disposable implements IMarkTracker, ITerminalAddon {
	private _currentMarker: IMarker | Boundary = Boundary.Bottom;
	private _selectionStart: IMarker | Boundary | null = null;
	private _isDisposable: boolean = false;
	protected _terminal: Terminal | undefined;
	private _navigationDecorations: IDecoration[] | undefined;

	activate(terminal: Terminal): void {
		this._terminal = terminal;
		this._register(this._terminal.onData(() => {
			this._currentMarker = Boundary.Bottom;
		}));
	}

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super();
	}

	private _getMarkers(skipEmptyCommands?: boolean): readonly IMarker[] {
		const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		const partialCommandCapability = this._capabilities.get(TerminalCapability.PartialCommandDetection);
		const markCapability = this._capabilities.get(TerminalCapability.BufferMarkDetection);
		let markers: IMarker[] = [];
		if (commandCapability) {
			markers = coalesce(commandCapability.commands.map(e => e.marker));
		} else if (partialCommandCapability) {
			markers.push(...partialCommandCapability.commands);
		}

		if (markCapability && !skipEmptyCommands) {
			let next = markCapability.markers().next()?.value;
			const arr: IMarker[] = [];
			while (next) {
				arr.push(next);
				next = markCapability.markers().next()?.value;
			}
			markers = arr;
		}
		return markers;
	}

	clearMarker(): void {
		// Clear the current marker so successive focus/selection actions are performed from the
		// bottom of the buffer
		this._currentMarker = Boundary.Bottom;
		this._resetNavigationDecorations();
		this._selectionStart = null;
	}

	private _resetNavigationDecorations() {
		if (this._navigationDecorations) {
			dispose(this._navigationDecorations);
		}
		this._navigationDecorations = [];
	}

	private _isEmptyCommand(marker: IMarker | Boundary) {
		if (marker === Boundary.Bottom) {
			return true;
		}

		if (marker === Boundary.Top) {
			return this._getMarkers(true).map(e => e.line).indexOf(0) === -1;
		}

		return this._getMarkers(true).indexOf(marker) === -1;
	}

	scrollToPreviousMark(scrollPosition: ScrollPosition = ScrollPosition.Middle, retainSelection: boolean = false, skipEmptyCommands?: boolean): void {
		if (!this._terminal) {
			return;
		}
		if (!retainSelection) {
			this._selectionStart = null;
		}

		let markerIndex;
		const currentLineY = typeof this._currentMarker === 'object'
			? this._getTargetScrollLine(this._terminal, this._currentMarker, scrollPosition)
			: Math.min(getLine(this._terminal, this._currentMarker), this._terminal.buffer.active.baseY);
		const viewportY = this._terminal.buffer.active.viewportY;
		if (typeof this._currentMarker === 'object' ? !this._isMarkerInViewport(this._terminal, this._currentMarker) : currentLineY !== viewportY) {
			// The user has scrolled, find the line based on the current scroll position. This only
			// works when not retaining selection
			const markersBelowViewport = this._getMarkers(skipEmptyCommands).filter(e => e.line >= viewportY).length;
			// -1 will scroll to the top
			markerIndex = this._getMarkers(skipEmptyCommands).length - markersBelowViewport - 1;
		} else if (this._currentMarker === Boundary.Bottom) {
			markerIndex = this._getMarkers(skipEmptyCommands).length - 1;
		} else if (this._currentMarker === Boundary.Top) {
			markerIndex = -1;
		} else if (this._isDisposable) {
			markerIndex = this._findPreviousMarker(this._terminal, skipEmptyCommands);
			this._currentMarker.dispose();
			this._isDisposable = false;
		} else {
			if (skipEmptyCommands && this._isEmptyCommand(this._currentMarker)) {
				markerIndex = this._findPreviousMarker(this._terminal, true);
			} else {
				markerIndex = this._getMarkers(skipEmptyCommands).indexOf(this._currentMarker) - 1;
			}
		}

		if (markerIndex < 0) {
			this._currentMarker = Boundary.Top;
			this._terminal.scrollToTop();
			this._resetNavigationDecorations();
			return;
		}

		this._currentMarker = this._getMarkers(skipEmptyCommands)[markerIndex];
		this._scrollToMarker(this._currentMarker, scrollPosition);
	}

	scrollToNextMark(scrollPosition: ScrollPosition = ScrollPosition.Middle, retainSelection: boolean = false, skipEmptyCommands: boolean = true): void {
		if (!this._terminal) {
			return;
		}
		if (!retainSelection) {
			this._selectionStart = null;
		}

		let markerIndex;
		const currentLineY = typeof this._currentMarker === 'object'
			? this._getTargetScrollLine(this._terminal, this._currentMarker, scrollPosition)
			: Math.min(getLine(this._terminal, this._currentMarker), this._terminal.buffer.active.baseY);
		const viewportY = this._terminal.buffer.active.viewportY;
		if (typeof this._currentMarker === 'object' ? !this._isMarkerInViewport(this._terminal, this._currentMarker) : currentLineY !== viewportY) {
			// The user has scrolled, find the line based on the current scroll position. This only
			// works when not retaining selection
			const markersAboveViewport = this._getMarkers(skipEmptyCommands).filter(e => e.line <= viewportY).length;
			// markers.length will scroll to the bottom
			markerIndex = markersAboveViewport;
		} else if (this._currentMarker === Boundary.Bottom) {
			markerIndex = this._getMarkers(skipEmptyCommands).length;
		} else if (this._currentMarker === Boundary.Top) {
			markerIndex = 0;
		} else if (this._isDisposable) {
			markerIndex = this._findNextMarker(this._terminal, skipEmptyCommands);
			this._currentMarker.dispose();
			this._isDisposable = false;
		} else {
			if (skipEmptyCommands && this._isEmptyCommand(this._currentMarker)) {
				markerIndex = this._findNextMarker(this._terminal, true);
			} else {
				markerIndex = this._getMarkers(skipEmptyCommands).indexOf(this._currentMarker) + 1;
			}
		}

		if (markerIndex >= this._getMarkers(skipEmptyCommands).length) {
			this._currentMarker = Boundary.Bottom;
			this._terminal.scrollToBottom();
			this._resetNavigationDecorations();
			return;
		}

		this._currentMarker = this._getMarkers(skipEmptyCommands)[markerIndex];
		this._scrollToMarker(this._currentMarker, scrollPosition);
	}

	private _scrollToMarker(marker: IMarker, position: ScrollPosition, endMarker?: IMarker, hideDecoration?: boolean): void {
		if (!this._terminal) {
			return;
		}
		if (!this._isMarkerInViewport(this._terminal, marker)) {
			const line = this._getTargetScrollLine(this._terminal, marker, position);
			this._terminal.scrollToLine(line);
		}
		if (!hideDecoration) {
			this._registerTemporaryDecoration(marker, endMarker);
		}
	}

	private _createMarkerForOffset(marker: IMarker, offset: number): IMarker {
		if (offset === 0) {
			return marker;
		} else {
			const offsetMarker = this._terminal?.registerMarker(-this._terminal.buffer.active.cursorY + marker.line - this._terminal.buffer.active.baseY + offset);
			if (offsetMarker) {
				return offsetMarker;
			} else {
				throw new Error(`Could not register marker with offset ${marker.line}, ${offset}`);
			}
		}
	}

	private _registerTemporaryDecoration(marker: IMarker, endMarker?: IMarker): void {
		if (!this._terminal) {
			return;
		}
		this._resetNavigationDecorations();
		const color = this._themeService.getColorTheme().getColor(TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR);
		const startLine = marker.line;
		const decorationCount = endMarker ? endMarker.line - startLine + 1 : 1;

		for (let i = 0; i < decorationCount; i++) {
			const decoration = this._terminal.registerDecoration({
				marker: this._createMarkerForOffset(marker, i),
				width: this._terminal.cols,
				overviewRulerOptions: {
					color: color?.toString() || '#a0a0a0cc'
				}
			});
			if (decoration) {
				this._navigationDecorations?.push(decoration);
				let renderedElement: HTMLElement | undefined;

				decoration.onRender(element => {
					if (!renderedElement) {
						renderedElement = element;
						if (decorationCount > 1) {
							element.classList.add('terminal-scroll-highlight');
						} else {
							element.classList.add('terminal-scroll-highlight', 'terminal-scroll-highlight-outline');
						}
						if (this._terminal?.element) {
							element.style.marginLeft = `-${getComputedStyle(this._terminal.element).paddingLeft}`;
						}
					}
				});
				decoration.onDispose(() => { this._navigationDecorations = this._navigationDecorations?.filter(d => d !== decoration); });
				// Number picked to align with symbol highlight in the editor
				timeout(350).then(() => {
					if (renderedElement) {
						renderedElement.classList.remove('terminal-scroll-highlight-outline');
					}
				});
			}
		}
	}

	private _getTargetScrollLine(terminal: Terminal, marker: IMarker, position: ScrollPosition) {
		// Middle is treated at 1/4 of the viewport's size because context below is almost always
		// more important than context above in the terminal.
		if (position === ScrollPosition.Middle) {
			return Math.max(marker.line - Math.floor(terminal.rows / 4), 0);
		}
		return marker.line;
	}

	private _isMarkerInViewport(terminal: Terminal, marker: IMarker) {
		const viewportY = terminal.buffer.active.viewportY;
		return marker.line >= viewportY && marker.line < viewportY + terminal.rows;
	}

	scrollToClosestMarker(startMarkerId: string, endMarkerId?: string, highlight?: boolean | undefined): void {
		const detectionCapability = this._capabilities.get(TerminalCapability.BufferMarkDetection);
		if (!detectionCapability) {
			return;
		}
		const startMarker = detectionCapability.getMark(startMarkerId);
		if (!startMarker) {
			return;
		}
		const endMarker = endMarkerId ? detectionCapability.getMark(endMarkerId) : startMarker;
		this._scrollToMarker(startMarker, ScrollPosition.Top, endMarker, !highlight);
	}

	selectToPreviousMark(): void {
		if (!this._terminal) {
			return;
		}
		if (this._selectionStart === null) {
			this._selectionStart = this._currentMarker;
		}
		if (this._capabilities.has(TerminalCapability.CommandDetection)) {
			this.scrollToPreviousMark(ScrollPosition.Middle, true, true);
		} else {
			this.scrollToPreviousMark(ScrollPosition.Middle, true, false);
		}
		selectLines(this._terminal, this._currentMarker, this._selectionStart);
	}

	selectToNextMark(): void {
		if (!this._terminal) {
			return;
		}
		if (this._selectionStart === null) {
			this._selectionStart = this._currentMarker;
		}
		if (this._capabilities.has(TerminalCapability.CommandDetection)) {
			this.scrollToNextMark(ScrollPosition.Middle, true, true);
		} else {
			this.scrollToNextMark(ScrollPosition.Middle, true, false);
		}
		selectLines(this._terminal, this._currentMarker, this._selectionStart);
	}

	selectToPreviousLine(): void {
		if (!this._terminal) {
			return;
		}
		if (this._selectionStart === null) {
			this._selectionStart = this._currentMarker;
		}
		this.scrollToPreviousLine(this._terminal, ScrollPosition.Middle, true);
		selectLines(this._terminal, this._currentMarker, this._selectionStart);
	}

	selectToNextLine(): void {
		if (!this._terminal) {
			return;
		}
		if (this._selectionStart === null) {
			this._selectionStart = this._currentMarker;
		}
		this.scrollToNextLine(this._terminal, ScrollPosition.Middle, true);
		selectLines(this._terminal, this._currentMarker, this._selectionStart);
	}

	scrollToPreviousLine(xterm: Terminal, scrollPosition: ScrollPosition = ScrollPosition.Middle, retainSelection: boolean = false): void {
		if (!retainSelection) {
			this._selectionStart = null;
		}

		if (this._currentMarker === Boundary.Top) {
			xterm.scrollToTop();
			return;
		}

		if (this._currentMarker === Boundary.Bottom) {
			this._currentMarker = this._registerMarkerOrThrow(xterm, this._getOffset(xterm) - 1);
		} else {
			const offset = this._getOffset(xterm);
			if (this._isDisposable) {
				this._currentMarker.dispose();
			}
			this._currentMarker = this._registerMarkerOrThrow(xterm, offset - 1);
		}
		this._isDisposable = true;
		this._scrollToMarker(this._currentMarker, scrollPosition);
	}

	scrollToNextLine(xterm: Terminal, scrollPosition: ScrollPosition = ScrollPosition.Middle, retainSelection: boolean = false): void {
		if (!retainSelection) {
			this._selectionStart = null;
		}

		if (this._currentMarker === Boundary.Bottom) {
			xterm.scrollToBottom();
			return;
		}

		if (this._currentMarker === Boundary.Top) {
			this._currentMarker = this._registerMarkerOrThrow(xterm, this._getOffset(xterm) + 1);
		} else {
			const offset = this._getOffset(xterm);
			if (this._isDisposable) {
				this._currentMarker.dispose();
			}
			this._currentMarker = this._registerMarkerOrThrow(xterm, offset + 1);
		}
		this._isDisposable = true;
		this._scrollToMarker(this._currentMarker, scrollPosition);
	}

	private _registerMarkerOrThrow(xterm: Terminal, cursorYOffset: number): IMarker {
		const marker = xterm.registerMarker(cursorYOffset);
		if (!marker) {
			throw new Error(`Could not create marker for ${cursorYOffset}`);
		}
		return marker;
	}

	private _getOffset(xterm: Terminal): number {
		if (this._currentMarker === Boundary.Bottom) {
			return 0;
		} else if (this._currentMarker === Boundary.Top) {
			return 0 - (xterm.buffer.active.baseY + xterm.buffer.active.cursorY);
		} else {
			let offset = getLine(xterm, this._currentMarker);
			offset -= xterm.buffer.active.baseY + xterm.buffer.active.cursorY;
			return offset;
		}
	}

	private _findPreviousMarker(xterm: Terminal, skipEmptyCommands: boolean = false): number {
		if (this._currentMarker === Boundary.Top) {
			return 0;
		} else if (this._currentMarker === Boundary.Bottom) {
			return this._getMarkers(skipEmptyCommands).length - 1;
		}

		let i;
		for (i = this._getMarkers(skipEmptyCommands).length - 1; i >= 0; i--) {
			if (this._getMarkers(skipEmptyCommands)[i].line < this._currentMarker.line) {
				return i;
			}
		}

		return -1;
	}

	private _findNextMarker(xterm: Terminal, skipEmptyCommands: boolean = false): number {
		if (this._currentMarker === Boundary.Top) {
			return 0;
		} else if (this._currentMarker === Boundary.Bottom) {
			return this._getMarkers(skipEmptyCommands).length - 1;
		}

		let i;
		for (i = 0; i < this._getMarkers(skipEmptyCommands).length; i++) {
			if (this._getMarkers(skipEmptyCommands)[i].line > this._currentMarker.line) {
				return i;
			}
		}

		return this._getMarkers(skipEmptyCommands).length;
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const focusBorderColor = theme.getColor(focusBorder);

	if (focusBorderColor) {
		collector.addRule(`.terminal-scroll-highlight { border-color: ${focusBorderColor.toString()}; } `);
	}
});

export function getLine(xterm: Terminal, marker: IMarker | Boundary): number {
	// Use the _second last_ row as the last row is likely the prompt
	if (marker === Boundary.Bottom) {
		return xterm.buffer.active.baseY + xterm.rows - 1;
	}

	if (marker === Boundary.Top) {
		return 0;
	}

	return marker.line;
}

export function selectLines(xterm: Terminal, start: IMarker | Boundary, end: IMarker | Boundary | null): void {
	if (end === null) {
		end = Boundary.Bottom;
	}

	let startLine = getLine(xterm, start);
	let endLine = getLine(xterm, end);

	if (startLine > endLine) {
		const temp = startLine;
		startLine = endLine;
		endLine = temp;
	}

	// Subtract a line as the marker is on the line the command run, we do not want the next
	// command in the selection for the current command
	endLine -= 1;

	xterm.selectLines(startLine, endLine);
}
