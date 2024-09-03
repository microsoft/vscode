/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ariaLabelForScreenReaderContent, ISimpleModel, newlinecount, PagedScreenReaderStrategy, ScreenReaderContentState } from 'vs/editor/browser/controller/editContext/screenReaderUtils';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { RestrictedRenderingContext, RenderingContext } from 'vs/editor/browser/view/renderingContext';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import * as viewEvents from 'vs/editor/common/viewEvents';
import * as dom from 'vs/base/browser/dom';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { BugIndicatingError } from 'vs/base/common/errors';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IViewModel } from 'vs/editor/common/viewModel';

export class ScreenReaderSupport {

	// Configuration values
	private _contentLeft: number = -1;
	private _contentWidth: number = -1;
	private _lineHeight: number = -1;
	private _fontInfo: FontInfo | null = null;
	private _accessibilitySupport = AccessibilitySupport.Unknown;
	private _accessibilityPageSize: number = -1;

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

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): void {
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
		this._domNode.domNode.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		const tabSize = this._context.viewModel.model.getOptions().tabSize;
		const spaceWidth = options.get(EditorOption.fontInfo).spaceWidth;
		this._domNode.domNode.style.tabSize = `${tabSize * spaceWidth}px`;
	}

	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): void {
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
		const textContentBeforeSelection = this._screenReaderContentState.value.substring(0, this._screenReaderContentState.rangeOffsetStart);
		const numberOfLinesOfContentBeforeSelection = newlinecount(textContentBeforeSelection);
		this._domNode.domNode.scrollTop = numberOfLinesOfContentBeforeSelection * this._lineHeight;
	}

	public setAriaOptions(): void { }


	public writeScreenReaderContent(): void {
		this._screenReaderContentState = this._getScreenReaderContentState();
		if (!this._screenReaderContentState) {
			return;
		}
		if (this._domNode.domNode.textContent !== this._screenReaderContentState.value) {
			this._domNode.domNode.textContent = this._screenReaderContentState.value;
		}
		this._setSelectionOfScreenReaderContent(this._screenReaderContentState.rangeOffsetStart, this._screenReaderContentState.rangeOffsetEnd);
	}


	private _getScreenReaderContentState(): ScreenReaderContentState | undefined {
		if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
			return;
		}
		return PagedScreenReaderStrategy.fromEditorSelection(
			createSimpleModelFromViewModel(this._context.viewModel),
			this._primarySelection,
			this._accessibilityPageSize,
			this._accessibilitySupport === AccessibilitySupport.Unknown
		);
	}
}

function createSimpleModelFromViewModel(viewModel: IViewModel): ISimpleModel {
	return {
		getLineCount: (): number => viewModel.getLineCount(),
		getLineMaxColumn: (lineNumber: number): number => viewModel.getLineMaxColumn(lineNumber),
		getValueInRange: (range: Range, eol: EndOfLinePreference): string => viewModel.getValueInRange(range, eol),
		getValueLengthInRange: (range: Range, eol: EndOfLinePreference): number => viewModel.getValueLengthInRange(range, eol),
		modifyPosition: (position: Position, offset: number): Position => viewModel.modifyPosition(position, offset)
	};
}

function setDomSelection(node: Node, selection: OffsetRange): void {
	const activeDocument = dom.getActiveWindow().document;
	const activeDocumentSelection = activeDocument.getSelection();
	if (!activeDocumentSelection) {
		throw new BugIndicatingError();
	}
	activeDocumentSelection.removeAllRanges();

	const range = new globalThis.Range();
	range.setStart(node, selection.start);
	range.setEnd(node, selection.endExclusive);
	activeDocumentSelection.addRange(range);
}
