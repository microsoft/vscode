/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveElement, getShadowRoot } from '../../../../../base/browser/dom.js';
import { IDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { Selection, SelectionDirection } from '../../../../common/core/selection.js';
import { EndOfLinePreference } from '../../../../common/model.js';
import { IPagedScreenReaderStrategy, ISimpleScreenReaderContext } from '../screenReaderUtils.js';

export interface ITypeData {
	text: string;
	replacePrevCharCnt: number;
	replaceNextCharCnt: number;
	positionDelta: number;
}

export class FocusTracker extends Disposable {
	private _isFocused: boolean = false;
	private _isPaused: boolean = false;

	constructor(
		private readonly _domNode: HTMLElement,
		private readonly _onFocusChange: (newFocusValue: boolean) => void,
	) {
		super();
		this._register(addDisposableListener(this._domNode, 'focus', () => {
			if (this._isPaused) {
				return;
			}
			// Here we don't trust the browser and instead we check
			// that the active element is the one we are tracking
			// (this happens when cmd+tab is used to switch apps)
			this.refreshFocusState();
		}));
		this._register(addDisposableListener(this._domNode, 'blur', () => {
			if (this._isPaused) {
				return;
			}
			this._handleFocusedChanged(false);
		}));
	}

	public pause(): void {
		this._isPaused = true;
	}

	public resume(): void {
		this._isPaused = false;
		this.refreshFocusState();
	}

	private _handleFocusedChanged(focused: boolean): void {
		if (this._isFocused === focused) {
			return;
		}
		this._isFocused = focused;
		this._onFocusChange(this._isFocused);
	}

	public focus(): void {
		this._domNode.focus();
		this.refreshFocusState();
	}

	public refreshFocusState(): void {
		const shadowRoot = getShadowRoot(this._domNode);
		const activeElement = shadowRoot ? shadowRoot.activeElement : getActiveElement();
		const focused = this._domNode === activeElement;
		this._handleFocusedChanged(focused);
	}

	get isFocused(): boolean {
		return this._isFocused;
	}
}

export function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): IDisposable {
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			target.removeEventListener(type, listener as any);
		}
	};
}


export class NativeEditContextScreenReaderContentState {

	constructor(
		readonly positionLineNumber: number,
		readonly pretextOffsetRange: OffsetRange,
		readonly posttextOffsetRange: OffsetRange,
	) { }

	equals(other: NativeEditContextScreenReaderContentState): boolean {
		if (this.positionLineNumber !== other.positionLineNumber) {
			return false;
		}
		if (!this.pretextOffsetRange.equals(other.pretextOffsetRange)) {
			return false;
		}
		if (!this.posttextOffsetRange.equals(other.posttextOffsetRange)) {
			return false;
		}
		return true;
	}
}

export class NativeEditContextPagedScreenReaderStrategy implements IPagedScreenReaderStrategy<NativeEditContextScreenReaderContentState> {

	constructor() { }

	private _getPageOfLine(lineNumber: number, linesPerPage: number): number {
		return Math.floor((lineNumber - 1) / linesPerPage);
	}

	private _getRangeForPage(page: number, linesPerPage: number): Range {
		const offset = page * linesPerPage;
		const startLineNumber = offset + 1;
		const endLineNumber = offset + linesPerPage;
		return new Range(startLineNumber, 1, endLineNumber + 1, 1);
	}

	public fromEditorSelection(context: ISimpleScreenReaderContext, viewSelection: Selection, linesPerPage: number, trimLongText: boolean): NativeEditContextScreenReaderContentState {
		// Chromium handles very poorly text even of a few thousand chars
		// Cut text to avoid stalling the entire UI
		const LIMIT_CHARS = 500;
		const fullViewRange = Range.fromPositions(new Position(viewSelection.startLineNumber, 1), new Position(viewSelection.endLineNumber, context.getLineMaxColumn(viewSelection.endLineNumber)));

		const selectionStartPage = this._getPageOfLine(fullViewRange.startLineNumber, linesPerPage);
		const selectionStartPageRange = this._getRangeForPage(selectionStartPage, linesPerPage);

		const selectionEndPage = this._getPageOfLine(fullViewRange.endLineNumber, linesPerPage);
		const selectionEndPageRange = this._getRangeForPage(selectionEndPage, linesPerPage);

		const lineCount = context.getLineCount();
		const lineCountColumn = context.getLineMaxColumn(lineCount);
		const direction = viewSelection.getDirection();

		let positionLineNumber: number;

		switch (direction) {
			case (SelectionDirection.LTR): {
				positionLineNumber = viewSelection.endLineNumber;
				break;
			}
			case (SelectionDirection.RTL): {
				positionLineNumber = viewSelection.startLineNumber;
				break;
			}
		}

		let pretextRange = new Range(1, 1, 1, 1);
		if (positionLineNumber > 1) {
			pretextRange = selectionStartPageRange.intersectRanges(new Range(1, 1, positionLineNumber - 1, context.getLineMaxColumn(positionLineNumber - 1)))!;
			if (trimLongText && context.getValueLengthInRange(pretextRange, EndOfLinePreference.LF) > LIMIT_CHARS) {
				const pretextStart = context.modifyPosition(pretextRange.getEndPosition(), -LIMIT_CHARS);
				const modifiedPretextStart = new Position(pretextStart.lineNumber, 1);
				pretextRange = Range.fromPositions(modifiedPretextStart, pretextRange.getEndPosition());
			}
		}
		const pretextOffsetRange = new OffsetRange(pretextRange.startLineNumber, pretextRange.endLineNumber);

		let posttextRange = new Range(lineCount, lineCountColumn, lineCount, lineCountColumn);
		if (positionLineNumber < lineCount) {
			posttextRange = selectionEndPageRange.intersectRanges(new Range(positionLineNumber + 1, 1, lineCount, context.getLineMaxColumn(lineCount)))!;
			if (trimLongText && context.getValueLengthInRange(posttextRange, EndOfLinePreference.LF) > LIMIT_CHARS) {
				const posttextEnd = context.modifyPosition(posttextRange.getStartPosition(), LIMIT_CHARS);
				const modifiedPretextEnd = new Position(posttextEnd.lineNumber, context.getLineMaxColumn(posttextEnd.lineNumber));
				posttextRange = Range.fromPositions(posttextRange.getStartPosition(), modifiedPretextEnd);
			}
		}
		const posttextOffsetRange = new OffsetRange(posttextRange.startLineNumber, posttextRange.endLineNumber);

		const state = new NativeEditContextScreenReaderContentState(
			positionLineNumber,
			pretextOffsetRange,
			posttextOffsetRange
		);
		return state;
	}
}
