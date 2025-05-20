/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { FontInfo } from '../../../../common/config/fontInfo.js';
import { Selection } from '../../../../common/core/selection.js';
import { ViewConfigurationChangedEvent, ViewCursorStateChangedEvent } from '../../../../common/viewEvents.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import { applyFontInfo } from '../../../config/domFontInfo.js';
import { IEditorAriaOptions } from '../../../editorBrowser.js';
import { RestrictedRenderingContext, RenderingContext, HorizontalPosition } from '../../../view/renderingContext.js';
import { ariaLabelForScreenReaderContent } from '../screenReaderUtils.js';
import { IScreenReaderContent } from './nativeEditContextUtils.js';
import { ComplexScreenReaderContent } from './screenReaderContentComplex.js';
import { SimpleScreenReaderContent } from './screenReaderContentSimple.js';

export class ScreenReaderSupport {

	// Configuration values
	private _contentLeft: number = 1;
	private _contentWidth: number = 1;
	private _contentHeight: number = 1;
	private _fontInfo!: FontInfo;

	private _primarySelection: Selection = new Selection(1, 1, 1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;
	private _screenReaderContent: IScreenReaderContent;
	private _renderComplexScreenReaderContent: boolean;

	constructor(
		private readonly _domNode: FastDomNode<HTMLElement>,
		private readonly _context: ViewContext,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		this._updateConfigurationSettings();
		this._updateDomAttributes();
		this._renderComplexScreenReaderContent = this._context.configuration.options.get(EditorOption.renderComplexScreenReaderContent);
		if (this._renderComplexScreenReaderContent) {
			this._screenReaderContent = new ComplexScreenReaderContent(this._domNode, this._context, this._accessibilityService);
		} else {
			this._screenReaderContent = new SimpleScreenReaderContent(this._domNode, this._context, this._accessibilityService);
		}
	}

	public setIgnoreSelectionChangeTime(reason: string): void {
		this._screenReaderContent.setIgnoreSelectionChangeTime(reason);
	}

	public getIgnoreSelectionChangeTime(): number {
		return this._screenReaderContent.getIgnoreSelectionChangeTime();
	}

	public resetSelectionChangeTime(): void {
		this._screenReaderContent.resetSelectionChangeTime();
	}

	public onConfigurationChanged(e: ViewConfigurationChangedEvent): void {
		const renderComplexScreenReaderContent = this._context.configuration.options.get(EditorOption.renderComplexScreenReaderContent);
		if (this._renderComplexScreenReaderContent !== renderComplexScreenReaderContent) {
			if (renderComplexScreenReaderContent) {
				this._screenReaderContent = new ComplexScreenReaderContent(this._domNode, this._context, this._accessibilityService);
			} else {
				this._screenReaderContent = new SimpleScreenReaderContent(this._domNode, this._context, this._accessibilityService);
			}
			this._renderComplexScreenReaderContent = renderComplexScreenReaderContent;
		} else {
			this._screenReaderContent.onConfigurationChanged(this._context.configuration.options);
		}
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
		const positionLineNumber = this._primarySelection.positionLineNumber;
		const top = this._context.viewLayout.getVerticalOffsetForLineNumber(positionLineNumber) - editorScrollTop;
		if (top < 0 || top > this._contentHeight) {
			// cursor is outside the viewport
			this._renderAtTopLeft();
			return;
		}

		// The <div> where we render the screen reader content does not support variable line heights,
		// all the lines must have the same height. We use the line height of the cursor position as the
		// line height for all lines.
		const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(positionLineNumber);
		this._doRender(top, top, this._contentLeft, this._contentWidth, lineHeight);
	}

	private _renderAtTopLeft(): void {
		this._doRender(0, 0, 0, this._contentWidth, 1);
	}

	private _doRender(scrollTop: number, top: number, left: number, width: number, height: number): void {
		// For correct alignment of the screen reader content, we need to apply the correct font
		applyFontInfo(this._domNode, this._fontInfo);

		this._domNode.setTop(300);
		this._domNode.setLeft(left);
		this._domNode.setWidth(width);
		this._domNode.setHeight(500);
		this._domNode.setLineHeight(height);
		this._domNode.domNode.style.background = 'white';
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
		this._screenReaderContent.write(this._primarySelection);
	}
}
