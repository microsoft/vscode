/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveElement, getShadowRoot } from '../../../../../base/browser/dom.js';
import { IDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { Range } from '../../../../common/core/range.js';
import { Selection, SelectionDirection } from '../../../../common/core/selection.js';
import { Position } from '../../../../common/core/position.js';
import { IPagedScreenReaderStrategy, ISimpleScreenReaderContext } from '../screenReaderUtils.js';
import { EndOfLinePreference } from '../../../../common/model.js';

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
		/** The text before the view line number line text */
		readonly prePositionLineText: string,

		/** The text after the view line number line text */
		readonly postPositionLineText: string,

		/** The text on the view line number */
		readonly positionLineText: string,

		/** The selection start in the concatenation of the above three texts */
		readonly selectionOffsetStart: number,

		/** The selection end in the concantenation of the above three texts */
		readonly selectionOffsetEnd: number,

		/** the position of the start of the `value` in the editor */
		readonly startPositionWithinEditor: Position,

		/** the visible line count (wrapped, not necessarily matching \n characters) for the text in `value` before `selectionStart` */
		readonly newlineCountBeforeSelection: number
	) { }

	get value(): string {
		return this.prePositionLineText + this.positionLineText + this.postPositionLineText;
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

		const isClipped = !(selectionStartPage === selectionEndPage || selectionStartPage + 1 === selectionEndPage);

		let selectionOffsetStart: number = 0;
		let selectionOffsetEnd: number = 0;

		const lineCount = context.getLineCount();
		const lineCountColumn = context.getLineMaxColumn(lineCount);
		const direction = viewSelection.getDirection();

		let positionLineNumber: number;
		let positionColumn: number;

		switch (direction) {
			case (SelectionDirection.LTR): {
				positionLineNumber = viewSelection.endLineNumber;
				positionColumn = viewSelection.endColumn;
				break;
			}
			case (SelectionDirection.RTL): {
				positionLineNumber = viewSelection.startLineNumber;
				positionColumn = viewSelection.startColumn;
				break;
			}
		}
		const textRange = new Range(positionLineNumber, 1, positionLineNumber, context.getLineMaxColumn(positionLineNumber));
		const positionLineText = context.getValueInRange(textRange, EndOfLinePreference.LF);
		const tempRange = new Range(positionLineNumber, 1, positionLineNumber, positionColumn);
		console.log('tempRange : ', tempRange);
		const characterOffsetOfPositionWithinText = context.getCharacterCountInRange(tempRange);

		let pretextRange = new Range(1, 1, 1, 1);
		if (positionLineNumber > 1) {
			pretextRange = selectionStartPageRange.intersectRanges(new Range(1, 1, positionLineNumber - 1, context.getLineMaxColumn(positionLineNumber - 1)))!;
			if (trimLongText && context.getValueLengthInRange(pretextRange, EndOfLinePreference.LF) > LIMIT_CHARS) {
				const pretextStart = context.modifyPosition(pretextRange.getEndPosition(), -LIMIT_CHARS);
				pretextRange = Range.fromPositions(pretextStart, pretextRange.getEndPosition());
			}
		}
		let posttextRange = new Range(lineCount, lineCountColumn, lineCount, lineCountColumn);
		if (positionLineNumber < lineCount) {
			posttextRange = selectionEndPageRange.intersectRanges(new Range(positionLineNumber + 1, 1, lineCount, context.getLineMaxColumn(lineCount)))!;
			if (trimLongText && context.getValueLengthInRange(posttextRange, EndOfLinePreference.LF) > LIMIT_CHARS) {
				const posttextEnd = context.modifyPosition(posttextRange.getStartPosition(), LIMIT_CHARS);
				posttextRange = Range.fromPositions(posttextRange.getStartPosition(), posttextEnd);
			}
		}
		let prePositionLineText = context.getValueInRange(pretextRange, EndOfLinePreference.LF) + (isClipped ? String.fromCharCode(8230) : '');
		let postPositionLineText = (isClipped ? String.fromCharCode(8230) : '') + context.getValueInRange(posttextRange, EndOfLinePreference.LF);
		const startPositionWithinEditor = pretextRange.getStartPosition();
		const newlineCountBeforeSelection = pretextRange.endLineNumber - pretextRange.startLineNumber;
		switch (direction) {
			case (SelectionDirection.LTR): {
				console.log('LTR');
				selectionOffsetEnd = prePositionLineText.length + characterOffsetOfPositionWithinText;
				selectionOffsetStart = context.getCharacterCountInRange(Range.fromPositions(pretextRange.getStartPosition(), viewSelection.getStartPosition()));  // + (prePositionLineEndsOnEmptyLine ? 0 : -1);
				break;
			}
			case (SelectionDirection.RTL): {
				console.log('RTL');
				selectionOffsetStart = prePositionLineText.length + characterOffsetOfPositionWithinText;
				selectionOffsetEnd = context.getCharacterCountInRange(Range.fromPositions(posttextRange.getStartPosition(), viewSelection.getEndPosition())); // + (prePositionLineEndsOnEmptyLine ? 0 : -1);
				break;
			}
		}
		const prePositionLineEndsOnEmptyLine = pretextRange.getEndPosition().column === 1 && positionLineNumber !== 1;
		if (prePositionLineEndsOnEmptyLine) {
			prePositionLineText += '\n';
		}
		const lastColumn = context.getLineMaxColumn(lineCount);
		if (lastColumn === 1 && viewSelection.getEndPosition().equals(new Position(lineCount, lastColumn))) {
			postPositionLineText += '\n';
		}
		console.log('prePositionLineText : ', prePositionLineText);
		console.log('postPositionLineText : ', postPositionLineText);
		console.log('prePositionLineEndsOnEmptyLine : ', prePositionLineEndsOnEmptyLine);
		console.log('pretextRange : ', pretextRange);
		console.log('posttextRange : ', posttextRange);
		console.log('positionLineText : ', positionLineText);
		console.log('viewSelection :', viewSelection);
		console.log('characterOffsetOfPositionWithinText : ', characterOffsetOfPositionWithinText);
		console.log('selectionOffsetStart : ', selectionOffsetStart);
		console.log('selectionOffsetEnd : ', selectionOffsetEnd);
		const state = new NativeEditContextScreenReaderContentState(
			prePositionLineText,
			postPositionLineText,
			positionLineText,
			selectionOffsetStart,
			selectionOffsetEnd,
			startPositionWithinEditor,
			newlineCountBeforeSelection
		);
		console.log('viewSelection : ', viewSelection);
		return state;
	}
}
