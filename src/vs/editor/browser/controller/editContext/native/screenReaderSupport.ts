/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySupport } from '../../../../../platform/accessibility/common/accessibility.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { FontInfo } from '../../../../common/config/fontInfo.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { EndOfLinePreference } from '../../../../common/model.js';
import { ViewConfigurationChangedEvent, ViewCursorStateChangedEvent } from '../../../../common/viewEvents.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import { applyFontInfo } from '../../../config/domFontInfo.js';
import { RestrictedRenderingContext, RenderingContext } from '../../../view/renderingContext.js';
import { ariaLabelForScreenReaderContent, ISimpleModel, newlinecount, PagedScreenReaderStrategy, ScreenReaderContentState } from '../screenReaderUtils.js';

export class ScreenReaderSupport {

	// Configuration values
	private _contentLeft: number = 1;
	private _contentWidth: number = 1;
	private _lineHeight: number = 1;
	private _fontInfo: FontInfo | undefined;
	private _accessibilitySupport: AccessibilitySupport = AccessibilitySupport.Unknown;
	private _accessibilityPageSize: number = 1;

	private _primarySelection: Selection = new Selection(1, 1, 1, 1);
	private _screenReaderContentState: ScreenReaderContentState | undefined;

	constructor(
		private readonly _domNode: FastDomNode<HTMLElement>,
		private readonly _context: ViewContext,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		this._updateConfigurationSettings();
		this._updateDomAttributes();
	}

	public onConfigurationChanged(e: ViewConfigurationChangedEvent): void {
		this._updateConfigurationSettings();
		this._updateDomAttributes();
		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this.writeScreenReaderContent();
		}
	}

	private _updateConfigurationSettings(): void {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);
		this._accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		this._accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
	}

	private _updateDomAttributes(): void {
		const options = this._context.configuration.options;
		this._domNode.domNode.setAttribute('role', 'textbox');
		this._domNode.domNode.setAttribute('aria-required', options.get(EditorOption.ariaRequired) ? 'true' : 'false');
		this._domNode.domNode.setAttribute('aria-multiline', 'true');
		this._domNode.domNode.setAttribute('aria-autocomplete', options.get(EditorOption.readOnly) ? 'none' : 'both');
		this._domNode.domNode.setAttribute('aria-roledescription', localize('editor', "editor"));
		this._domNode.domNode.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		const tabSize = this._context.viewModel.model.getOptions().tabSize;
		const spaceWidth = options.get(EditorOption.fontInfo).spaceWidth;
		this._domNode.domNode.style.tabSize = `${tabSize * spaceWidth}px`;
	}

	public onCursorStateChanged(e: ViewCursorStateChangedEvent): void {
		this._primarySelection = e.selections[0] ?? new Selection(1, 1, 1, 1);
	}

	public prepareRender(ctx: RenderingContext): void {
		this.writeScreenReaderContent();
	}

	public render(ctx: RestrictedRenderingContext): void {
		if (!this._screenReaderContentState) {
			return;
		}
		// For correct alignment of the screen reader content, we need to apply the correct font
		applyFontInfo(this._domNode, this._fontInfo!);

		const verticalOffsetForPrimaryLineNumber = this._context.viewLayout.getVerticalOffsetForLineNumber(this._primarySelection.positionLineNumber);
		const editorScrollTop = this._context.viewLayout.getCurrentScrollTop();
		const top = verticalOffsetForPrimaryLineNumber - editorScrollTop;

		this._domNode.setTop(top);
		this._domNode.setLeft(this._contentLeft);
		this._domNode.setWidth(this._contentWidth);
		this._domNode.setHeight(this._lineHeight);

		// Setting position within the screen reader content by modifying scroll position
		const textContentBeforeSelection = this._screenReaderContentState.value.substring(0, this._screenReaderContentState.selectionStart);
		const numberOfLinesOfContentBeforeSelection = newlinecount(textContentBeforeSelection);
		this._domNode.domNode.scrollTop = numberOfLinesOfContentBeforeSelection * this._lineHeight;
	}

	public setAriaOptions(): void { }

	public writeScreenReaderContent(): void {
		const focusedElement = getActiveWindow().document.activeElement;
		if (!focusedElement || focusedElement !== this._domNode.domNode) {
			return;
		}
		this._screenReaderContentState = this._getScreenReaderContentState();
		if (!this._screenReaderContentState) {
			return;
		}
		if (this._domNode.domNode.textContent !== this._screenReaderContentState.value) {
			this._domNode.domNode.textContent = this._screenReaderContentState.value;
		}
		this._setSelectionOfScreenReaderContent(this._screenReaderContentState.selectionStart, this._screenReaderContentState.selectionEnd);
	}

	private _getScreenReaderContentState(): ScreenReaderContentState | undefined {
		if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
			return;
		}
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
		return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._primarySelection, this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
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
		activeDocumentSelection.removeAllRanges();
		activeDocumentSelection.addRange(range);
	}
}
