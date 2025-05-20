/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { AccessibilitySupport, IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { EditorOption, IComputedEditorOptions } from '../../../../common/config/editorOptions.js';
import { EndOfLinePreference } from '../../../../common/model.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { Position } from '../../../../common/core/position.js';
import { ISimpleModel, PagedScreenReaderStrategy, ScreenReaderContentState } from '../screenReaderUtils.js';
import { IScreenReaderContent } from './nativeEditContextUtils.js';

export class SimpleScreenReaderContent implements IScreenReaderContent {

	private _ignoreSelectionChangeTime: number = 0;
	private _accessibilityPageSize: number = 1;
	private _screenReaderContentState: ScreenReaderContentState | undefined;

	constructor(
		private readonly _domNode: FastDomNode<HTMLElement>,
		private readonly _context: ViewContext,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) { }

	public onConfigurationChanged(options: IComputedEditorOptions): void {
		this._accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
	}

	public setIgnoreSelectionChangeTime(reason: string): void {
		this._ignoreSelectionChangeTime = Date.now();
	}

	public getIgnoreSelectionChangeTime(): number {
		return this._ignoreSelectionChangeTime;
	}

	public resetSelectionChangeTime(): void {
		this._ignoreSelectionChangeTime = 0;
	}

	public writeScreenReaderContent(primarySelection: Selection): void {
		const focusedElement = getActiveWindow().document.activeElement;
		if (!focusedElement || focusedElement !== this._domNode.domNode) {
			return;
		}
		const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
		if (isScreenReaderOptimized) {
			this._screenReaderContentState = this._getScreenReaderContentState(primarySelection);
			const endPosition = this._context.viewModel.model.getPositionAt(Infinity);
			let value = this._screenReaderContentState.value;
			if (endPosition.column === 1 && primarySelection.getEndPosition().equals(endPosition)) {
				value += '\n';
			}
			if (this._domNode.domNode.textContent !== value) {
				this.setIgnoreSelectionChangeTime('setValue');
				this._domNode.domNode.textContent = value;
			}
			this._setSelectionOfScreenReaderContent(this._screenReaderContentState.selectionStart, this._screenReaderContentState.selectionEnd);
		} else {
			this._screenReaderContentState = undefined;
			this.setIgnoreSelectionChangeTime('setValue');
			this._domNode.domNode.textContent = '';
		}
	}

	private _getScreenReaderContentState(primarySelection: Selection): ScreenReaderContentState {
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
		return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, primarySelection, this._accessibilityPageSize, this._accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Unknown);
	}

	private _setSelectionOfScreenReaderContent(selectionOffsetStart: number, selectionOffsetEnd: number): void {
		const activeDocument = getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (!activeDocumentSelection) {
			return;
		}
		const textContent = this._domNode.domNode.firstChild;
		if (!textContent) {
			return;
		}
		const range = new globalThis.Range();
		range.setStart(textContent, selectionOffsetStart);
		range.setEnd(textContent, selectionOffsetEnd);
		this.setIgnoreSelectionChangeTime('setRange');
		activeDocumentSelection.removeAllRanges();
		activeDocumentSelection.addRange(range);
	}
}
