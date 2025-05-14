/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySupport, IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { EditorFontLigatures, EditorOption, FindComputedEditorOptionValueById } from '../../../../common/config/editorOptions.js';
import { FontInfo } from '../../../../common/config/fontInfo.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { StringBuilder } from '../../../../common/core/stringBuilder.js';
import { EndOfLinePreference } from '../../../../common/model.js';
import { ViewConfigurationChangedEvent, ViewCursorStateChangedEvent } from '../../../../common/viewEvents.js';
import { LineDecoration } from '../../../../common/viewLayout/lineDecorations.js';
import { RenderLineInput, renderViewLine } from '../../../../common/viewLayout/viewLineRenderer.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import { applyFontInfo } from '../../../config/domFontInfo.js';
import { IEditorAriaOptions } from '../../../editorBrowser.js';
import { RestrictedRenderingContext, RenderingContext, HorizontalPosition } from '../../../view/renderingContext.js';
import { ariaLabelForScreenReaderContent, ISimpleScreenReaderContext } from '../screenReaderUtils.js';
import { NativeEditContextPagedScreenReaderStrategy, NativeEditContextScreenReaderContentState } from './nativeEditContextUtils.js';

const ttPolicy = createTrustedTypesPolicy('screenReaderSupport', { createHTML: value => value });

export class ScreenReaderSupport {

	// Configuration values
	private _contentLeft: number = 1;
	private _contentWidth: number = 1;
	private _contentHeight: number = 1;
	private _divWidth: number = 1;
	private _fontInfo!: FontInfo;
	private _accessibilityPageSize: number = 1;
	private _ignoreSelectionChangeTime: number = 0;

	private _primarySelection: Selection = new Selection(1, 1, 1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;
	private _screenReaderContentState: NativeEditContextScreenReaderContentState | undefined;
	private _nativeEditContextScreenReaderStrategy: NativeEditContextPagedScreenReaderStrategy = new NativeEditContextPagedScreenReaderStrategy();

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
		const wrappingColumn = layoutInfo.wrappingColumn;
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._contentHeight = layoutInfo.height;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
		this._divWidth = Math.round(wrappingColumn * this._fontInfo.typicalHalfwidthCharacterWidth);
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
		const wordWrapOverride2 = options.get(EditorOption.wordWrapOverride2);
		const wordWrapOverride1 = (wordWrapOverride2 === 'inherit' ? options.get(EditorOption.wordWrapOverride1) : wordWrapOverride2);
		const wordWrap = (wordWrapOverride1 === 'inherit' ? options.get(EditorOption.wordWrap) : wordWrapOverride1);
		this._domNode.domNode.style.textWrap = wordWrap === 'off' ? 'nowrap' : 'wrap';
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
		const positionLineNumber = this._screenReaderContentState.positionLineNumber;
		const top = this._context.viewLayout.getVerticalOffsetForLineNumber(positionLineNumber) - editorScrollTop + 1000;
		if (top < 0 || top > this._contentHeight) {
			// cursor is outside the viewport
			this._renderAtTopLeft();
			return;
		}

		// The <div> where we render the screen reader content does not support variable line heights,
		// all the lines must have the same height. We use the line height of the cursor position as the
		// line height for all lines.
		const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(positionLineNumber);
		const lineNumberWithinStateAboveCursor = positionLineNumber - this._screenReaderContentState.pretextOffsetRange.start;
		const scrollTop = lineNumberWithinStateAboveCursor * lineHeight;
		this._doRender(scrollTop, top, this._contentLeft, this._divWidth, lineHeight);
	}

	private _renderAtTopLeft(): void {
		this._doRender(0, 0, 0, this._contentWidth, 1);
	}

	private _doRender(scrollTop: number, top: number, left: number, width: number, height: number): void {
		// For correct alignment of the screen reader content, we need to apply the correct font
		applyFontInfo(this._domNode, this._fontInfo);

		this._domNode.setTop(top);
		this._domNode.setLeft(left);
		this._domNode.setWidth(width);
		this._domNode.setHeight(height);
		this._domNode.setLineHeight(height);
		this._domNode.domNode.scrollTop = scrollTop;
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
		console.log('writeScreenReaderContent');
		const focusedElement = getActiveWindow().document.activeElement;
		if (!focusedElement || focusedElement !== this._domNode.domNode) {
			return;
		}
		const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
		if (isScreenReaderOptimized) {
			const screenReaderContentState = this._getScreenReaderContentState();
			// if (this._screenReaderContentState?.equals(screenReaderContentState)) {
			// 	return;
			// }
			this._screenReaderContentState = screenReaderContentState;
			this.setIgnoreSelectionChangeTime('setValue');
			const pretextOffsetRange = this._screenReaderContentState.pretextOffsetRange;
			const posttextOffsetRange = this._screenReaderContentState.posttextOffsetRange;
			const positionLineNumber = this._screenReaderContentState.positionLineNumber;

			const nodes: HTMLDivElement[] = [];
			for (let lineNumber = pretextOffsetRange.start; lineNumber <= pretextOffsetRange.endExclusive; lineNumber++) {
				nodes.push(this._renderLine(lineNumber));
			}
			if (pretextOffsetRange.endExclusive !== positionLineNumber - 1) {
				const div = document.createElement('div');
				const span = document.createElement('span');
				div.appendChild(span);
				span.textContent = String.fromCharCode(8230);
			}
			nodes.push(this._renderLine(positionLineNumber));
			if (posttextOffsetRange.start !== positionLineNumber + 1) {
				const div = document.createElement('div');
				const span = document.createElement('span');
				div.appendChild(span);
				span.textContent = String.fromCharCode(8230);
			}
			for (let lineNumber = posttextOffsetRange.start; lineNumber <= posttextOffsetRange.endExclusive; lineNumber++) {
				nodes.push(this._renderLine(lineNumber));
			}
			const domNode = this._domNode.domNode;
			domNode.replaceChildren(...nodes);
			console.log('domNode : ', domNode);
			// this._setSelectionOfScreenReaderContent(this._screenReaderContentState.selectionStart, this._screenReaderContentState.selectionEnd);
		} else {
			this._screenReaderContentState = undefined;
			this.setIgnoreSelectionChangeTime('setValue');
			this._domNode.domNode.textContent = '';
		}
	}

	private _renderLine(lineNumber: number): HTMLDivElement {
		const viewModel = this._context.viewModel;
		const positionLineData = viewModel.getViewLineRenderingData(lineNumber);
		const options = this._context.configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		const stopRenderingLineAfter = options.get(EditorOption.stopRenderingLineAfter);
		const renderControlCharacters = options.get(EditorOption.renderControlCharacters);
		const fontLigatures = options.get(EditorOption.fontLigatures);
		const disableMonospaceOptimizations = options.get(EditorOption.disableMonospaceOptimizations);
		const lineDecorations = LineDecoration.filter(positionLineData.inlineDecorations, lineNumber, positionLineData.minColumn, positionLineData.maxColumn);
		const useMonospaceOptimizations = fontInfo.isMonospace && !disableMonospaceOptimizations;
		const useFontLigatures = fontLigatures !== EditorFontLigatures.OFF;
		let renderWhitespace: FindComputedEditorOptionValueById<EditorOption.renderWhitespace>;
		const renderWhitespacesInline = viewModel.model.getFontDecorations(lineNumber).length > 0;
		const experimentalWhitespaceRendering = options.get(EditorOption.experimentalWhitespaceRendering);
		if (renderWhitespacesInline || experimentalWhitespaceRendering === 'off') {
			renderWhitespace = options.get(EditorOption.renderWhitespace);
		} else {
			renderWhitespace = 'none';
		}
		const renderLineInput = new RenderLineInput(
			useMonospaceOptimizations,
			fontInfo.canUseHalfwidthRightwardsArrow,
			positionLineData.content,
			positionLineData.continuesWithWrappedLine,
			positionLineData.isBasicASCII,
			positionLineData.containsRTL,
			positionLineData.minColumn - 1,
			positionLineData.tokens,
			lineDecorations,
			positionLineData.tabSize,
			positionLineData.startVisibleColumn,
			fontInfo.spaceWidth,
			fontInfo.middotWidth,
			fontInfo.wsmiddotWidth,
			stopRenderingLineAfter,
			renderWhitespace,
			renderControlCharacters,
			useFontLigatures,
			null
		);
		const lineHeight = this._context.viewModel.viewLayout.getLineHeightForLineNumber(lineNumber);
		const sb = new StringBuilder(10000);
		sb.appendString('<div style="height:');
		sb.appendString(String(lineHeight));
		sb.appendString('px;line-height:');
		sb.appendString(String(lineHeight));
		sb.appendString('px;">');
		renderViewLine(renderLineInput, sb, true);
		sb.appendString('</div>');
		const html = sb.build();
		const trustedhtml = ttPolicy?.createHTML(html) ?? html;
		const domNode = document.createElement('div');
		domNode.innerHTML = trustedhtml as string;
		return domNode;
	}

	public get screenReaderContentState(): NativeEditContextScreenReaderContentState | undefined {
		return this._screenReaderContentState;
	}

	private _getScreenReaderContentState(): NativeEditContextScreenReaderContentState {
		const simpleModel: ISimpleScreenReaderContext = {
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
		return this._nativeEditContextScreenReaderStrategy.fromEditorSelection(simpleModel, this._primarySelection, this._accessibilityPageSize, this._accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Unknown);
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
