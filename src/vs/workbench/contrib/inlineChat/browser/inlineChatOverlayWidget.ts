/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inlineChatOverlayWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { renderAsPlaintext, renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { WorkbenchActionBar } from '../../../../platform/actions/browser/actionbar.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableFromEvent, observableFromEventOpts, observableValue } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IActiveCodeEditor, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { ObservableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatEditingAcceptRejectActionViewItem } from '../../chat/browser/chatEditing/chatEditingEditorOverlay.js';
import { CTX_INLINE_CHAT_INPUT_HAS_TEXT, CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED } from '../common/inlineChat.js';
import { StickyScrollController } from '../../../../editor/contrib/stickyScroll/browser/stickyScrollController.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { IInlineChatSession2 } from './inlineChatSessionService.js';
import { assertType } from '../../../../base/common/types.js';
import { IInlineChatHistoryService } from './inlineChatHistoryService.js';

/**
 * Overlay widget that displays a vertical action bar menu.
 */
export class InlineChatInputWidget extends Disposable {

	readonly #domNode: HTMLElement;
	readonly #container: HTMLElement;
	readonly #inputContainer: HTMLElement;
	readonly #toolbarContainer: HTMLElement;
	readonly #input: IActiveCodeEditor;
	readonly #position = observableValue<IOverlayWidgetPosition | null>(this, null);
	readonly position: IObservable<IOverlayWidgetPosition | null> = this.#position;

	readonly #showStore = this._store.add(new DisposableStore());
	readonly #stickyScrollHeight: IObservable<number>;
	readonly #layoutData: IObservable<{ totalWidth: number; toolbarWidth: number; height: number; editorPad: number }>;
	#anchorLineNumber: number = 0;
	#anchorLeft: number = 0;
	#anchorAbove: boolean = false;

	readonly #editorObs: ObservableCodeEditor;
	readonly #historyService: IInlineChatHistoryService;

	constructor(
		editorObs: ObservableCodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInlineChatHistoryService historyService: IInlineChatHistoryService,
	) {
		super();

		this.#editorObs = editorObs;
		this.#historyService = historyService;

		// Create container
		this.#domNode = dom.$('.inline-chat-gutter-menu');

		// Create inner container (background + focus border)
		this.#container = dom.append(this.#domNode, dom.$('.inline-chat-gutter-container'));

		// Create input editor container
		this.#inputContainer = dom.append(this.#container, dom.$('.input'));

		// Create toolbar container
		this.#toolbarContainer = dom.append(this.#container, dom.$('.toolbar'));

		// Create vertical actions bar below the input container
		const actionsContainer = dom.append(this.#domNode, dom.$('.inline-chat-gutter-actions'));
		const actionBar = this._store.add(instantiationService.createInstance(WorkbenchActionBar, actionsContainer, {
			orientation: ActionsOrientation.VERTICAL,
			preventLoopNavigation: true,
			telemetrySource: 'inlineChatInput.actionBar',
		}));
		const actionsMenu = this._store.add(menuService.createMenu(MenuId.ChatEditorInlineMenu, contextKeyService));
		const updateActions = () => {
			const actions = getFlatActionBarActions(actionsMenu.getActions({ shouldForwardArgs: true }));
			actionBar.clear();
			actionBar.push(actions);
			dom.setVisibility(actions.length > 0, actionsContainer);
		};
		this._store.add(actionsMenu.onDidChange(updateActions));
		updateActions();

		// Create editor options
		const options = getSimpleEditorOptions(configurationService);
		options.wordWrap = 'off';
		options.wrappingStrategy = 'advanced';
		options.lineNumbers = 'off';
		options.glyphMargin = false;
		options.lineDecorationsWidth = 0;
		options.lineNumbersMinChars = 0;
		options.folding = false;
		options.minimap = { enabled: false };
		options.scrollbar = { vertical: 'hidden', horizontal: 'hidden', alwaysConsumeMouseWheel: true };
		options.renderLineHighlight = 'none';
		options.fontFamily = DEFAULT_FONT_FAMILY;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.cursorWidth = 1;
		options.padding = { top: 2, bottom: 2 };

		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				PlaceholderTextContribution.ID,
			])
		};

		this.#input = this._store.add(instantiationService.createInstance(CodeEditorWidget, this.#inputContainer, options, codeEditorWidgetOptions)) as IActiveCodeEditor;

		const model = this._store.add(modelService.createModel('', null, URI.parse(`gutter-input:${Date.now()}`), true));
		this.#input.setModel(model);

		// Create toolbar
		const toolbar = this._store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this.#toolbarContainer, MenuId.InlineChatInput, {
			telemetrySource: 'inlineChatInput.toolbar',
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: {
				primaryGroup: () => true,
			},
			menuOptions: { shouldForwardArgs: true },
		}));

		// Initialize sticky scroll height observable
		const stickyScrollController = StickyScrollController.get(this.#editorObs.editor);
		this.#stickyScrollHeight = stickyScrollController ? observableFromEvent(stickyScrollController.onDidChangeStickyScrollHeight, () => stickyScrollController.stickyScrollWidgetHeight) : constObservable(0);

		// Track toolbar width changes
		const toolbarWidth = observableValue<number>(this, 0);
		const resizeObserver = new dom.DisposableResizeObserver(() => {
			toolbarWidth.set(dom.getTotalWidth(toolbar.getElement()), undefined);
		});
		this._store.add(resizeObserver);
		this._store.add(resizeObserver.observe(toolbar.getElement()));

		const contentWidth = observableFromEvent(this, this.#input.onDidChangeModelContent, () => this.#input.getContentWidth());
		const contentHeight = observableFromEvent(this, this.#input.onDidContentSizeChange, () => this.#input.getContentHeight());

		this.#layoutData = derived(r => {
			const editorPad = 6;
			const totalWidth = contentWidth.read(r) + editorPad + toolbarWidth.read(r);
			const minWidth = 220;
			const maxWidth = 600;
			const midWidth = Math.round(maxWidth / 1.618);
			let clampedWidth: number;
			if (this.#input.getOption(EditorOption.wordWrap) === 'on') {
				clampedWidth = maxWidth;
			} else if (totalWidth <= minWidth) {
				clampedWidth = minWidth;
			} else if (totalWidth <= midWidth) {
				clampedWidth = midWidth;
			} else {
				clampedWidth = maxWidth;
			}

			const lineHeight = this.#input.getOption(EditorOption.lineHeight);
			const clampedHeight = Math.min(contentHeight.read(r), (3 * lineHeight));

			if (totalWidth > clampedWidth) {
				// enable word wrap
				this.#input.updateOptions({ wordWrap: 'on', });
			}

			return {
				editorPad,
				toolbarWidth: toolbarWidth.read(r),
				totalWidth: clampedWidth,
				height: clampedHeight
			};
		});

		// Update container width and editor layout when width changes
		this._store.add(autorun(r => {
			const { editorPad, toolbarWidth, totalWidth, height } = this.#layoutData.read(r);

			const inputWidth = totalWidth - toolbarWidth - editorPad;
			this.#container.style.width = `${totalWidth}px`;
			this.#inputContainer.style.width = `${inputWidth}px`;
			this.#input.layout({ width: inputWidth, height });
			if (this.#position.read(undefined) !== null) {
				this.#updatePosition();
			}
		}));

		// Toggle focus class on the container
		this._store.add(this.#input.onDidFocusEditorText(() => this.#container.classList.add('focused')));
		this._store.add(this.#input.onDidBlurEditorText(() => this.#container.classList.remove('focused')));

		// Toggle scroll decoration on the toolbar
		this._store.add(this.#input.onDidScrollChange(e => {
			this.#toolbarContainer.classList.toggle('fake-scroll-decoration', e.scrollTop > 0);
		}));


		// Track input text for context key and adjust width based on content
		const inputHasText = CTX_INLINE_CHAT_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this._store.add(this.#input.onDidChangeModelContent(() => {
			inputHasText.set(this.#input.getModel().getValue().trim().length > 0);
		}));
		this._store.add(toDisposable(() => inputHasText.reset()));

		// Track focus state
		const inputWidgetFocused = CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED.bindTo(contextKeyService);
		this._store.add(this.#input.onDidFocusEditorText(() => inputWidgetFocused.set(true)));
		this._store.add(this.#input.onDidBlurEditorText(() => inputWidgetFocused.set(false)));
		this._store.add(toDisposable(() => inputWidgetFocused.reset()));

		// Handle key events: ArrowUp/ArrowDown for history navigation and action bar focus
		this._store.add(this.#input.onKeyDown(e => {
			if (e.keyCode === KeyCode.UpArrow) {
				const position = this.#input.getPosition();
				if (position && position.lineNumber === 1) {
					this.#showPreviousHistoryValue();
					e.preventDefault();
					e.stopPropagation();
				}
			} else if (e.keyCode === KeyCode.DownArrow) {
				const model = this.#input.getModel();
				const position = this.#input.getPosition();
				if (position && position.lineNumber === model.getLineCount()) {
					if (!this.#historyService.isAtEnd()) {
						this.#showNextHistoryValue();
						e.preventDefault();
						e.stopPropagation();
					} else if (!actionBar.isEmpty()) {
						e.preventDefault();
						e.stopPropagation();
						actionBar.focus(0);
					}
				}
			}
		}));

		// ArrowUp on first action bar item moves focus back to input editor
		// Escape on action bar hides the widget
		this._store.add(dom.addDisposableListener(actionBar.domNode, 'keydown', (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Escape) {
				event.preventDefault();
				event.stopPropagation();
				this.hide();
			} else if (event.keyCode === KeyCode.UpArrow) {
				const firstItem = actionBar.viewItems[0] as BaseActionViewItem | undefined;
				if (firstItem?.element && dom.isAncestorOfActiveElement(firstItem.element)) {
					event.preventDefault();
					event.stopPropagation();
					this.#input.focus();
				}
			}
		}, true));

		// Track focus - hide when focus leaves
		const focusTracker = this._store.add(dom.trackFocus(this.#domNode));
		this._store.add(focusTracker.onDidBlur(() => this.hide()));
	}

	get value(): string {
		return this.#input.getModel().getValue().trim();
	}

	addToHistory(value: string): void {
		this.#historyService.addToHistory(value);
	}

	#showPreviousHistoryValue(): void {
		if (this.#historyService.isAtEnd()) {
			this.#historyService.replaceLast(this.#input.getModel().getValue());
		}
		const value = this.#historyService.previousValue();
		if (value !== undefined) {
			this.#input.getModel().setValue(value);
		}
	}

	#showNextHistoryValue(): void {
		if (this.#historyService.isAtEnd()) {
			return;
		}
		const value = this.#historyService.nextValue();
		if (value !== undefined) {
			this.#input.getModel().setValue(value);
		}
	}

	/**
	 * Show the widget at the specified line.
	 * @param lineNumber The line number to anchor the widget to
	 * @param left Left offset relative to editor
	 * @param anchorAbove Whether to anchor above the position (widget grows upward)
	 */
	show(lineNumber: number, left: number, anchorAbove: boolean, placeholder: string, value?: string): void {
		this.#showStore.clear();

		// Reset history cursor to the end (current uncommitted text)
		this.#historyService.resetCursor();

		// Clear input state
		this.#input.updateOptions({ wordWrap: 'off', placeholder });
		this.#input.getModel().setValue(value ?? '');

		// Store anchor info for scroll updates
		this.#anchorLineNumber = lineNumber;
		this.#anchorLeft = left;
		this.#anchorAbove = anchorAbove;

		// Set initial position
		this.#updatePosition();

		// Create overlay widget via observable pattern
		this.#showStore.add(this.#editorObs.createOverlayWidget({
			domNode: this.#domNode,
			position: this.#position,
			minContentWidthInPx: constObservable(0),
			allowEditorOverflow: true,
		}));

		// Re-adjust position after render to account for widget dimensions (offsetWidth/offsetHeight
		// are only available after the widget is added to the DOM)
		this.#updatePosition();

		// Update position on scroll, hide if anchor line is out of view (only when input is empty)
		this.#showStore.add(this.#editorObs.editor.onDidScrollChange(() => {
			const visibleRanges = this.#editorObs.editor.getVisibleRanges();
			const isLineVisible = visibleRanges.some(range =>
				this.#anchorLineNumber >= range.startLineNumber && this.#anchorLineNumber <= range.endLineNumber
			);
			const hasContent = !!this.#input.getModel().getValue();
			if (!isLineVisible && !hasContent) {
				this.hide();
			} else {
				this.#updatePosition();
			}
		}));

		// Update position when the editor resizes (e.g. sidebar toggle, window resize)
		this.#showStore.add(this.#editorObs.editor.onDidLayoutChange(() => {
			this.#updatePosition();
		}));

		// Focus the input editor
		setTimeout(() => {
			this.#input.focus();
			if (value) {
				this.#input.setSelection(this.#input.getModel().getFullModelRange());
			}
		}, 0);
	}

	#updatePosition(): void {
		const editor = this.#editorObs.editor;
		const lineHeight = editor.getOption(EditorOption.lineHeight);
		const top = editor.getTopForLineNumber(this.#anchorLineNumber) - editor.getScrollTop();
		let adjustedTop = top;

		if (this.#anchorAbove) {
			const widgetHeight = this.#domNode.offsetHeight;
			adjustedTop = top - widgetHeight;
		} else {
			adjustedTop = top + lineHeight;
		}

		// Clamp to viewport bounds when anchor line is out of view
		const stickyScrollHeight = this.#stickyScrollHeight.get();
		const layoutInfo = editor.getLayoutInfo();
		const widgetHeight = this.#domNode.offsetHeight;
		const widgetWidth = this.#domNode.offsetWidth;
		const minTop = stickyScrollHeight;
		const maxTop = layoutInfo.height - widgetHeight;
		const padding = 8;
		const maxLeft = layoutInfo.width - layoutInfo.verticalScrollbarWidth - layoutInfo.minimap.minimapWidth - widgetWidth - padding;

		const clampedTop = Math.max(minTop, Math.min(adjustedTop, maxTop));
		const clampedLeft = Math.max(0, Math.min(this.#anchorLeft, maxLeft));
		const isClamped = clampedTop !== adjustedTop || clampedLeft !== this.#anchorLeft;
		this.#domNode.classList.toggle('clamped', isClamped);

		this.#position.set({
			preference: { top: clampedTop, left: clampedLeft },
			stackOrdinal: 10000,
		}, undefined);
	}

	hide(): void {
		const editorDomNode = this.#editorObs.editor.getDomNode();
		if (editorDomNode && dom.isAncestorOfActiveElement(editorDomNode)) {
			this.#editorObs.editor.focus();
		}
		this.#position.set(null, undefined);
		this.#input.getModel().setValue('');
		this.#showStore.clear();
	}
}

/**
 * Overlay widget that displays progress messages during inline chat requests.
 */
export class InlineChatSessionOverlayWidget extends Disposable {

	readonly #domNode: HTMLElement = document.createElement('div');
	readonly #container: HTMLElement;
	readonly #markdownContainer: HTMLElement;
	readonly #markdownMessage: HTMLElement;
	readonly #markdownScrollable: DomScrollableElement;
	readonly #contentRow: HTMLElement;
	readonly #statusNode: HTMLElement;
	readonly #icon: HTMLElement;
	readonly #message: HTMLElement;
	readonly #toolbarNode: HTMLElement;

	readonly #showStore = this._store.add(new DisposableStore());
	readonly #position = observableValue<IOverlayWidgetPosition | null>(this, null);
	readonly #minContentWidthInPx = constObservable(0);

	readonly #stickyScrollHeight: IObservable<number>;

	readonly #editorObs: ObservableCodeEditor;
	readonly #instaService: IInstantiationService;
	readonly #keybindingService: IKeybindingService;

	constructor(
		editorObs: ObservableCodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();

		this.#editorObs = editorObs;
		this.#instaService = instaService;
		this.#keybindingService = keybindingService;

		this.#domNode.classList.add('inline-chat-session-overlay-widget');

		this.#container = document.createElement('div');
		this.#domNode.appendChild(this.#container);
		this.#container.classList.add('inline-chat-session-overlay-container');

		this.#markdownContainer = document.createElement('div');
		this.#markdownContainer.classList.add('markdown-scroll-container');

		this.#markdownMessage = document.createElement('div');
		this.#markdownMessage.classList.add('markdown-message');
		this.#markdownContainer.appendChild(this.#markdownMessage);
		this.#markdownScrollable = this._store.add(new DomScrollableElement(this.#markdownContainer, {
			consumeMouseWheelIfScrollbarIsNeeded: true,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));
		this.#container.appendChild(this.#markdownScrollable.getDomNode());

		this.#contentRow = document.createElement('div');
		this.#contentRow.classList.add('content-row');
		this.#container.appendChild(this.#contentRow);

		// Create status node with icon and message
		this.#statusNode = document.createElement('div');
		this.#statusNode.classList.add('status');
		this.#icon = dom.append(this.#statusNode, dom.$('span'));
		this.#message = dom.append(this.#statusNode, dom.$('span.message'));
		this.#contentRow.appendChild(this.#statusNode);

		// Create toolbar node
		this.#toolbarNode = document.createElement('div');
		this.#toolbarNode.classList.add('toolbar');

		// Initialize sticky scroll height observable
		const stickyScrollController = StickyScrollController.get(this.#editorObs.editor);
		this.#stickyScrollHeight = stickyScrollController ? observableFromEvent(stickyScrollController.onDidChangeStickyScrollHeight, () => stickyScrollController.stickyScrollWidgetHeight) : constObservable(0);
	}

	show(session: IInlineChatSession2): void {
		assertType(this.#editorObs.editor.hasModel());
		this.#showStore.clear();

		// Derived entry observable for this session
		const entry = derived(r => session.editingSession.readEntry(session.uri, r));

		// Set up status message and icon observable
		const requestMessage = derived(r => {
			const chatModel = session?.chatModel;
			if (!session || !chatModel) {
				return undefined;
			}

			const terminationState = session.terminationState.read(r);
			if (terminationState) {
				return {
					markdown: terminationState,
					icon: Codicon.info
				};
			}

			const response = chatModel.lastRequestObs.read(r)?.response;
			if (!response) {
				return { message: localize('working', "Working..."), icon: ThemeIcon.modify(Codicon.loading, 'spin') };
			}

			if (response.isComplete) {
				// Check for errors first
				const result = response.result;
				if (result?.errorDetails) {
					return {
						message: localize('error', "Sorry, your request failed"),
						icon: Codicon.error
					};
				}

				const changes = entry.read(r)?.changesCount.read(r) ?? 0;
				return {
					message: changes === 0
						? localize('done', "Done")
						: changes === 1
							? localize('done1', "Done, 1 change")
							: localize('doneN', "Done, {0} changes", changes),
					icon: Codicon.check
				};
			}

			const pendingConfirmation = response.isPendingConfirmation.read(r);
			if (pendingConfirmation) {
				return {
					message: localize('needsApproval', "Sorry, but an unexpected error happened"),
					icon: Codicon.error
				};
			}

			const lastPart = observableFromEventOpts({ equalsFn: () => false }, response.onDidChange, () => response.response.value)
				.read(r)
				.filter(part => part.kind === 'progressMessage' || part.kind === 'toolInvocation')
				.at(-1);

			if (lastPart?.kind === 'toolInvocation') {
				return { message: lastPart.invocationMessage, icon: ThemeIcon.modify(Codicon.loading, 'spin') };
			} else if (lastPart?.kind === 'progressMessage') {
				return { message: lastPart.content, icon: ThemeIcon.modify(Codicon.loading, 'spin') };
			} else {
				return { message: localize('working', "Working..."), icon: ThemeIcon.modify(Codicon.loading, 'spin') };
			}
		});

		const markdownStore = this.#showStore.add(new DisposableStore());

		this.#showStore.add(autorun(r => {
			const value = requestMessage.read(r);
			if (value) {
				if (value.message && value.icon) {
					this.#message.innerText = renderAsPlaintext(value.message);
					this.#icon.className = '';
					this.#icon.classList.add(...ThemeIcon.asClassNameArray(value.icon));
					this.#statusNode.classList.remove('hidden');
					this.#contentRow.classList.remove('status-hidden');
				} else {
					this.#message.innerText = '';
					this.#icon.className = '';
					this.#statusNode.classList.add('hidden');
					this.#contentRow.classList.add('status-hidden');
				}
				markdownStore.clear();
				this.#markdownMessage.replaceChildren();
				if (value.markdown) {
					this.#markdownScrollable.getDomNode().classList.remove('hidden');
					const markdown = typeof value.markdown === 'string' ? new MarkdownString(value.markdown) : value.markdown;
					const rendered = markdownStore.add(renderMarkdown(markdown));
					this.#markdownMessage.appendChild(rendered.element);
					this.#markdownScrollable.scanDomNode();
				} else {
					this.#markdownScrollable.getDomNode().classList.add('hidden');
				}
			} else {
				this.#message.innerText = '';
				this.#icon.className = '';
				this.#statusNode.classList.add('hidden');
				this.#contentRow.classList.add('status-hidden');
				markdownStore.clear();
				this.#markdownMessage.replaceChildren();
				this.#markdownScrollable.getDomNode().classList.add('hidden');
			}
		}));

		// Add toolbar
		this.#contentRow.appendChild(this.#toolbarNode);
		this.#showStore.add(toDisposable(() => this.#toolbarNode.remove()));

		const that = this;

		// Focus the owning editor before running any toolbar action so that
		// EditorAction2-based actions resolve the correct editor instance
		// even when the user has clicked into a different editor.
		const actionRunner = this.#showStore.add(new class extends ActionRunner {
			protected override async runAction(action: IAction, context?: unknown): Promise<void> {
				that.#editorObs.editor.focus();
				return super.runAction(action, context);
			}
		});

		this.#showStore.add(this.#instaService.createInstance(MenuWorkbenchToolBar, this.#toolbarNode, MenuId.ChatEditorInlineExecute, {
			telemetrySource: 'inlineChatProgress.overlayToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			actionRunner,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {
				const primaryActions = ['inlineChat2.cancel', 'inlineChat2.keep', 'inlineChat2.rephrase'];
				const labeledActions = primaryActions.concat(['inlineChat2.undo']);

				if (!labeledActions.includes(action.id)) {
					return undefined; // use default action view item with label
				}

				return new ChatEditingAcceptRejectActionViewItem(action, { ...options, keybinding: undefined }, entry, undefined, that.#keybindingService, primaryActions);
			}
		}));

		// Position in top right of editor, below sticky scroll
		const lineHeight = this.#editorObs.getOption(EditorOption.lineHeight);

		// Track widget width changes
		const widgetWidth = observableValue<number>(this, 0);
		const resizeObserver = new dom.DisposableResizeObserver(() => {
			widgetWidth.set(this.#domNode.offsetWidth, undefined);
		});
		this.#showStore.add(resizeObserver);
		this.#showStore.add(resizeObserver.observe(this.#domNode));

		this.#showStore.add(autorun(r => {
			const layoutInfo = this.#editorObs.layoutInfo.read(r);
			const stickyScrollHeight = this.#stickyScrollHeight.read(r);
			const width = widgetWidth.read(r);
			const padding = Math.round(lineHeight.read(r) * 2 / 3);

			// Cap max-width to the editor viewport (content area)
			const maxWidth = Math.min(400, layoutInfo.contentWidth - 2 * padding);
			const maxHeight = Math.min(150, Math.floor(layoutInfo.height / 3));
			this.#domNode.style.maxWidth = `${maxWidth}px`;
			this.#markdownScrollable.getDomNode().style.maxHeight = `${maxHeight}px`;
			this.#markdownContainer.style.maxHeight = `${maxHeight}px`;
			this.#markdownScrollable.scanDomNode();

			// Position: top right, below sticky scroll with padding, left of minimap and scrollbar
			const top = stickyScrollHeight + padding;
			const left = layoutInfo.width - width - layoutInfo.verticalScrollbarWidth - layoutInfo.minimap.minimapWidth - padding;

			this.#position.set({
				preference: { top, left },
				stackOrdinal: 10000,
			}, undefined);
		}));

		// Create overlay widget
		this.#showStore.add(this.#editorObs.createOverlayWidget({
			domNode: this.#domNode,
			position: this.#position,
			minContentWidthInPx: this.#minContentWidthInPx,
			allowEditorOverflow: false,
		}));
	}

	hide(): void {
		this.#position.set(null, undefined);
		this.#showStore.clear();
	}
}
