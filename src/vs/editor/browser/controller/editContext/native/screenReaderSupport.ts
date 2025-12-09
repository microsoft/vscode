/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
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
import { ViewController } from '../../../view/viewController.js';
import { ariaLabelForScreenReaderContent } from '../screenReaderUtils.js';
import { RichScreenReaderContent } from './screenReaderContentRich.js';
import { SimpleScreenReaderContent } from './screenReaderContentSimple.js';
import { IScreenReaderContent } from './screenReaderUtils.js';

export class ScreenReaderSupport extends Disposable {

	// Configuration values
	private _contentLeft: number = 1;
	private _contentWidth: number = 1;
	private _contentHeight: number = 1;
	private _divWidth: number = 1;
	private _fontInfo!: FontInfo;
	private _renderRichContent: boolean | undefined;

	private _primarySelection: Selection = new Selection(1, 1, 1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;
	private readonly _state: MutableDisposable<IScreenReaderContent>;

	constructor(
		private readonly _domNode: FastDomNode<HTMLElement>,
		private readonly _context: ViewContext,
		private readonly _viewController: ViewController,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();
		this._state = this._register(new MutableDisposable<IScreenReaderContent>());
		this._instantiateScreenReaderContent();
		this._updateConfigurationSettings();
		this._updateDomAttributes();
	}

	public onWillPaste(): void {
		this._state.value?.onWillPaste();
	}

	public onWillCut(): void {
		this._state.value?.onWillCut();
	}

	public handleFocusChange(newFocusValue: boolean): void {
		this._state.value?.onFocusChange(newFocusValue);
		this.writeScreenReaderContent();
	}

	public onConfigurationChanged(e: ViewConfigurationChangedEvent): void {
		this._instantiateScreenReaderContent();
		this._updateConfigurationSettings();
		this._updateDomAttributes();
		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this.writeScreenReaderContent();
		}
	}

	private _instantiateScreenReaderContent(): void {
		const renderRichContent = this._context.configuration.options.get(EditorOption.renderRichScreenReaderContent);
		if (this._renderRichContent !== renderRichContent) {
			this._renderRichContent = renderRichContent;
			this._state.value = this._createScreenReaderContent(renderRichContent);
		}
	}

	private _createScreenReaderContent(renderRichContent: boolean): IScreenReaderContent {
		if (renderRichContent) {
			return new RichScreenReaderContent(this._domNode, this._context, this._viewController, this._accessibilityService);
		} else {
			return new SimpleScreenReaderContent(this._domNode, this._context, this._viewController, this._accessibilityService);
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
		this._divWidth = Math.round(wrappingColumn * this._fontInfo.typicalHalfwidthCharacterWidth);
		this._state.value?.onConfigurationChanged(options);
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
		this._doRender(top, this._contentLeft, this._divWidth, lineHeight);
		this._state.value?.updateScrollTop(this._primarySelection);
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
		this._domNode.setLineHeight(height);
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
		this._state.value?.updateScreenReaderContent(this._primarySelection);
	}
}
