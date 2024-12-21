/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySupport, IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
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
import { IEditorAriaOptions } from '../../../editorBrowser.js';
import { RestrictedRenderingContext, RenderingContext, HorizontalPosition } from '../../../view/renderingContext.js';
import { ariaLabelForScreenReaderContent, ISimpleModel, newlinecount, PagedScreenReaderStrategy, ScreenReaderContentState } from '../screenReaderUtils.js';

export class ScreenReaderSupport {

	// Configuration values
	private _contentLeft: number = 1;
	private _contentWidth: number = 1;
	private _contentHeight: number = 1;
	private _lineHeight: number = 1;
	private _fontInfo!: FontInfo;
	private _accessibilityPageSize: number = 1;
	private _ignoreSelectionChangeTime: number = 0;

	private _primarySelection: Selection = new Selection(1, 1, 1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;
	private _screenReaderContentState: ScreenReaderContentState | undefined;

	constructor(
		private readonly _domNode: FastDomNode<HTMLElement>,
		private readonly _context: ViewContext,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		this._updateConfigurationSettings();
		this._updateDomAttributes();
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
		this._contentHeight = layoutInfo.height;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);
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
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primarySelection.getPosition());
	}

	public render(ctx: RestrictedRenderingContext): void {
		if (!this._screenReaderContentState) {
			return;
		}

		if (!this._primaryCursorVisibleRange) {
			// The primary cursor is outside the viewport => place textarea to the top left
			this._renderAtTopLeft();
			return;
		}

		const editorScrollLeft = this._context.viewLayout.getCurrentScrollLeft();
		const left = this._contentLeft + this._primaryCursorVisibleRange.left - editorScrollLeft;
		if (left < this._contentLeft || left > this._contentLeft + this._contentWidth) {
			// cursor is outside the viewport
			this._renderAtTopLeft();
			return;
		}

		const editorScrollTop = this._context.viewLayout.getCurrentScrollTop();
		const top = this._context.viewLayout.getVerticalOffsetForLineNumber(this._primarySelection.positionLineNumber) - editorScrollTop;
		if (top < 0 || top > this._contentHeight) {
			// cursor is outside the viewport
			this._renderAtTopLeft();
			return;
		}

		this._doRender(top, this._contentLeft, this._contentWidth, this._lineHeight);
		this._setScrollTop();
	}

	private _renderAtTopLeft(): void {
		this._doRender(0, 0, this._contentWidth, 1);
	}

	private _doRender(top: number, left: number, width: number, height: number): void {
		// For correct alignment of the screen reader content, we need to apply the correct font
		applyFontInfo(this._domNode, this._fontInfo);

		this._domNode.setTop(top);
		this._domNode.setLeft(left);
		this._domNode.setWidth(width);
		this._domNode.setHeight(height);
	}

	private _setScrollTop(): void {
		if (!this._screenReaderContentState) {
			return;
		}
		// Setting position within the screen reader content by modifying scroll position
		const textContentBeforeSelection = this._screenReaderContentState.value.substring(0, this._screenReaderContentState.selectionStart);
		const numberOfLinesOfContentBeforeSelection = newlinecount(textContentBeforeSelection);
		this._domNode.domNode.scrollTop = numberOfLinesOfContentBeforeSelection * this._lineHeight;
	}

	public setAriaOptions(options: IEditorAriaOptions): void {
		if (options.activeDescendant) {
			this._domNode.setAttribute('aria-haspopup', 'true');
			this._domNode.setAttribute('aria-autocomplete', 'list');
			this._domNode.setAttribute('aria-activedescendant', options.activeDescendant);
		} else {
			this._domNode.setAttribute('aria-haspopup', 'false');
			this._domNode.setAttribute('aria-autocomplete', 'both');
			this._domNode.removeAttribute('aria-activedescendant');
		}
		if (options.role) {
			this._domNode.setAttribute('role', options.role);
		}
	}

	public writeScreenReaderContent(): void {
		const focusedElement = getActiveWindow().document.activeElement;
		if (!focusedElement || focusedElement !== this._domNode.domNode) {
			return;
		}
		const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
		if (isScreenReaderOptimized) {
			this._screenReaderContentState = this._getScreenReaderContentState();
			if (this._domNode.domNode.textContent !== this._screenReaderContentState.value) {
				this.setIgnoreSelectionChangeTime('setValue');
				this._domNode.domNode.textContent = this._screenReaderContentState.value;
			}
			this._setSelectionOfScreenReaderContent(this._screenReaderContentState.selectionStart, this._screenReaderContentState.selectionEnd);
		} else {
			this._screenReaderContentState = undefined;
			this.setIgnoreSelectionChangeTime('setValue');
			this._domNode.domNode.textContent = '';
		}
	}

	public get screenReaderContentState(): ScreenReaderContentState | undefined {
		return this._screenReaderContentState;
	}

	private _getScreenReaderContentState(): ScreenReaderContentState {
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
		return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._primarySelection, this._accessibilityPageSize, this._accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Unknown);
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
