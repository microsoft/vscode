/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { Disposable, DisposableStore, MutableDisposable, dispose } from '../../../../../base/common/lifecycle.js';
import { IMarkTracker } from '../terminal.js';
import { ITerminalCapabilityStore, ITerminalCommand, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import type { Terminal, IMarker, ITerminalAddon, IDecoration, IBufferRange } from '@xterm/xterm';
import { timeout } from '../../../../../base/common/async.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR } from '../../common/terminalColorRegistry.js';
import { getWindow } from '../../../../../base/browser/dom.js';
import { ICurrentPartialCommand } from '../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

// HACK: Mark navigation currently depends on terminalContrib/stickyScroll
// eslint-disable-next-line local/code-import-patterns
import { TerminalStickyScrollSettingId } from '../../../terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration.js';

enum Boundary {
	Top,
	Bottom
}

export const enum ScrollPosition {
	Top,
	Middle
}

interface IScrollToMarkerOptions {
	hideDecoration?: boolean;
	/** Scroll even if the line is within the viewport */
	forceScroll?: boolean;
	bufferRange?: IBufferRange;
}

export class MarkNavigationAddon extends Disposable implements IMarkTracker, ITerminalAddon {
	private _currentMarker: IMarker | Boundary = Boundary.Bottom;
	private _selectionStart: IMarker | Boundary | null = null;
	private _isDisposable: boolean = false;
	protected _terminal: Terminal | undefined;
	private _navigationDecorations: IDecoration[] | undefined;

	private _activeCommandGuide?: ITerminalCommand;
	private readonly _commandGuideDecorations = this._register(new MutableDisposable<DisposableStore>());

	activate(terminal: Terminal): void {
		this._terminal = terminal;
		this._register(this._terminal.onData(() => {
			this._currentMarker = Boundary.Bottom;
		}));
	}

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
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
			markers = coalesce(commandCapability.commands.filter(e => skipEmptyCommands ? e.exitCode !== undefined : true).map(e => e.promptStartMarker ?? e.marker));
			// Allow navigating to the current command iff it has been executed, this ignores the
			// skipEmptyCommands flag intenionally as chances are it's not going to be empty if an
			// executed marker exists when this is requested.
			if (commandCapability.currentCommand?.promptStartMarker && commandCapability.currentCommand.commandExecutedMarker) {
				markers.push(commandCapability.currentCommand?.promptStartMarker);
			}
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

	private _findCommand(marker: IMarker): ITerminalCommand | ICurrentPartialCommand | undefined {
		const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (commandCapability) {
			const command = commandCapability.commands.find(e => e.marker?.line === marker.line || e.promptStartMarker?.line === marker.line);
			if (command) {
				return command;
			}
			if (commandCapability.currentCommand) {
				return commandCapability.currentCommand;
			}
		}
		return undefined;
	}

	clear(): void {
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
			return !this._getMarkers(true).map(e => e.line).includes(0);
		}

		return !this._getMarkers(true).includes(marker);
	}

	scrollToPreviousMark(scrollPosition: ScrollPosition = ScrollPosition.Middle, retainSelection: boolean = false, skipEmptyCommands: boolean = true): void {
		if (!this._terminal) {
			return;
		}
		if (!retainSelection) {
			this._selectionStart = null;
		}

		let markerIndex;
		const currentLineY = typeof this._currentMarker === 'object'
			? this.getTargetScrollLine(this._currentMarker.line, scrollPosition)
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
			markerIndex = this._findPreviousMarker(skipEmptyCommands);
			this._currentMarker.dispose();
			this._isDisposable = false;
		} else {
			if (skipEmptyCommands && this._isEmptyCommand(this._currentMarker)) {
				markerIndex = this._findPreviousMarker(true);
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
		this._scrollToCommand(this._currentMarker, scrollPosition);
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
			? this.getTargetScrollLine(this._currentMarker.line, scrollPosition)
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
			markerIndex = this._findNextMarker(skipEmptyCommands);
			this._currentMarker.dispose();
			this._isDisposable = false;
		} else {
			if (skipEmptyCommands && this._isEmptyCommand(this._currentMarker)) {
				markerIndex = this._findNextMarker(true);
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
		this._scrollToCommand(this._currentMarker, scrollPosition);
	}

	private _scrollToCommand(marker: IMarker, position: ScrollPosition): void {
		const command = this._findCommand(marker);
		if (command) {
			this.revealCommand(command, position);
		} else {
			this._scrollToMarker(marker, position);
		}
	}

	private _scrollToMarker(start: IMarker | number, position: ScrollPosition, end?: IMarker | number, options?: IScrollToMarkerOptions): void {
		if (!this._terminal) {
			return;
		}
		if (!this._isMarkerInViewport(this._terminal, start) || options?.forceScroll) {
			const line = this.getTargetScrollLine(toLineIndex(start), position);
			this._terminal.scrollToLine(line);
		}
		if (!options?.hideDecoration) {
			if (options?.bufferRange) {
				this._highlightBufferRange(options.bufferRange);
			} else {
				this.registerTemporaryDecoration(start, end, true);
			}
		}
	}

	private _createMarkerForOffset(marker: IMarker | number, offset: number): IMarker {
		if (offset === 0 && isMarker(marker)) {
			return marker;
		} else {
			const offsetMarker = this._terminal?.registerMarker(-this._terminal.buffer.active.cursorY + toLineIndex(marker) - this._terminal.buffer.active.baseY + offset);
			if (offsetMarker) {
				return offsetMarker;
			} else {
				throw new Error(`Could not register marker with offset ${toLineIndex(marker)}, ${offset}`);
			}
		}
	}

	revealCommand(command: ITerminalCommand | ICurrentPartialCommand, position: ScrollPosition = ScrollPosition.Middle): void {
		const marker = 'getOutput' in command ? command.marker : command.commandStartMarker;
		if (!this._terminal || !marker) {
			return;
		}
		const line = toLineIndex(marker);
		const promptRowCount = command.getPromptRowCount();
		const commandRowCount = command.getCommandRowCount();
		this._scrollToMarker(
			line - (promptRowCount - 1),
			position,
			line + (commandRowCount - 1)
		);
	}

	revealRange(range: IBufferRange): void {
		this._scrollToMarker(
			range.start.y - 1,
			ScrollPosition.Middle,
			range.end.y - 1,
			{
				bufferRange: range,
				// Ensure scroll shows the line when sticky scroll is enabled
				forceScroll: !!this._configurationService.getValue(TerminalStickyScrollSettingId.Enabled)
			}
		);
	}

	showCommandGuide(command: ITerminalCommand | undefined): void {
		if (!this._terminal) {
			return;
		}
		if (!command) {
			this._commandGuideDecorations.clear();
			this._activeCommandGuide = undefined;
			return;
		}
		if (this._activeCommandGuide === command) {
			return;
		}
		if (command.marker) {
			this._activeCommandGuide = command;

			// Highlight output
			const store = this._commandGuideDecorations.value = new DisposableStore();
			if (!command.executedMarker || !command.endMarker) {
				return;
			}
			const startLine = command.marker.line - (command.getPromptRowCount() - 1);
			const decorationCount = toLineIndex(command.endMarker) - startLine;
			// Abort if the command is excessively long to avoid performance on hover/leave
			if (decorationCount > 200) {
				return;
			}
			for (let i = 0; i < decorationCount; i++) {
				const decoration = this._terminal.registerDecoration({
					marker: this._createMarkerForOffset(startLine, i)
				});
				if (decoration) {
					store.add(decoration);
					let renderedElement: HTMLElement | undefined;
					store.add(decoration.onRender(element => {
						if (!renderedElement) {
							renderedElement = element;
							element.classList.add('terminal-command-guide');
							if (i === 0) {
								element.classList.add('top');
							}
							if (i === decorationCount - 1) {
								element.classList.add('bottom');
							}
						}
						if (this._terminal?.element) {
							element.style.marginLeft = `-${getWindow(this._terminal.element).getComputedStyle(this._terminal.element).paddingLeft}`;
						}
					}));
				}
			}
		}
	}


	private _scrollState: { viewportY: number } | undefined;

	saveScrollState(): void {
		this._scrollState = { viewportY: this._terminal?.buffer.active.viewportY ?? 0 };
	}

	restoreScrollState(): void {
		if (this._scrollState && this._terminal) {
			this._terminal.scrollToLine(this._scrollState.viewportY);
			this._scrollState = undefined;
		}
	}

	private _highlightBufferRange(range: IBufferRange): void {
		if (!this._terminal) {
			return;
		}

		this._resetNavigationDecorations();
		const startLine = range.start.y;
		const decorationCount = range.end.y - range.start.y + 1;
		for (let i = 0; i < decorationCount; i++) {
			const decoration = this._terminal.registerDecoration({
				marker: this._createMarkerForOffset(startLine - 1, i),
				x: range.start.x - 1,
				width: (range.end.x - 1) - (range.start.x - 1) + 1,
				overviewRulerOptions: undefined
			});
			if (decoration) {
				this._navigationDecorations?.push(decoration);
				let renderedElement: HTMLElement | undefined;

				decoration.onRender(element => {
					if (!renderedElement) {
						renderedElement = element;
						element.classList.add('terminal-range-highlight');
					}
				});
				decoration.onDispose(() => { this._navigationDecorations = this._navigationDecorations?.filter(d => d !== decoration); });
			}
		}
	}

	registerTemporaryDecoration(marker: IMarker | number, endMarker: IMarker | number | undefined, showOutline: boolean): void {
		if (!this._terminal) {
			return;
		}
		this._resetNavigationDecorations();
		const color = this._themeService.getColorTheme().getColor(TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR);
		const startLine = toLineIndex(marker);
		const decorationCount = endMarker ? toLineIndex(endMarker) - startLine + 1 : 1;
		for (let i = 0; i < decorationCount; i++) {
			const decoration = this._terminal.registerDecoration({
				marker: this._createMarkerForOffset(marker, i),
				width: this._terminal.cols,
				overviewRulerOptions: i === 0 ? {
					color: color?.toString() || '#a0a0a0cc'
				} : undefined
			});
			if (decoration) {
				this._navigationDecorations?.push(decoration);
				let renderedElement: HTMLElement | undefined;

				decoration.onRender(element => {
					if (!renderedElement) {
						renderedElement = element;
						element.classList.add('terminal-scroll-highlight');
						if (showOutline) {
							element.classList.add('terminal-scroll-highlight-outline');
						}
						if (i === 0) {
							element.classList.add('top');
						}
						if (i === decorationCount - 1) {
							element.classList.add('bottom');
						}
					} else {
						element.classList.add('terminal-scroll-highlight');
					}
					if (this._terminal?.element) {
						element.style.marginLeft = `-${getWindow(this._terminal.element).getComputedStyle(this._terminal.element).paddingLeft}`;
					}
				});
				// TODO: This is not efficient for a large decorationCount
				decoration.onDispose(() => { this._navigationDecorations = this._navigationDecorations?.filter(d => d !== decoration); });
				// Number picked to align with symbol highlight in the editor
				if (showOutline) {
					timeout(350).then(() => {
						if (renderedElement) {
							renderedElement.classList.remove('terminal-scroll-highlight-outline');
						}
					});
				}
			}
		}
	}

	scrollToLine(line: number, position: ScrollPosition): void {
		this._terminal?.scrollToLine(this.getTargetScrollLine(line, position));
	}

	getTargetScrollLine(line: number, position: ScrollPosition): number {
		// Middle is treated as 1/4 of the viewport's size because context below is almost always
		// more important than context above in the terminal.
		if (this._terminal && position === ScrollPosition.Middle) {
			return Math.max(line - Math.floor(this._terminal.rows / 4), 0);
		}
		return line;
	}

	private _isMarkerInViewport(terminal: Terminal, marker: IMarker | number) {
		const viewportY = terminal.buffer.active.viewportY;
		const line = toLineIndex(marker);
		return line >= viewportY && line < viewportY + terminal.rows;
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
		this._scrollToMarker(startMarker, ScrollPosition.Top, endMarker, { hideDecoration: !highlight });
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

	private _findPreviousMarker(skipEmptyCommands: boolean = false): number {
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

	private _findNextMarker(skipEmptyCommands: boolean = false): number {
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

function isMarker(value: IMarker | number): value is IMarker {
	return typeof value !== 'number';
}

function toLineIndex(line: IMarker | number): number {
	return isMarker(line) ? line.line : line;
}
