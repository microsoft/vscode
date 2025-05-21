/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveWindow } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { AccessibilitySupport, IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { EditorOption, IComputedEditorOptions } from '../../../../common/config/editorOptions.js';
import { EndOfLinePreference, EndOfLineSequence } from '../../../../common/model.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { Position } from '../../../../common/core/position.js';
import { ISimpleModel, SimplePagedScreenReaderStrategy, ISimpleScreenReaderContentState } from '../screenReaderUtils.js';
import { PositionOffsetTransformer } from '../../../../common/core/text/positionToOffset.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IME } from '../../../../../base/common/ime.js';
import { ViewController } from '../../../view/viewController.js';
import { IScreenReaderContent } from './screenReaderUtils.js';

export class SimpleScreenReaderContent extends Disposable implements IScreenReaderContent {

	private readonly _selectionChangeListener = this._register(new MutableDisposable());

	private _accessibilityPageSize: number = 1;
	private _contentState: ISimpleScreenReaderContentState | undefined;
	private _strategy: SimplePagedScreenReaderStrategy = new SimplePagedScreenReaderStrategy();
	private _ignoreSelectionChangeTime: number = 0;

	constructor(
		private readonly _domNode: FastDomNode<HTMLElement>,
		private readonly _context: ViewContext,
		private readonly _viewController: ViewController,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();
	}

	public setScreenReaderContent(primarySelection: Selection): void {
		const focusedElement = getActiveWindow().document.activeElement;
		if (!focusedElement || focusedElement !== this._domNode.domNode) {
			return;
		}
		const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
		if (isScreenReaderOptimized) {
			this._contentState = this._getScreenReaderContentState(primarySelection);
			const textContent = this._getScreenReaderTextContent(this._contentState, primarySelection);
			if (this._domNode.domNode.textContent !== textContent) {
				this._setIgnoreSelectionChangeTime('setValue');
				this._domNode.domNode.textContent = textContent;
			}
			const activeDocument = getActiveWindow().document;
			const activeDocumentSelection = activeDocument.getSelection();
			if (!activeDocumentSelection) {
				return;
			}
			const range = this._getScreenReaderRange(this._contentState.selectionStart, this._contentState.selectionEnd);
			if (range) {
				this._setIgnoreSelectionChangeTime('setRange');
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
			}
		} else {
			this._contentState = undefined;
			this._setIgnoreSelectionChangeTime('setValue');
			this._domNode.domNode.textContent = '';
		}
	}

	public onFocusChange(newFocusValue: boolean): void {
		if (newFocusValue) {
			this._selectionChangeListener.value = this._setSelectionChangeListener();
		} else {
			this._selectionChangeListener.value = undefined;
		}
	}

	public onConfigurationChanged(options: IComputedEditorOptions): void {
		this._accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
	}

	public onWillCut(): void {
		this._setIgnoreSelectionChangeTime('onCut');
	}

	public onWillPaste(): void {
		this._setIgnoreSelectionChangeTime('onWillPaste');
	}

	// --- private methods

	private _getIgnoreSelectionChangeTime(): number {
		return this._ignoreSelectionChangeTime;
	}

	public _setIgnoreSelectionChangeTime(reason: string): void {
		this._ignoreSelectionChangeTime = Date.now();
	}

	private _resetSelectionChangeTime(): void {
		this._ignoreSelectionChangeTime = 0;
	}

	private _setSelectionChangeListener(): IDisposable {
		// See https://github.com/microsoft/vscode/issues/27216 and https://github.com/microsoft/vscode/issues/98256
		// When using a Braille display or NVDA for example, it is possible for users to reposition the
		// system caret. This is reflected in Chrome as a `selectionchange` event and needs to be reflected within the editor.

		// `selectionchange` events often come multiple times for a single logical change
		// so throttle multiple `selectionchange` events that burst in a short period of time.
		let previousSelectionChangeEventTime = 0;
		return addDisposableListener(this._domNode.domNode.ownerDocument, 'selectionchange', () => {
			const activeElement = getActiveWindow().document.activeElement;
			const isFocused = activeElement === this._domNode.domNode;
			if (!isFocused) {
				return;
			}
			const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
			if (!isScreenReaderOptimized || !IME.enabled) {
				return;
			}
			const now = Date.now();
			const delta1 = now - previousSelectionChangeEventTime;
			previousSelectionChangeEventTime = now;
			if (delta1 < 5) {
				// received another `selectionchange` event within 5ms of the previous `selectionchange` event
				// => ignore it
				return;
			}
			const delta2 = now - this._getIgnoreSelectionChangeTime();
			this._resetSelectionChangeTime();
			if (delta2 < 100) {
				// received a `selectionchange` event within 100ms since we touched the hidden div
				// => ignore it, since we caused it
				return;
			}
			const selection = this._getEditorSelectionFromScreenReaderRange();
			if (!selection) {
				return;
			}
			this._viewController.setSelection(selection);
		});
	}

	private _getScreenReaderContentState(primarySelection: Selection): ISimpleScreenReaderContentState {
		const simpleModel: ISimpleModel = {
			getLineCount: (): number => {
				return this._context.viewModel.getLineCount();
			},
			getLineMaxColumn: (lineNumber: number): number => {
				return this._context.viewModel.getLineMaxColumn(lineNumber);
			},
			getValueInRange: (range: Range, eol: EndOfLinePreference): string => {
				return this._context.viewModel.getValueInRange(range, eol);
			},
			getValueLengthInRange: (range: Range, eol: EndOfLinePreference): number => {
				return this._context.viewModel.getValueLengthInRange(range, eol);
			},
			modifyPosition: (position: Position, offset: number): Position => {
				return this._context.viewModel.modifyPosition(position, offset);
			}
		};
		return this._strategy.fromEditorSelection(simpleModel, primarySelection, this._accessibilityPageSize, this._accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Unknown);
	}

	private _getScreenReaderTextContent(screenReaderContentState: ISimpleScreenReaderContentState, primarySelection: Selection): string {
		const endPosition = this._context.viewModel.model.getPositionAt(Infinity);
		let value = screenReaderContentState.value;
		if (endPosition.column === 1 && primarySelection.getEndPosition().equals(endPosition)) {
			value += '\n';
		}
		return value;
	}

	private _getScreenReaderRange(selectionOffsetStart: number, selectionOffsetEnd: number): globalThis.Range | undefined {
		const textContent = this._domNode.domNode.firstChild;
		if (!textContent) {
			return;
		}
		const range = new globalThis.Range();
		range.setStart(textContent, selectionOffsetStart);
		range.setEnd(textContent, selectionOffsetEnd);
		return range;
	}

	private _getEditorSelectionFromScreenReaderRange(): Selection | undefined {
		if (!this._contentState) {
			return;
		}
		const activeDocument = getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (!activeDocumentSelection) {
			return;
		}
		const rangeCount = activeDocumentSelection.rangeCount;
		if (rangeCount === 0) {
			return;
		}
		const range = activeDocumentSelection.getRangeAt(0);
		const viewModel = this._context.viewModel;
		const model = viewModel.model;
		const coordinatesConverter = viewModel.coordinatesConverter;
		const modelScreenReaderContentStartPositionWithinEditor = coordinatesConverter.convertViewPositionToModelPosition(this._contentState.startPositionWithinEditor);
		const offsetOfStartOfScreenReaderContent = model.getOffsetAt(modelScreenReaderContentStartPositionWithinEditor);
		let offsetOfSelectionStart = range.startOffset + offsetOfStartOfScreenReaderContent;
		let offsetOfSelectionEnd = range.endOffset + offsetOfStartOfScreenReaderContent;
		const modelUsesCRLF = model.getEndOfLineSequence() === EndOfLineSequence.CRLF;
		if (modelUsesCRLF) {
			const screenReaderContentText = this._contentState.value;
			const offsetTransformer = new PositionOffsetTransformer(screenReaderContentText);
			const positionOfStartWithinText = offsetTransformer.getPosition(range.startOffset);
			const positionOfEndWithinText = offsetTransformer.getPosition(range.endOffset);
			offsetOfSelectionStart += positionOfStartWithinText.lineNumber - 1;
			offsetOfSelectionEnd += positionOfEndWithinText.lineNumber - 1;
		}
		const positionOfSelectionStart = model.getPositionAt(offsetOfSelectionStart);
		const positionOfSelectionEnd = model.getPositionAt(offsetOfSelectionEnd);
		return Selection.fromPositions(positionOfSelectionStart, positionOfSelectionEnd);
	}
}
