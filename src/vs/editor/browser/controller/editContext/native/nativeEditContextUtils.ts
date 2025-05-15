/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveElement, getShadowRoot } from '../../../../../base/browser/dom.js';
import { IDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { Range } from '../../../../common/core/range.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { Selection } from '../../../../common/core/selection.js';
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
		readonly startSelectionLineNumber: number,
		readonly endSelectionLineNumber: number,
		readonly preStartOffsetRange: OffsetRange | undefined,
		readonly postEndOffsetRange: OffsetRange | undefined,
		readonly postStartOffsetRange: OffsetRange | undefined,
		readonly preEndOffsetRange: OffsetRange | undefined,
	) { }

	equals(other: NativeEditContextScreenReaderContentState): boolean {
		if (this.startSelectionLineNumber !== other.startSelectionLineNumber) {
			return false;
		}
		if (this.endSelectionLineNumber !== other.endSelectionLineNumber) {
			return false;
		}
		if (this.preStartOffsetRange === undefined && other.preStartOffsetRange !== undefined) {
			return false;
		}
		if (this.preStartOffsetRange !== undefined && other.preStartOffsetRange === undefined) {
			return false;
		}
		if (!this.preStartOffsetRange!.equals(other.preStartOffsetRange!)) {
			return false;
		}
		if (this.postEndOffsetRange === undefined && other.postEndOffsetRange !== undefined) {
			return false;
		}
		if (this.postEndOffsetRange !== undefined && other.postEndOffsetRange === undefined) {
			return false;
		}
		if (!this.postEndOffsetRange!.equals(other.postEndOffsetRange!)) {
			return false;
		}
		if (this.postStartOffsetRange === undefined && other.postStartOffsetRange !== undefined) {
			return false;
		}
		if (this.postStartOffsetRange !== undefined && other.postStartOffsetRange === undefined) {
			return false;
		}
		if (!this.postStartOffsetRange!.equals(other.postStartOffsetRange!)) {
			return false;
		}
		if (this.preEndOffsetRange === undefined && other.preEndOffsetRange !== undefined) {
			return false;
		}
		if (this.preEndOffsetRange !== undefined && other.preEndOffsetRange === undefined) {
			return false;
		}
		if (!this.preEndOffsetRange!.equals(other.preEndOffsetRange!)) {
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

		const selectionStartPage = this._getPageOfLine(viewSelection.startLineNumber, linesPerPage);
		const selectionStartPageRange = this._getRangeForPage(selectionStartPage, linesPerPage);

		const selectionEndPage = this._getPageOfLine(viewSelection.endLineNumber, linesPerPage);
		const selectionEndPageRange = this._getRangeForPage(selectionEndPage, linesPerPage);

		const lineCount = context.getLineCount();

		const positionLineNumber = viewSelection.positionLineNumber;
		const startSelectionLineNumber = viewSelection.startLineNumber;
		const endSelectionLineNumber = viewSelection.endLineNumber;

		let preStartOffsetRange: OffsetRange | undefined = undefined;
		if (startSelectionLineNumber > 1) {
			const preStartRange = selectionStartPageRange.intersectRanges(new Range(1, 1, startSelectionLineNumber - 1, context.getLineMaxColumn(startSelectionLineNumber - 1)));
			if (preStartRange) {
				preStartOffsetRange = new OffsetRange(preStartRange.startLineNumber, preStartRange.endLineNumber);
			}
		}

		let postEndOffsetRange: OffsetRange | undefined = undefined;
		if (endSelectionLineNumber < lineCount) {
			const postEndRange = selectionEndPageRange.intersectRanges(new Range(endSelectionLineNumber + 1, 1, lineCount, context.getLineMaxColumn(lineCount)));
			if (postEndRange) {
				postEndOffsetRange = new OffsetRange(postEndRange.startLineNumber, postEndRange.endLineNumber);
			}
		}

		let postStartOffsetRange: OffsetRange | undefined = undefined;
		let preEndOffsetRange: OffsetRange | undefined = undefined;
		if (selectionStartPage === selectionEndPage || selectionStartPage + 1 === selectionEndPage) {
			postStartOffsetRange = new OffsetRange(startSelectionLineNumber, endSelectionLineNumber);
		} else {
			const postStartRange = selectionStartPageRange.intersectRanges(new Range(startSelectionLineNumber + 1, 1, Infinity, Infinity));
			if (postStartRange) {
				postStartOffsetRange = new OffsetRange(postStartRange.startLineNumber, postStartRange.endLineNumber);
			}
			const preEndRange = selectionEndPageRange.intersectRanges(new Range(1, 1, endSelectionLineNumber - 1, context.getLineMaxColumn(endSelectionLineNumber - 1)));
			if (preEndRange) {
				preEndOffsetRange = new OffsetRange(preEndRange.startLineNumber, preEndRange.endLineNumber);
			}
		}

		return new NativeEditContextScreenReaderContentState(
			positionLineNumber,
			startSelectionLineNumber,
			endSelectionLineNumber,
			preStartOffsetRange,
			postEndOffsetRange,
			postStartOffsetRange,
			preEndOffsetRange
		);
	}
}
