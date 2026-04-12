/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener, Dimension, $ } from '../../../../base/browser/dom.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { renderMarkdown, renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { assertType } from '../../../../base/common/types.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { StableEditorBottomScrollState } from '../../../../editor/browser/stableEditorScroll.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { IOptions, ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IChatWidgetViewOptions } from '../../chat/browser/chat.js';
import { IChatWidgetLocationOptions } from '../../chat/browser/widget/chatWidget.js';
import { ChatMode } from '../../chat/common/chatModes.js';
import { INotebookEditor } from '../../notebook/browser/notebookBrowser.js';
import { ACTION_REGENERATE_RESPONSE, ACTION_REPORT_ISSUE, ACTION_TOGGLE_DIFF, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, MENU_INLINE_CHAT_SIDE, MENU_INLINE_CHAT_WIDGET_SECONDARY, MENU_INLINE_CHAT_WIDGET_STATUS } from '../common/inlineChat.js';
import { EditorBasedInlineChatWidget } from './inlineChatWidget.js';

export class InlineChatZoneWidget extends ZoneWidget {

	static readonly #options: IOptions = {
		showFrame: true,
		frameWidth: 1,
		// frameColor: 'var(--vscode-inlineChat-border)',
		isResizeable: true,
		showArrow: false,
		isAccessible: true,
		className: 'inline-chat-widget',
		keepEditorSelection: true,
		showInHiddenAreas: true,
		ordinal: 50000,
	};

	readonly widget: EditorBasedInlineChatWidget;

	readonly #ctxCursorPosition: IContextKey<'above' | 'below' | ''>;
	#dimension?: Dimension;
	private notebookEditor?: INotebookEditor;

	readonly #logService: ILogService;

	readonly #terminationCard: HTMLElement;
	readonly #terminationMarkdownContainer: HTMLElement;
	readonly #terminationMarkdownMessage: HTMLElement;
	readonly #terminationMarkdownScrollable: DomScrollableElement;
	readonly #terminationToolbar: HTMLElement;
	readonly #terminationStore = new DisposableStore();

	constructor(
		location: IChatWidgetLocationOptions,
		options: IChatWidgetViewOptions | undefined,
		editors: { editor: ICodeEditor; notebookEditor?: INotebookEditor },
		/** @deprecated should go away with inline2 */
		clearDelegate: () => Promise<void>,
		@IInstantiationService instaService: IInstantiationService,
		@ILogService logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editors.editor, InlineChatZoneWidget.#options);
		this.notebookEditor = editors.notebookEditor;

		this.#logService = logService;

		// Build termination card DOM
		this.#terminationCard = $('div.inline-chat-terminated-card.hidden');

		// Markdown scrollable area
		this.#terminationMarkdownContainer = $('div.markdown-scroll-container');
		this.#terminationMarkdownMessage = $('div.markdown-message');
		this.#terminationMarkdownContainer.appendChild(this.#terminationMarkdownMessage);
		this.#terminationMarkdownScrollable = this._disposables.add(new DomScrollableElement(this.#terminationMarkdownContainer, {
			consumeMouseWheelIfScrollbarIsNeeded: true,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));
		this.#terminationCard.appendChild(this.#terminationMarkdownScrollable.getDomNode());

		// Toolbar row
		const contentRow = $('div.content-row');
		this.#terminationToolbar = $('div.toolbar');
		contentRow.appendChild(this.#terminationToolbar);
		this.#terminationCard.appendChild(contentRow);
		this._disposables.add(this.#terminationStore);

		this.#ctxCursorPosition = CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.bindTo(contextKeyService);

		this._disposables.add(toDisposable(() => {
			this.#ctxCursorPosition.reset();
		}));

		this.widget = instaService.createInstance(EditorBasedInlineChatWidget, location, this.editor, {
			statusMenuId: {
				menu: MENU_INLINE_CHAT_WIDGET_STATUS,
				options: {
					buttonConfigProvider: (action, index) => {
						const isSecondary = index > 0;
						if (new Set([ACTION_REGENERATE_RESPONSE, ACTION_TOGGLE_DIFF, ACTION_REPORT_ISSUE]).has(action.id)) {
							return { isSecondary, showIcon: true, showLabel: false };
						} else {
							return { isSecondary };
						}
					}
				}
			},
			secondaryMenuId: MENU_INLINE_CHAT_WIDGET_SECONDARY,
			inZoneWidget: true,
			chatWidgetViewOptions: {
				menus: {
					telemetrySource: 'interactiveEditorWidget-toolbar',
					inputSideToolbar: MENU_INLINE_CHAT_SIDE
				},
				clear: clearDelegate,
				...options,
				rendererOptions: {
					renderTextEditsAsSummary: (uri) => {
						// render when dealing with the current file in the editor
						return isEqual(uri, editors.editor.getModel()?.uri);
					},
					renderDetectedCommandsWithRequest: true,
					...options?.rendererOptions
				},
				defaultMode: ChatMode.Ask
			}
		});
		this._disposables.add(this.widget);

		let revealFn: (() => void) | undefined;
		this._disposables.add(this.widget.chatWidget.onWillMaybeChangeHeight(() => {
			if (this.position) {
				revealFn = this.#createZoneAndScrollRestoreFn(this.position);
			}
		}));
		this._disposables.add(this.widget.onDidChangeHeight(() => {
			if (this.position && !this._usesResizeHeight) {
				// only relayout when visible
				revealFn ??= this.#createZoneAndScrollRestoreFn(this.position);
				const height = this.#computeHeight();
				this._relayout(height.linesValue);
				revealFn?.();
				revealFn = undefined;
			}
		}));

		this.create();

		this._disposables.add(autorun(r => {
			const isBusy = this.widget.requestInProgress.read(r);
			this.domNode.firstElementChild?.classList.toggle('busy', isBusy);
		}));

		this._disposables.add(addDisposableListener(this.domNode, 'click', e => {
			if (!this.editor.hasWidgetFocus() && !this.widget.hasFocus()) {
				this.editor.focus();
			}
		}, true));


		// todo@jrieken listen ONLY when showing
		const updateCursorIsAboveContextKey = () => {
			if (!this.position || !this.editor.hasModel()) {
				this.#ctxCursorPosition.reset();
			} else if (this.position.lineNumber === this.editor.getPosition().lineNumber) {
				this.#ctxCursorPosition.set('above');
			} else if (this.position.lineNumber + 1 === this.editor.getPosition().lineNumber) {
				this.#ctxCursorPosition.set('below');
			} else {
				this.#ctxCursorPosition.reset();
			}
		};
		this._disposables.add(this.editor.onDidChangeCursorPosition(e => updateCursorIsAboveContextKey()));
		this._disposables.add(this.editor.onDidFocusEditorText(e => updateCursorIsAboveContextKey()));
		updateCursorIsAboveContextKey();
	}

	protected override _fillContainer(container: HTMLElement): void {

		container.style.setProperty('--vscode-inlineChat-background', 'var(--vscode-editor-background)');

		container.appendChild(this.widget.domNode);
		container.appendChild(this.#terminationCard);
	}

	showTerminationCard(message: string | IMarkdownString, instaService: IInstantiationService): void {
		this.#terminationStore.clear();

		const markdownMessage = typeof message === 'string'
			? new MarkdownString(message, { supportThemeIcons: true })
			: message;
		const text = renderAsPlaintext(typeof message === 'string' ? new MarkdownString(message) : message);

		// Markdown rendering with $(info) icon prefix in scrollable area
		this.#terminationMarkdownMessage.replaceChildren();
		const rendered = this.#terminationStore.add(renderMarkdown(markdownMessage));
		this.#terminationMarkdownMessage.appendChild(rendered.element);
		this.#terminationMarkdownScrollable.getDomNode().classList.remove('hidden');
		this.#terminationMarkdownScrollable.scanDomNode();

		// Toolbar - focus the owning editor before running any action so that
		// EditorAction2-based actions resolve the correct editor instance.
		const editor = this.editor;
		const actionRunner = this.#terminationStore.add(new class extends ActionRunner {
			protected override async runAction(action: IAction, context?: unknown): Promise<void> {
				editor.focus();
				return super.runAction(action, context);
			}
		});
		this.#terminationToolbar.replaceChildren();
		this.#terminationStore.add(instaService.createInstance(MenuWorkbenchToolBar, this.#terminationToolbar, MenuId.ChatEditorInlineExecute, {
			telemetrySource: 'inlineChatZone.terminationToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			actionRunner,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			menuOptions: { renderShortTitle: true },
		}));

		// Flip visibility
		this.widget.domNode.style.display = 'none';
		this.#terminationCard.classList.remove('hidden');

		// Announce for screen readers
		aria.status(text);

		// Relayout
		if (this.position) {
			const revealFn = this.#createZoneAndScrollRestoreFn(this.position);
			const height = this.#computeHeight();
			this._relayout(height.linesValue);
			revealFn();
		}
	}

	hideTerminationCard(): void {
		this.#terminationStore.clear();
		this.#terminationCard.classList.add('hidden');
		this.widget.domNode.style.display = '';

		// Relayout
		if (this.position) {
			const revealFn = this.#createZoneAndScrollRestoreFn(this.position);
			const height = this.#computeHeight();
			this._relayout(height.linesValue);
			revealFn();
		}
	}

	get isShowingTerminationCard(): boolean {
		return !this.#terminationCard.classList.contains('hidden');
	}

	protected override _doLayout(heightInPixel: number): void {

		this.#updatePadding();

		const info = this.editor.getLayoutInfo();
		const width = info.contentWidth - info.verticalScrollbarWidth;
		// width = Math.min(850, width);

		this.#dimension = new Dimension(width, heightInPixel);
		this.widget.layout(this.#dimension);

		if (this.isShowingTerminationCard) {
			// Set explicit maxHeight on the scrollable and its container so DomScrollableElement
			// knows it needs to show a scrollbar (same pattern as the overlay widget)
			const maxHeight = Math.max(50, heightInPixel - 40); // reserve space for toolbar row
			this.#terminationMarkdownScrollable.getDomNode().style.maxHeight = `${maxHeight}px`;
			this.#terminationMarkdownContainer.style.maxHeight = `${maxHeight}px`;
			this.#terminationMarkdownScrollable.scanDomNode();
		}
	}

	#computeHeight(): { linesValue: number; pixelsValue: number } {
		const editorHeight = this.notebookEditor?.getLayoutInfo().height ?? this.editor.getLayoutInfo().height;

		let innerHeight: number;
		if (this.isShowingTerminationCard) {
			innerHeight = this.#terminationCard.offsetHeight || 80; // fallback before first layout
		} else {
			innerHeight = this.widget.contentHeight;
		}

		const contentHeight = this._decoratingElementsHeight() + Math.min(innerHeight, Math.max(this.widget.minHeight, editorHeight * 0.42));
		const heightInLines = contentHeight / this.editor.getOption(EditorOption.lineHeight);
		return { linesValue: heightInLines, pixelsValue: contentHeight };
	}

	protected override _getResizeBounds(): { minLines: number; maxLines: number } {
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const decoHeight = this._decoratingElementsHeight();

		const minHeightPx = decoHeight + this.widget.minHeight;
		const maxHeightPx = decoHeight + this.widget.contentHeight;

		return {
			minLines: minHeightPx / lineHeight,
			maxLines: maxHeightPx / lineHeight
		};
	}

	protected override _onWidth(_widthInPixel: number): void {
		if (this.#dimension) {
			this._doLayout(this.#dimension.height);
		}
	}

	override show(position: Position): void {
		assertType(this.container);

		this.#updatePadding();

		const revealZone = this.#createZoneAndScrollRestoreFn(position);
		super.show(position, this.#computeHeight().linesValue);
		this.widget.chatWidget.setVisible(true);
		this.widget.focus();

		revealZone();
	}

	#updatePadding() {
		assertType(this.container);

		const info = this.editor.getLayoutInfo();
		const marginWithoutIndentation = info.glyphMarginWidth + info.lineNumbersWidth + info.decorationsWidth;
		this.container.style.paddingLeft = `${marginWithoutIndentation}px`;
	}

	reveal(position: Position) {
		const stickyScroll = this.editor.getOption(EditorOption.stickyScroll);
		const magicValue = stickyScroll.enabled ? stickyScroll.maxLineCount : 0;
		this.editor.revealLines(position.lineNumber + magicValue, position.lineNumber + magicValue, ScrollType.Immediate);
		this.updatePositionAndHeight(position);
	}

	override updatePositionAndHeight(position: Position): void {
		const revealZone = this.#createZoneAndScrollRestoreFn(position);
		super.updatePositionAndHeight(position, !this._usesResizeHeight ? this.#computeHeight().linesValue : undefined);
		revealZone();
	}

	#createZoneAndScrollRestoreFn(position: Position): () => void {

		const scrollState = StableEditorBottomScrollState.capture(this.editor);

		const lineNumber = position.lineNumber <= 1 ? 1 : 1 + position.lineNumber;

		return () => {
			scrollState.restore(this.editor);

			const scrollTop = this.editor.getScrollTop();
			const lineTop = this.editor.getTopForLineNumber(lineNumber);
			const zoneTop = lineTop - this.#computeHeight().pixelsValue;
			const editorHeight = this.editor.getLayoutInfo().height;
			const lineBottom = this.editor.getBottomForLineNumber(lineNumber);

			let newScrollTop = zoneTop;
			let forceScrollTop = false;

			if (lineBottom >= (scrollTop + editorHeight)) {
				// revealing the top of the zone would push out the line we are interested in and
				// therefore we keep the line in the viewport
				newScrollTop = lineBottom - editorHeight;
				forceScrollTop = true;
			}

			if (newScrollTop < scrollTop || forceScrollTop) {
				this.#logService.trace('[IE] REVEAL zone', { zoneTop, lineTop, lineBottom, scrollTop, newScrollTop, forceScrollTop });
				this.editor.setScrollTop(newScrollTop, ScrollType.Immediate);
			}
		};
	}

	protected override revealRange(range: Range, isLastLine: boolean): void {
		// noop
	}

	override hide(): void {
		const scrollState = StableEditorBottomScrollState.capture(this.editor);
		this.#ctxCursorPosition.reset();
		this.#terminationStore.clear();
		this.#terminationCard.classList.add('hidden');
		this.widget.domNode.style.display = '';
		this.widget.chatWidget.setVisible(false);
		super.hide();
		aria.status(localize('inlineChatClosed', 'Closed inline chat widget'));
		scrollState.restore(this.editor);
	}
}
