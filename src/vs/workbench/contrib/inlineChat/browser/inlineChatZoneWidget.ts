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
import { ACTION_ACCEPT_CHANGES, ACTION_REGENERATE_RESPONSE, ACTION_TOGGLE_DIFF, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, EditMode, InlineChatConfigKeys, MENU_INLINE_CHAT_WIDGET, MENU_INLINE_CHAT_WIDGET_STATUS } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { EditorBasedInlineChatWidget } from './inlineChatWidget';
import { isEqual } from 'vs/base/common/resources';
import { StableEditorBottomScrollState } from 'vs/editor/browser/stableEditorScroll';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';

export class InlineChatZoneWidget extends ZoneWidget {

	readonly widget: EditorBasedInlineChatWidget;

	private readonly _ctxCursorPosition: IContextKey<'above' | 'below' | ''>;
	private _dimension?: Dimension;
	private _indentationWidth: number | undefined;

	constructor(
		location: ChatAgentLocation,
		editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
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
					inputSideToolbar: MENU_INLINE_CHAT_WIDGET,
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
				this._relayout(this._computeHeight().linesValue);
				scrollState.restore(this.editor);
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
		const width = Math.min(640, this._availableSpaceGivenIndentation(this._indentationWidth));
		this._dimension = new Dimension(width, heightInPixel);
		this.widget.layout(this._dimension);
	}

	private _availableSpaceGivenIndentation(indentationWidth: number | undefined): number {
		const info = this.editor.getLayoutInfo();
		return info.contentWidth - (info.glyphMarginWidth + info.decorationsWidth + (indentationWidth ?? 0));
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
		this._setWidgetMargins(position);
		this.widget.chatWidget.setVisible(true);
		this.widget.focus();

		scrollState.restore(this.editor);

		if (position.lineNumber > 1) {
			this.editor.revealRangeNearTopIfOutsideViewport(Range.fromPositions(position.delta(-1)), ScrollType.Immediate);
		} else {
			// reveal top of zone widget
			const lineTop = this.editor.getTopForLineNumber(position.lineNumber);
			const zoneTop = lineTop - height.pixelsValue;
			const spaceBelowLine = this.editor.getScrollHeight() - this.editor.getBottomForLineNumber(position.lineNumber);
			const minTop = this.editor.getScrollTop() - spaceBelowLine;
			const newTop = Math.max(zoneTop, minTop);

			if (newTop < this.editor.getScrollTop()) {
				this.editor.setScrollTop(newTop, ScrollType.Immediate);
			}
		}
	}

	override updatePositionAndHeight(position: Position): void {
		const scrollState = StableEditorBottomScrollState.capture(this.editor);
		super.updatePositionAndHeight(position, this._computeHeight().linesValue);
		this._setWidgetMargins(position);
		scrollState.restore(this.editor);
	}

	protected override _getWidth(info: EditorLayoutInfo): number {
		return info.width - info.minimap.minimapWidth;
	}

	private _calculateIndentationWidth(position: Position): number {
		const viewModel = this.editor._getViewModel();
		if (!viewModel) {
			return 0;
		}

		const visibleRange = viewModel.getCompletelyVisibleViewRange();
		if (!visibleRange.containsPosition(position)) {
			// this is needed because `getOffsetForColumn` won't work when the position
			// isn't visible/rendered
			return 0;
		}

		let indentationLevel = viewModel.getLineFirstNonWhitespaceColumn(position.lineNumber);
		let indentationLineNumber = position.lineNumber;
		for (let lineNumber = position.lineNumber; lineNumber >= visibleRange.startLineNumber; lineNumber--) {
			const currentIndentationLevel = viewModel.getLineFirstNonWhitespaceColumn(lineNumber);
			if (currentIndentationLevel !== 0) {
				indentationLineNumber = lineNumber;
				indentationLevel = currentIndentationLevel;
				break;
			}
		}

		return Math.max(0, this.editor.getOffsetForColumn(indentationLineNumber, indentationLevel)); // double-guard against invalie getOffsetForColumn-calls
	}

	private _setWidgetMargins(position: Position): void {
		const indentationWidth = this._calculateIndentationWidth(position);
		if (this._indentationWidth === indentationWidth) {
			return;
		}
		this._indentationWidth = this._availableSpaceGivenIndentation(indentationWidth) > 400 ? indentationWidth : 0;
		this.widget.domNode.style.marginLeft = `${this._indentationWidth}px`;
		this.widget.domNode.style.marginRight = `${this.editor.getLayoutInfo().minimap.minimapWidth}px`;
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
