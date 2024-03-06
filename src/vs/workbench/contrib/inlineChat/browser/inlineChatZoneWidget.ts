/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Dimension, addDisposableListener } from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { toDisposable } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorLayoutInfo, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ACTION_ACCEPT_CHANGES, ACTION_REGENERATE_RESPONSE, ACTION_VIEW_IN_CHAT, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, CTX_INLINE_CHAT_VISIBLE, MENU_INLINE_CHAT_INPUT, MENU_INLINE_CHAT_WIDGET, MENU_INLINE_CHAT_WIDGET_FEEDBACK, MENU_INLINE_CHAT_WIDGET_STATUS } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { EditorBasedInlineChatWidget } from './inlineChatWidget';


export class InlineChatZoneWidget extends ZoneWidget {

	readonly widget: EditorBasedInlineChatWidget;

	private readonly _ctxVisible: IContextKey<boolean>;
	private readonly _ctxCursorPosition: IContextKey<'above' | 'below' | ''>;
	private _dimension?: Dimension;
	private _indentationWidth: number | undefined;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(editor, { showFrame: false, showArrow: false, isAccessible: true, className: 'inline-chat-widget', keepEditorSelection: true, showInHiddenAreas: true, ordinal: 10000 });

		this._ctxVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);
		this._ctxCursorPosition = CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.bindTo(contextKeyService);

		this._disposables.add(toDisposable(() => {
			this._ctxVisible.reset();
			this._ctxCursorPosition.reset();
		}));

		this.widget = this._instaService.createInstance(EditorBasedInlineChatWidget, this.editor, {
			telemetrySource: 'interactiveEditorWidget-toolbar',
			inputMenuId: MENU_INLINE_CHAT_INPUT,
			widgetMenuId: MENU_INLINE_CHAT_WIDGET,
			feedbackMenuId: MENU_INLINE_CHAT_WIDGET_FEEDBACK,
			statusMenuId: {
				menu: MENU_INLINE_CHAT_WIDGET_STATUS,
				options: {
					buttonConfigProvider: action => {
						if (action.id === ACTION_REGENERATE_RESPONSE) {
							return { showIcon: true, showLabel: false, isSecondary: true };
						} else if (action.id === ACTION_VIEW_IN_CHAT || action.id === ACTION_ACCEPT_CHANGES) {
							return { isSecondary: false };
						} else {
							return { isSecondary: true };
						}
					}
				}
			}
		});
		this._disposables.add(this.widget.onDidChangeHeight(() => this._relayout()));
		this._disposables.add(this.widget);
		this.create();


		this._disposables.add(addDisposableListener(this.domNode, 'click', e => {
			if (!this.widget.hasFocus()) {
				this.widget.focus();
			}
		}, true));

		// todo@jrieken listen ONLY when showing
		const updateCursorIsAboveContextKey = () => {
			if (!this.position || !this.editor.hasModel()) {
				this._ctxCursorPosition.reset();
			} else if (this.position.lineNumber === this.editor.getPosition().lineNumber) {
				this._ctxCursorPosition.set('above');
			} else if (this.position.lineNumber + 1 === this.editor.getPosition().lineNumber) {
				this._ctxCursorPosition.set('below');
			} else {
				this._ctxCursorPosition.reset();
			}
		};
		this._disposables.add(this.editor.onDidChangeCursorPosition(e => updateCursorIsAboveContextKey()));
		this._disposables.add(this.editor.onDidFocusEditorText(e => updateCursorIsAboveContextKey()));
		updateCursorIsAboveContextKey();
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this.widget.domNode);
	}


	protected override _doLayout(heightInPixel: number): void {

		const maxWidth = !this.widget.showsAnyPreview() ? 640 : Number.MAX_SAFE_INTEGER;
		const width = Math.min(maxWidth, this._availableSpaceGivenIndentation(this._indentationWidth));
		this._dimension = new Dimension(width, heightInPixel);
		this.widget.domNode.style.width = `${width}px`;
		this.widget.layout(this._dimension);
	}

	private _availableSpaceGivenIndentation(indentationWidth: number | undefined): number {
		const info = this.editor.getLayoutInfo();
		return info.contentWidth - (info.glyphMarginWidth + info.decorationsWidth + (indentationWidth ?? 0));
	}

	private _computeHeightInLines(): number {
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		return this.widget.getHeight() / lineHeight;
	}

	protected override _onWidth(_widthInPixel: number): void {
		if (this._dimension) {
			this._doLayout(this._dimension.height);
		}
	}

	protected override _relayout() {
		if (this._dimension) {
			this._doLayout(this._dimension.height);
		}
		super._relayout(this._computeHeightInLines());
	}

	override show(position: Position): void {
		super.show(position, this._computeHeightInLines());
		this.widget.focus();
		this._ctxVisible.set(true);
	}

	protected override _getWidth(info: EditorLayoutInfo): number {
		return info.width - info.minimap.minimapWidth;
	}

	updateBackgroundColor(newPosition: Position, wholeRange: IRange) {
		assertType(this.container);
		const widgetLineNumber = newPosition.lineNumber;
		this.container.classList.toggle('inside-selection', widgetLineNumber > wholeRange.startLineNumber && widgetLineNumber < wholeRange.endLineNumber);
	}

	private _calculateIndentationWidth(position: Position): number {
		const viewModel = this.editor._getViewModel();
		if (!viewModel) {
			return 0;
		}
		const visibleRange = viewModel.getCompletelyVisibleViewRange();
		const startLineVisibleRange = visibleRange.startLineNumber;
		const positionLine = position.lineNumber;
		let indentationLineNumber: number | undefined;
		let indentationLevel: number | undefined;
		for (let lineNumber = positionLine; lineNumber >= startLineVisibleRange; lineNumber--) {
			const currentIndentationLevel = viewModel.getLineFirstNonWhitespaceColumn(lineNumber);
			if (currentIndentationLevel !== 0) {
				indentationLineNumber = lineNumber;
				indentationLevel = currentIndentationLevel;
				break;
			}
		}
		return this.editor.getOffsetForColumn(indentationLineNumber ?? positionLine, indentationLevel ?? viewModel.getLineFirstNonWhitespaceColumn(positionLine));
	}

	setContainerMargins(): void {
		assertType(this.container);

		const info = this.editor.getLayoutInfo();
		const marginWithoutIndentation = info.glyphMarginWidth + info.decorationsWidth + info.lineNumbersWidth;
		this.container.style.marginLeft = `${marginWithoutIndentation}px`;
	}

	setWidgetMargins(position: Position): void {
		const indentationWidth = this._calculateIndentationWidth(position);
		if (this._indentationWidth === indentationWidth) {
			return;
		}
		this._indentationWidth = this._availableSpaceGivenIndentation(indentationWidth) > 400 ? indentationWidth : 0;
		this.widget.domNode.style.marginLeft = `${this._indentationWidth}px`;
		this.widget.domNode.style.marginRight = `${this.editor.getLayoutInfo().minimap.minimapWidth}px`;
	}

	override hide(): void {
		this.container!.classList.remove('inside-selection');
		this._ctxVisible.reset();
		this._ctxCursorPosition.reset();
		this.widget.reset();
		super.hide();
		aria.status(localize('inlineChatClosed', 'Closed inline chat widget'));
	}
}
