/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveWindow } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { AccessibilitySupport, IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { EditorOption, IComputedEditorOptions } from '../../../../common/config/editorOptions.js';
import { EndOfLineSequence } from '../../../../common/model.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import { Selection } from '../../../../common/core/selection.js';
import { SimplePagedScreenReaderStrategy, ISimpleScreenReaderContentState } from '../screenReaderUtils.js';
import { PositionOffsetTransformer } from '../../../../common/core/text/positionToOffset.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IME } from '../../../../../base/common/ime.js';
import { ViewController } from '../../../view/viewController.js';
import { IScreenReaderContent } from './screenReaderUtils.js';

export class SimpleScreenReaderContent extends Disposable implements IScreenReaderContent {

	private readonly _selectionChangeListener = this._register(new MutableDisposable());

	private _accessibilityPageSize: number = 1;
	private _ignoreSelectionChangeTime: number = 0;

	private _state: ISimpleScreenReaderContentState | undefined;
	private _strategy: SimplePagedScreenReaderStrategy = new SimplePagedScreenReaderStrategy();

	constructor(
		private readonly _domNode: FastDomNode<HTMLElement>,
		private readonly _context: ViewContext,
		private readonly _viewController: ViewController,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();
		this.onConfigurationChanged(this._context.configuration.options);
	}

	public updateScreenReaderContent(primarySelection: Selection): void {
		const domNode = this._domNode.domNode;
		const focusedElement = getActiveWindow().document.activeElement;
		if (!focusedElement || focusedElement !== domNode) {
			return;
		}
		const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
		if (isScreenReaderOptimized) {
			this._state = this._getScreenReaderContentState(primarySelection);
			if (domNode.textContent !== this._state.value) {
				this._setIgnoreSelectionChangeTime('setValue');
				domNode.textContent = this._state.value;
			}
			const selection = getActiveWindow().document.getSelection();
			if (!selection) {
				return;
			}
			const data = this._getScreenReaderRange(this._state.selectionStart, this._state.selectionEnd);
			if (!data) {
				return;
			}
			this._setIgnoreSelectionChangeTime('setRange');
			selection.setBaseAndExtent(
				data.anchorNode,
				data.anchorOffset,
				data.focusNode,
				data.focusOffset
			);
		} else {
			this._state = undefined;
			this._setIgnoreSelectionChangeTime('setValue');
			this._domNode.domNode.textContent = '';
		}
	}

	public updateScrollTop(primarySelection: Selection): void {
		if (!this._state) {
			return;
		}
		const viewLayout = this._context.viewModel.viewLayout;
		const stateStartLineNumber = this._state.startPositionWithinEditor.lineNumber;
		const verticalOffsetOfStateStartLineNumber = viewLayout.getVerticalOffsetForLineNumber(stateStartLineNumber);
		const verticalOffsetOfPositionLineNumber = viewLayout.getVerticalOffsetForLineNumber(primarySelection.positionLineNumber);
		this._domNode.domNode.scrollTop = verticalOffsetOfPositionLineNumber - verticalOffsetOfStateStartLineNumber;
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

	public _setIgnoreSelectionChangeTime(reason: string): void {
		this._ignoreSelectionChangeTime = Date.now();
	}

	private _setSelectionChangeListener(): IDisposable {
		// See https://github.com/microsoft/vscode/issues/27216 and https://github.com/microsoft/vscode/issues/98256
		// When using a Braille display or NVDA for example, it is possible for users to reposition the
		// system caret. This is reflected in Chrome as a `selectionchange` event and needs to be reflected within the editor.

		// `selectionchange` events often come multiple times for a single logical change
		// so throttle multiple `selectionchange` events that burst in a short period of time.
		let previousSelectionChangeEventTime = 0;
		return addDisposableListener(this._domNode.domNode.ownerDocument, 'selectionchange', () => {
			const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
			if (!this._state || !isScreenReaderOptimized || !IME.enabled) {
				return;
			}
			const activeElement = getActiveWindow().document.activeElement;
			const isFocused = activeElement === this._domNode.domNode;
			if (!isFocused) {
				return;
			}
			const selection = getActiveWindow().document.getSelection();
			if (!selection) {
				return;
			}
			const rangeCount = selection.rangeCount;
			if (rangeCount === 0) {
				return;
			}
			const range = selection.getRangeAt(0);

			const now = Date.now();
			const delta1 = now - previousSelectionChangeEventTime;
			previousSelectionChangeEventTime = now;
			if (delta1 < 5) {
				// received another `selectionchange` event within 5ms of the previous `selectionchange` event
				// => ignore it
				return;
			}
			const delta2 = now - this._ignoreSelectionChangeTime;
			this._ignoreSelectionChangeTime = 0;
			if (delta2 < 100) {
				// received a `selectionchange` event within 100ms since we touched the hidden div
				// => ignore it, since we caused it
				return;
			}

			this._viewController.setSelection(this._getEditorSelectionFromDomRange(this._context, this._state, selection.direction, range));
		});
	}

	private _getScreenReaderContentState(primarySelection: Selection): ISimpleScreenReaderContentState {
		const state = this._strategy.fromEditorSelection(
			this._context.viewModel,
			primarySelection,
			this._accessibilityPageSize,
			this._accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Unknown
		);
		const endPosition = this._context.viewModel.model.getPositionAt(Infinity);
		let value = state.value;
		if (endPosition.column === 1 && primarySelection.getEndPosition().equals(endPosition)) {
			value += '\n';
		}
		state.value = value;
		return state;
	}

	private _getScreenReaderRange(selectionOffsetStart: number, selectionOffsetEnd: number): { anchorNode: Node; anchorOffset: number; focusNode: Node; focusOffset: number } | undefined {
		const textContent = this._domNode.domNode.firstChild;
		if (!textContent) {
			return;
		}
		const range = new globalThis.Range();
		range.setStart(textContent, selectionOffsetStart);
		range.setEnd(textContent, selectionOffsetEnd);
		return {
			anchorNode: textContent,
			anchorOffset: selectionOffsetStart,
			focusNode: textContent,
			focusOffset: selectionOffsetEnd
		};
	}

	private _getEditorSelectionFromDomRange(context: ViewContext, state: ISimpleScreenReaderContentState, direction: string, range: globalThis.Range): Selection {
		const viewModel = context.viewModel;
		const model = viewModel.model;
		const coordinatesConverter = viewModel.coordinatesConverter;
		const modelScreenReaderContentStartPositionWithinEditor = coordinatesConverter.convertViewPositionToModelPosition(state.startPositionWithinEditor);
		const offsetOfStartOfScreenReaderContent = model.getOffsetAt(modelScreenReaderContentStartPositionWithinEditor);
		let offsetOfSelectionStart = range.startOffset + offsetOfStartOfScreenReaderContent;
		let offsetOfSelectionEnd = range.endOffset + offsetOfStartOfScreenReaderContent;
		const modelUsesCRLF = model.getEndOfLineSequence() === EndOfLineSequence.CRLF;
		if (modelUsesCRLF) {
			const screenReaderContentText = state.value;
			const offsetTransformer = new PositionOffsetTransformer(screenReaderContentText);
			const positionOfStartWithinText = offsetTransformer.getPosition(range.startOffset);
			const positionOfEndWithinText = offsetTransformer.getPosition(range.endOffset);
			offsetOfSelectionStart += positionOfStartWithinText.lineNumber - 1;
			offsetOfSelectionEnd += positionOfEndWithinText.lineNumber - 1;
		}
		const positionOfSelectionStart = model.getPositionAt(offsetOfSelectionStart);
		const positionOfSelectionEnd = model.getPositionAt(offsetOfSelectionEnd);
		const selectionStart = direction === 'forward' ? positionOfSelectionStart : positionOfSelectionEnd;
		const selectionEnd = direction === 'forward' ? positionOfSelectionEnd : positionOfSelectionStart;
		return Selection.fromPositions(selectionStart, selectionEnd);
	}
}
