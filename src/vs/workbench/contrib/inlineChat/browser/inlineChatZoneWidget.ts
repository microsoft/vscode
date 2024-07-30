/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener, Dimension } from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { toDisposable } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorLayoutInfo, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ACTION_ACCEPT_CHANGES, ACTION_REGENERATE_RESPONSE, ACTION_TOGGLE_DIFF, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, EditMode, InlineChatConfigKeys, MENU_INLINE_CHAT_EXECUTE, MENU_INLINE_CHAT_WIDGET_STATUS } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { EditorBasedInlineChatWidget } from './inlineChatWidget';
import { isEqual } from 'vs/base/common/resources';
import { StableEditorBottomScrollState } from 'vs/editor/browser/stableEditorScroll';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IChatWidgetLocationOptions } from 'vs/workbench/contrib/chat/browser/chatWidget';

export class InlineChatZoneWidget extends ZoneWidget {

	readonly widget: EditorBasedInlineChatWidget;

	private readonly _ctxCursorPosition: IContextKey<'above' | 'below' | ''>;
	private _dimension?: Dimension;

	constructor(
		location: IChatWidgetLocationOptions,
		editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ILogService private _logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(editor, { showFrame: false, showArrow: false, isAccessible: true, className: 'inline-chat-widget', keepEditorSelection: true, showInHiddenAreas: true, ordinal: 10000 });

		this._ctxCursorPosition = CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.bindTo(contextKeyService);

		this._disposables.add(toDisposable(() => {
			this._ctxCursorPosition.reset();
		}));

		this.widget = this._instaService.createInstance(EditorBasedInlineChatWidget, location, this.editor, {
			statusMenuId: {
				menu: MENU_INLINE_CHAT_WIDGET_STATUS,
				options: {
					buttonConfigProvider: action => {
						if (new Set([ACTION_REGENERATE_RESPONSE, ACTION_TOGGLE_DIFF]).has(action.id)) {
							return { isSecondary: true, showIcon: true, showLabel: false };
						} else if (action.id === ACTION_ACCEPT_CHANGES) {
							return { isSecondary: false };
						} else {
							return { isSecondary: true };
						}
					}
				}
			},
			chatWidgetViewOptions: {
				menus: {
					executeToolbar: MENU_INLINE_CHAT_EXECUTE,
					telemetrySource: 'interactiveEditorWidget-toolbar',
				},
				rendererOptions: {
					renderTextEditsAsSummary: (uri) => {
						// render edits as summary only when using Live mode and when
						// dealing with the current file in the editor
						return isEqual(uri, editor.getModel()?.uri)
							&& configurationService.getValue<EditMode>(InlineChatConfigKeys.Mode) === EditMode.Live;
					},
				}
			}
		});
		this._disposables.add(this.widget);

		let scrollState: StableEditorBottomScrollState | undefined;
		this._disposables.add(this.widget.chatWidget.onWillMaybeChangeHeight(() => {
			if (this.position) {
				scrollState = StableEditorBottomScrollState.capture(this.editor);
			}
		}));
		this._disposables.add(this.widget.onDidChangeHeight(() => {
			if (this.position) {
				// only relayout when visible
				scrollState ??= StableEditorBottomScrollState.capture(this.editor);
				const height = this._computeHeight();
				this._relayout(height.linesValue);
				scrollState.restore(this.editor);
				scrollState = undefined;
				this._revealTopOfZoneWidget(this.position, height);
			}
		}));

		this.create();

		this._disposables.add(addDisposableListener(this.domNode, 'click', e => {
			if (!this.editor.hasWidgetFocus() && !this.widget.hasFocus()) {
				this.editor.focus();
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

		const info = this.editor.getLayoutInfo();
		let width = info.contentWidth - (info.glyphMarginWidth + info.decorationsWidth);
		width = Math.min(640, width);

		this._dimension = new Dimension(width, heightInPixel);
		this.widget.layout(this._dimension);
	}

	private _computeHeight(): { linesValue: number; pixelsValue: number } {
		const chatContentHeight = this.widget.contentHeight;
		const editorHeight = this.editor.getLayoutInfo().height;

		const contentHeight = Math.min(chatContentHeight, Math.max(this.widget.minHeight, editorHeight * 0.42));
		const heightInLines = contentHeight / this.editor.getOption(EditorOption.lineHeight);
		return { linesValue: heightInLines, pixelsValue: contentHeight };
	}

	protected override _onWidth(_widthInPixel: number): void {
		if (this._dimension) {
			this._doLayout(this._dimension.height);
		}
	}

	override show(position: Position): void {
		assertType(this.container);

		const scrollState = StableEditorBottomScrollState.capture(this.editor);
		const info = this.editor.getLayoutInfo();
		const marginWithoutIndentation = info.glyphMarginWidth + info.decorationsWidth + info.lineNumbersWidth;
		this.container.style.marginLeft = `${marginWithoutIndentation}px`;

		const height = this._computeHeight();
		super.show(position, height.linesValue);
		this.widget.chatWidget.setVisible(true);
		this.widget.focus();

		scrollState.restore(this.editor);

		this._revealTopOfZoneWidget(position, height);
	}

	override updatePositionAndHeight(position: Position): void {
		const scrollState = StableEditorBottomScrollState.capture(this.editor);
		const height = this._computeHeight();
		super.updatePositionAndHeight(position, height.linesValue);
		scrollState.restore(this.editor);

		this._revealTopOfZoneWidget(position, height);
	}

	private _revealTopOfZoneWidget(position: Position, height: { linesValue: number; pixelsValue: number }) {

		// reveal top of zone widget

		const lineNumber = position.lineNumber <= 1 ? 1 : 1 + position.lineNumber;

		const scrollTop = this.editor.getScrollTop();
		const lineTop = this.editor.getTopForLineNumber(lineNumber);
		const zoneTop = lineTop - height.pixelsValue;

		const editorHeight = this.editor.getLayoutInfo().height;
		const lineBottom = this.editor.getBottomForLineNumber(lineNumber);

		let newScrollTop = zoneTop;
		let forceScrollTop = false;

		if (lineBottom >= (scrollTop + editorHeight)) {
			// revealing the top of the zone would pust out the line we are interested it and
			// therefore we keep the line in the view port
			newScrollTop = lineBottom - editorHeight;
			forceScrollTop = true;
		}

		if (newScrollTop < scrollTop || forceScrollTop) {
			this._logService.trace('[IE] REVEAL zone', { zoneTop, lineTop, lineBottom, scrollTop, newScrollTop, forceScrollTop });
			this.editor.setScrollTop(newScrollTop, ScrollType.Immediate);
		}
	}

	protected override revealRange(range: Range, isLastLine: boolean): void {
		// noop
	}

	protected override _getWidth(info: EditorLayoutInfo): number {
		return info.width - info.minimap.minimapWidth;
	}

	override hide(): void {
		const scrollState = StableEditorBottomScrollState.capture(this.editor);
		this._ctxCursorPosition.reset();
		this.widget.reset();
		this.widget.chatWidget.setVisible(false);
		super.hide();
		aria.status(localize('inlineChatClosed', 'Closed inline chat widget'));
		scrollState.restore(this.editor);
	}
}
