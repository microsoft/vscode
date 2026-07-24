/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { IMouseWheelEvent } from '../../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { ITreeContextMenuEvent, ITreeElement, ITreeFilter } from '../../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ScrollEvent } from '../../../../../base/common/scrollable.js';
import { URI } from '../../../../../base/common/uri.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { asCssVariable, buttonSecondaryBackground, buttonSecondaryForeground, buttonSecondaryHoverBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { katexContainerClassName } from '../../../markdown/common/markedKatexExtension.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatFollowup, IChatSendRequestOptions, IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { IChatRequestModeInfo } from '../../common/model/chatModel.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatAccessibilityProvider } from '../accessibility/chatAccessibilityProvider.js';
import { ChatTreeItem, IChatAccessibilityService, IChatCodeBlockInfo, IChatFileTreeInfo, IChatListItemRendererOptions } from '../chat.js';
import { CodeBlockPart } from './chatContentParts/codeBlockPart.js';
import { ChatCollapsibleContentPart } from './chatContentParts/chatCollapsibleContentPart.js';
import { ChatListDelegate, ChatListItemRenderer, IChatListItemTemplate, IChatRendererDelegate } from './chatListRenderer.js';
import { ChatEditorOptions } from './chatOptions.js';
import { ChatPendingDragController } from './chatPendingDragAndDrop.js';

export interface IChatListWidgetStyles {
	listForeground?: string;
	listBackground?: string;
}

/**
 * Tracks when a user-triggered resize has remained stable across animation frames.
 */
export class UserToggleResizeState {

	private framesUntilSettled = 0;
	private transitionInProgress = false;

	constructor(private readonly requiredStableFrames: number) { }

	get isActive(): boolean {
		return this.transitionInProgress || this.framesUntilSettled > 0;
	}

	start(): void {
		this.framesUntilSettled = this.requiredStableFrames;
	}

	markResized(): void {
		if (this.isActive) {
			this.framesUntilSettled = this.requiredStableFrames;
		}
	}

	startTransition(): void {
		this.transitionInProgress = true;
	}

	endTransition(): void {
		this.transitionInProgress = false;
		this.framesUntilSettled = this.requiredStableFrames;
	}

	advanceFrame(): void {
		if (this.isActive) {
			this.framesUntilSettled--;
		}
	}
}

export function getAnchoredScrollTop(scrollTop: number, currentTargetTop: number, anchorTargetTop: number): number {
	return scrollTop + currentTargetTop - anchorTargetTop;
}

/**
 * Computes the scroll-down state for the chat list, keeping two concerns decoupled:
 *
 * - `showButton`: whether the "scroll to bottom" affordance is shown. Driven purely by the actual
 *   scroll position so the user can always jump to the latest content when the view is not at the
 *   bottom — including during an auto-scroll (agent) turn where the view has fallen behind. See
 *   https://github.com/microsoft/vscode/issues/326952 (previously this was also suppressed by the
 *   scroll lock, hiding the button for the whole agent turn).
 * - `atBottom`: the `chat-list-at-bottom` visual state that reserves streaming-response padding.
 *   Intentionally still honours the scroll lock so padding during auto-scroll turns is unchanged.
 */
export function computeScrollDownState(isScrolledToBottom: boolean, scrollLock: boolean): { showButton: boolean; atBottom: boolean } {
	return {
		showButton: !isScrolledToBottom,
		atBottom: isScrolledToBottom || scrollLock,
	};
}

class UserToggleResizeTracker extends Disposable {

	private readonly state = new UserToggleResizeState(2);
	private readonly pendingFrame = this._register(new MutableDisposable<IDisposable>());

	constructor(
		target: HTMLElement,
		private restoreScrollPosition: (() => void) | undefined,
		private readonly onDidSettle: () => void,
	) {
		super();

		const targetWindow = dom.getWindow(target);
		const resizeObserver = this._register(new dom.DisposableResizeObserver('ChatListWidget.userToggleResize', () => {
			this.state.markResized();
			this.scheduleFrame(targetWindow);
		}, targetWindow));
		this._register(resizeObserver.observe(target));
		this._register(dom.addDisposableListener(target, 'transitionrun', e => {
			if (e.propertyName === 'grid-template-rows') {
				this.state.startTransition();
				this.scheduleFrame(targetWindow);
			}
		}));
		const finishTransition = (e: TransitionEvent) => {
			if (e.propertyName === 'grid-template-rows') {
				this.state.endTransition();
				this.scheduleFrame(targetWindow);
			}
		};
		this._register(dom.addDisposableListener(target, 'transitionend', finishTransition));
		this._register(dom.addDisposableListener(target, 'transitioncancel', finishTransition));

		this.state.start();
		this.scheduleFrame(targetWindow);
	}

	restoreScrollAnchor(): void {
		this.restoreScrollPosition?.();
	}

	cancelScrollRestoration(): void {
		this.restoreScrollPosition = undefined;
	}

	private scheduleFrame(targetWindow: Window): void {
		if (this.pendingFrame.value) {
			return;
		}

		this.pendingFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => {
			this.pendingFrame.clear();
			this.restoreScrollPosition?.();
			this.state.advanceFrame();
			if (this.state.isActive) {
				this.scheduleFrame(targetWindow);
			} else {
				this.onDidSettle();
			}
		});
	}
}

export interface IChatListWidgetOptions {
	/**
	 * Options for the list item renderer.
	 */
	readonly rendererOptions?: IChatListItemRendererOptions;

	/**
	 * Default height for list elements.
	 */
	readonly defaultElementHeight?: number;

	/**
	 * DOM node for overflow widgets (e.g., code editors).
	 */
	readonly overflowWidgetsDomNode?: HTMLElement;

	/**
	 * Optional style overrides for the list.
	 */
	readonly styles?: IChatListWidgetStyles;

	/**
	 * Callback to get the current chat mode.
	 */
	readonly currentChatMode?: () => ChatModeKind;

	/**
	 * View ID for editor options (used in ChatWidget context).
	 */
	readonly viewId?: string;

	/**
	 * Input editor background color key.
	 */
	readonly inputEditorBackground?: string;

	/**
	 * Result editor background color key.
	 */
	readonly resultEditorBackground?: string;

	/**
	 * Optional filter for the tree.
	 */
	readonly filter?: ITreeFilter<ChatTreeItem, FuzzyScore>;

	/**
	 * Initial view model.
	 */
	readonly viewModel?: IChatViewModel;

	/**
	 * Optional pre-created editor options.
	 * If provided, these will be used instead of creating new ones.
	 */
	readonly editorOptions?: ChatEditorOptions;

	/**
	 * The chat location (for rerun requests).
	 */
	readonly location?: ChatAgentLocation;

	/**
	 * Callback to get the selected language model request options (for rerun requests).
	 */
	readonly getSelectedModelRequestOptions?: () => Pick<IChatSendRequestOptions, 'userSelectedModelId' | 'userSelectedModelConfiguration'>;

	/**
	 * Callback to get current mode info (for rerun requests).
	 */
	readonly getCurrentModeInfo?: () => IChatRequestModeInfo | undefined;

	/**
	 * The render style for the chat widget. Affects minimum height behavior.
	 */
	readonly renderStyle?: 'compact' | 'minimal';
}

/**
 * A reusable widget that encapsulates chat list/tree rendering.
 * This can be used in various contexts such as the main chat widget,
 * hover previews, etc.
 */
export class ChatListWidget extends Disposable {

	//#region Events

	private readonly _onDidScroll = this._register(new Emitter<ScrollEvent>());
	readonly onDidScroll: Event<ScrollEvent> = this._onDidScroll.event;

	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	readonly onDidChangeContentHeight: Event<void> = this._onDidChangeContentHeight.event;

	private readonly _onDidClickFollowup = this._register(new Emitter<IChatFollowup>());
	readonly onDidClickFollowup: Event<IChatFollowup> = this._onDidClickFollowup.event;

	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private readonly _onDidChangeItemHeight = this._register(new Emitter<{ element: ChatTreeItem; height: number }>());
	/** Event fired when an item's height changes. Used for dynamic layout mode. */
	readonly onDidChangeItemHeight: Event<{ element: ChatTreeItem; height: number }> = this._onDidChangeItemHeight.event;

	/**
	 * Event fired when a request item is clicked.
	 */
	get onDidClickRequest(): Event<IChatListItemTemplate> {
		return this._renderer.onDidClickRequest;
	}

	/**
	 * Event fired when an item is re-rendered.
	 */
	get onDidRerender(): Event<IChatListItemTemplate> {
		return this._renderer.onDidRerender;
	}

	/**
	 * Event fired when a template is disposed.
	 */
	get onDidDispose(): Event<IChatListItemTemplate> {
		return this._renderer.onDidDispose;
	}

	/**
	 * Event fired when focus moves outside the editing area.
	 */
	get onDidFocusOutside(): Event<void> {
		return this._renderer.onDidFocusOutside;
	}

	//#endregion

	//#region Private fields

	private readonly _tree: WorkbenchObjectTree<ChatTreeItem, FuzzyScore>;
	private readonly _delegate: ChatListDelegate;
	private readonly _renderer: ChatListItemRenderer;

	private _viewModel: IChatViewModel | undefined;
	private _visible = true;
	private _lastItem: ChatTreeItem | undefined;
	private _mostRecentlyFocusedItemIndex: number = -1;
	private _scrollLock: boolean = true;
	private _suppressAutoScroll: boolean = false;
	private _settingChangeCounter: number = 0;
	private _visibleChangeCount: number = 0;
	private readonly _userToggleResizeTrackers = this._register(new DisposableMap<ChatTreeItem, UserToggleResizeTracker>());

	private readonly _container: HTMLElement;
	private readonly _scrollDownButton: Button;
	private readonly _lastItemIdContextKey: IContextKey<string[]>;

	private readonly _location: ChatAgentLocation | undefined;
	private readonly _getSelectedModelRequestOptions: (() => Pick<IChatSendRequestOptions, 'userSelectedModelId' | 'userSelectedModelConfiguration'>) | undefined;
	private readonly _getCurrentModeInfo: (() => IChatRequestModeInfo | undefined) | undefined;
	private readonly _renderStyle: 'compact' | 'minimal' | undefined;

	//#endregion

	//#region Properties

	get domNode(): HTMLElement {
		return this._container;
	}

	get scrollTop(): number {
		return this._tree.scrollTop;
	}

	set scrollTop(value: number) {
		this._tree.scrollTop = value;
	}

	get scrollHeight(): number {
		return this._tree.scrollHeight;
	}

	get renderHeight(): number {
		return this._tree.renderHeight;
	}

	get contentHeight(): number {
		return this._tree.contentHeight;
	}

	/**
	 * Whether the list is scrolled to the bottom.
	 */
	get isScrolledToBottom(): boolean {
		return this._tree.scrollTop + this._tree.renderHeight >= this._tree.scrollHeight - 2;
	}

	/**
	 * The last item in the list.
	 */
	get lastItem(): ChatTreeItem | undefined {
		return this._lastItem;
	}



	//#endregion

	constructor(
		container: HTMLElement,
		options: IChatListWidgetOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatAccessibilityService private readonly chatAccessibilityService: IChatAccessibilityService,
	) {
		super();

		this._viewModel = options.viewModel;
		this._location = options.location;
		this._getSelectedModelRequestOptions = options.getSelectedModelRequestOptions;
		this._getCurrentModeInfo = options.getCurrentModeInfo;
		this._lastItemIdContextKey = ChatContextKeys.lastItemId.bindTo(this.contextKeyService);
		this._container = container;

		// Toggle link-style for inline reference widgets based on configuration (single listener for all widgets)
		const updateInlineReferencesStyle = () => {
			const style = this.configurationService.getValue<string>(ChatConfiguration.InlineReferencesStyle);
			this._container.classList.toggle('chat-inline-references-link-style', style === 'link');
		};
		updateInlineReferencesStyle();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.InlineReferencesStyle)) {
				updateInlineReferencesStyle();
			}
		}));

		const scopedInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, this.contextKeyService])
		));
		this._renderStyle = options.renderStyle;

		// Create overflow widgets container
		const overflowWidgetsContainer = options.overflowWidgetsDomNode ?? document.createElement('div');
		if (!options.overflowWidgetsDomNode) {
			overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
			this._container.append(overflowWidgetsContainer);
			this._register(toDisposable(() => overflowWidgetsContainer.remove()));
		}

		// Create editor options (use provided or create new)
		const editorOptions = options.editorOptions ?? this._register(scopedInstantiationService.createInstance(
			ChatEditorOptions,
			options.viewId,
			'foreground',
			options.inputEditorBackground ?? 'chat.requestEditor.background',
			options.resultEditorBackground ?? 'chat.responseEditor.background'
		));

		// Create delegate
		this._delegate = scopedInstantiationService.createInstance(
			ChatListDelegate,
			options.defaultElementHeight ?? 200
		);

		// Create renderer delegate
		const rendererDelegate: IChatRendererDelegate = {
			getListLength: () => this._tree.getNode(null).visibleChildrenCount,
			onDidScroll: this.onDidScroll,
			container: this._container,
			currentChatMode: options.currentChatMode ?? (() => ChatModeKind.Ask),
		};

		// Create renderer
		this._renderer = this._register(scopedInstantiationService.createInstance(
			ChatListItemRenderer,
			editorOptions,
			options.rendererOptions ?? {},
			rendererDelegate,
			overflowWidgetsContainer,
			this._viewModel,
		));

		// Wire up renderer events
		this._register(this._renderer.onDidClickFollowup(item => {
			this._onDidClickFollowup.fire(item);
		}));

		this._register(this._renderer.onDidChangeItemHeight(e => {
			this._updateElementHeight(e.element, e.height);

			// If the second-to-last item's height changed, update the last item's min height
			const secondToLastItem = this._viewModel?.getItems().at(-2);
			if (e.element.id === secondToLastItem?.id) {
				this.updateLastItemMinHeight();
			}

			this._onDidChangeItemHeight.fire(e);
		}));

		// Handle rerun with agent or command detection internally
		this._register(this._renderer.onDidClickRerunWithAgentOrCommandDetection(e => {
			const request = this.chatService.getSession(e.sessionResource)?.getRequests().find(candidate => candidate.id === e.requestId);
			if (request) {
				const sendOptions: IChatSendRequestOptions = {
					noCommandDetection: true,
					attempt: request.attempt + 1,
					location: this._location,
					...this._getSelectedModelRequestOptions?.(),
					modeInfo: this._getCurrentModeInfo?.(),
				};
				this.chatAccessibilityService.acceptRequest(e.sessionResource);
				this.chatService.resendRequest(request, sendOptions).catch(e => this.logService.error('FAILED to rerun request', e));
			}
		}));

		// Create drag-and-drop controller for reordering pending requests
		this._renderer.pendingDragController = this._register(
			scopedInstantiationService.createInstance(ChatPendingDragController, this._container, () => this._viewModel)
		);

		// Create tree
		const styles = options.styles ?? {};
		this._tree = this._register(scopedInstantiationService.createInstance(
			WorkbenchObjectTree<ChatTreeItem, FuzzyScore>,
			'ChatList',
			this._container,
			this._delegate,
			[this._renderer],
			{
				identityProvider: { getId: (e: ChatTreeItem) => e.id },
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: this.instantiationService.createInstance(ChatAccessibilityProvider),
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (e: ChatTreeItem) =>
						isRequestVM(e) ? e.message : isResponseVM(e) ? e.response.value : ''
				},
				setRowLineHeight: false,
				scrollToActiveElement: true,
				filter: options.filter,
				overrideStyles: {
					listFocusBackground: styles.listBackground,
					listInactiveFocusBackground: styles.listBackground,
					listActiveSelectionBackground: styles.listBackground,
					listFocusAndSelectionBackground: styles.listBackground,
					listInactiveSelectionBackground: styles.listBackground,
					listHoverBackground: styles.listBackground,
					listBackground: styles.listBackground,
					listFocusForeground: styles.listForeground,
					listHoverForeground: styles.listForeground,
					listInactiveFocusForeground: styles.listForeground,
					listInactiveSelectionForeground: styles.listForeground,
					listActiveSelectionForeground: styles.listForeground,
					listFocusAndSelectionForeground: styles.listForeground,
					listActiveSelectionIconForeground: undefined,
					listInactiveSelectionIconForeground: undefined,
				}
			}
		));

		// Create scroll-down button
		this._scrollDownButton = this._register(new Button(this._container, {
			buttonBackground: asCssVariable(buttonSecondaryBackground),
			buttonForeground: asCssVariable(buttonSecondaryForeground),
			buttonHoverBackground: asCssVariable(buttonSecondaryHoverBackground),
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined,
			supportIcons: true,
		}));
		this._scrollDownButton.element.classList.add('chat-scroll-down');
		this._scrollDownButton.label = `$(${Codicon.chevronDown.id})`;
		this._scrollDownButton.element.style.display = 'none'; // Hidden by default

		this._register(this._scrollDownButton.onDidClick(() => {
			this.cancelUserToggleScrollRestoration();
			this.setScrollLock(true);
			this.scrollToEnd();
		}));

		// Wire up tree events

		// Handle content height changes (fires high-level event, internal scroll handling)
		this._register(this._tree.onDidChangeContentHeight(() => {
			this._onDidChangeContentHeight.fire();
		}));

		this._register(this._tree.onDidFocus(() => {
			this._onDidFocus.fire();
		}));

		// Handle focus changes internally (update mostRecentlyFocusedItemIndex)
		this._register(this._tree.onDidChangeFocus(() => {
			const focused = this.getFocus();
			if (focused && focused.length > 0) {
				const focusedItem = focused[0];
				const items = this.getItems();
				const idx = items.findIndex(i => i === focusedItem);
				if (idx !== -1) {
					this._mostRecentlyFocusedItemIndex = idx;
				}
			}
		}));

		// Handle scroll events (fire public event and manage scroll-down button)
		this._register(this._tree.onDidScroll((e) => {
			this._onDidScroll.fire(e);
			this.updateScrollDownButtonVisibility();
		}));

		// Set initial at-bottom state (scrollLock defaults to true)
		this.updateScrollDownButtonVisibility();

		this._register(dom.addDisposableListener(this._container, ChatCollapsibleContentPart.userToggleEvent, e => {
			if (!dom.isHTMLElement(e.target)) {
				return;
			}

			const element = this._renderer.getElementFromNode(e.target);
			if (element) {
				this.trackUserToggleResize(element, e.target);
			}
		}));
		this._register(dom.addDisposableListener(this._container, dom.EventType.WHEEL, () => this.cancelUserToggleScrollRestoration()));
		this._register(dom.addDisposableListener(this._container, dom.EventType.POINTER_DOWN, () => this.cancelUserToggleScrollRestoration()));
		this._register(dom.addDisposableListener(this._container, dom.EventType.KEY_DOWN, e => {
			const keyCode = new StandardKeyboardEvent(e).keyCode;
			if (keyCode === KeyCode.UpArrow
				|| keyCode === KeyCode.DownArrow
				|| keyCode === KeyCode.PageUp
				|| keyCode === KeyCode.PageDown
				|| keyCode === KeyCode.Home
				|| keyCode === KeyCode.End) {
				this.cancelUserToggleScrollRestoration();
			}
		}, true));

		// Handle context menu internally
		this._register(this._tree.onContextMenu(e => {
			this.handleContextMenu(e);
		}));

		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(ChatConfiguration.EditRequests) || e.affectsConfiguration(ChatConfiguration.CheckpointsEnabled)) {
				this._settingChangeCounter++;
				this.refresh();
			}
		}));
	}

	//#region Internal event handlers

	/**
	 * Update scroll-down button visibility based on scroll position and scroll lock.
	 */
	private updateScrollDownButtonVisibility(): void {
		const { showButton, atBottom } = computeScrollDownState(this.isScrolledToBottom, this._scrollLock);
		// Use an explicit `flex` (the `.monaco-button` default) rather than '' when showing: the
		// stylesheet applies `display: none` to `.interactive-session .chat-scroll-down`, so clearing
		// the inline style would let that rule win and keep the button hidden.
		this._scrollDownButton.element.style.display = showButton ? 'flex' : 'none';
		this._container.classList.toggle('chat-list-at-bottom', atBottom);
	}

	/**
	 * Handle context menu events.
	 */
	private handleContextMenu(e: ITreeContextMenuEvent<ChatTreeItem | null>): void {
		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		const selected = e.element;

		// Check if the context menu was opened on a KaTeX element
		const target = e.browserEvent.target as HTMLElement;
		const isKatexElement = target.closest(`.${katexContainerClassName}`) !== null;

		const scopedContextKeyService = this.contextKeyService.createOverlay([
			[ChatContextKeys.isResponse.key, isResponseVM(selected)],
			[ChatContextKeys.responseIsFiltered.key, isResponseVM(selected) && !!selected.errorDetails?.responseIsFiltered],
			[ChatContextKeys.isKatexMathElement.key, isKatexElement]
		]);
		this.contextMenuService.showContextMenu({
			menuId: MenuId.ChatContext,
			menuActionOptions: { shouldForwardArgs: true },
			contextKeyService: scopedContextKeyService,
			getAnchor: () => e.anchor,
			getActionsContext: () => selected,
		});
	}

	//#endregion

	//#region ViewModel methods

	/**
	 * Set the view model for the list to render.
	 */
	setViewModel(viewModel: IChatViewModel | undefined): void {
		this._viewModel = viewModel;
		this._renderer.updateViewModel(viewModel);
	}

	/**
	 * Refresh the list from the current view model.
	 * Uses internal state for diff identity calculation.
	 */
	refresh(): void {
		if (!this._viewModel) {
			this._tree.setChildren(null, []);
			this._lastItem = undefined;
			this._lastItemIdContextKey.set([]);
			return;
		}

		const items = this._viewModel.getItems();
		this._lastItem = items.at(-1);
		this._lastItemIdContextKey.set(this._lastItem ? [this._lastItem.id] : []);
		const previousItem = items.at(-2);
		const needsInitialPreviousItemHeight = (isRequestVM(previousItem) || isResponseVM(previousItem)) && previousItem.currentRenderedHeight === undefined;

		const treeItems: ITreeElement<ChatTreeItem>[] = items.map(item => ({
			element: item,
			collapsed: false,
			collapsible: false,
		}));

		const editing = this._viewModel.editing;

		this._withPersistedAutoScroll(() => {
			this._tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId: (element) => {
						// Pending types only have 'id', request/response have 'dataId'
						const baseId = (isRequestVM(element) || isResponseVM(element)) ? element.dataId : element.id;
						const disablement = (isRequestVM(element) || isResponseVM(element)) ? element.shouldBeRemovedOnSend : undefined;
						// Per-element editing state: only re-render items whose editing role changed
						const isEditTarget = isRequestVM(element) && editing?.id === element.id;
						const isBlocked = (isRequestVM(element) || isResponseVM(element)) ? element.shouldBeBlocked.get() : false;
						return baseId +
							// If a response is in the process of progressive rendering, we need to ensure that it will
							// be re-rendered so progressive rendering is restarted, even if the model wasn't updated.
							`${isResponseVM(element) && element.renderData ? `_${this._visibleChangeCount}` : ''}` +
							// Re-render once content references are loaded
							(isResponseVM(element) ? `_${element.contentReferences.length}` : '') +
							// Re-render if element becomes hidden due to undo/redo
							`_${disablement ? `${disablement.afterUndoStop || '1'}` : '0'}` +
							// Re-render the request being edited and requests whose blocked state changed
							`_${isEditTarget ? 'edit' : ''}` +
							`_${isBlocked ? 'blocked' : ''}` +
							// Re-render requests when editing starts/stops (for hover button visibility, click handlers)
							(isRequestVM(element) ? `_${editing ? '1' : '0'}` : '') +
							// Re-render all if invoked by setting change
							`_setting${this._settingChangeCounter}` +
							// Rerender request if we got new content references in the response
							// since this may change how we render the corresponding attachments in the request
							(isRequestVM(element) && element.contentReferences ? `_${element.contentReferences?.length}` : '');
					},
				}
			});
		});

		if (needsInitialPreviousItemHeight) {
			this.updateLastItemMinHeight();
		}
	}

	/**
	 * Set scroll lock state.
	 */
	setScrollLock(value: boolean): void {
		this._scrollLock = value;
		this.updateScrollDownButtonVisibility();
	}

	/**
	 * Get scroll lock state.
	 */
	get scrollLock(): boolean {
		return this._scrollLock;
	}

	/**
	 * Set the visible change count (for diff identity).
	 */
	setVisibleChangeCount(value: number): void {
		this._visibleChangeCount = value;
	}

	/**
	 * Scroll to reveal an element if editing.
	 */
	scrollToCurrentItem(currentElement: IChatRequestViewModel): void {
		if (!this._viewModel?.editing || !currentElement) {
			return;
		}
		if (!this._tree.hasElement(currentElement)) {
			return;
		}
		const relativeTop = this._tree.getRelativeTop(currentElement);
		if (relativeTop === null || relativeTop < 0 || relativeTop > 1) {
			this._tree.reveal(currentElement, 0);
		}
	}

	//#endregion

	//#region Tree methods

	/**
	 * Rerender the tree.
	 */
	rerender(): void {
		this._tree.rerender();
	}

	private getItems(): ChatTreeItem[] {
		const items: ChatTreeItem[] = [];
		const root = this._tree.getNode(null);
		for (const child of root.children) {
			if (child.element) {
				items.push(child.element);
			}
		}
		return items;
	}


	/**
	 * Delegate scroll events from a mouse wheel event to the tree.
	 */
	delegateScrollFromMouseWheelEvent(event: IMouseWheelEvent): void {
		this.cancelUserToggleScrollRestoration();
		this._tree.delegateScrollFromMouseWheelEvent(event);
	}

	/**
	 * Whether the tree has a specific element.
	 */
	hasElement(element: ChatTreeItem): boolean {
		return this._tree.hasElement(element);
	}

	/**
	 * Update the height of an element.
	 */
	private _updateElementHeight(element: ChatTreeItem, height?: number): void {
		if (this._tree.hasElement(element) && this._visible) {
			const userToggleResizeTracker = this._userToggleResizeTrackers.get(element);
			if (userToggleResizeTracker) {
				this._tree.updateElementHeight(element, height);
				userToggleResizeTracker.restoreScrollAnchor();
				return;
			}
			this._withPersistedAutoScroll(() => {
				this._tree.updateElementHeight(element, height);
			});
		}
	}

	private trackUserToggleResize(element: ChatTreeItem, target: HTMLElement): void {
		const anchorTargetTop = this.isScrolledToBottom ? target.getBoundingClientRect().top : undefined;
		const restoreScrollPosition = anchorTargetTop === undefined ? undefined : () => {
			if (target.isConnected) {
				this._tree.scrollTop = getAnchoredScrollTop(this._tree.scrollTop, target.getBoundingClientRect().top, anchorTargetTop);
			}
		};
		const tracker: UserToggleResizeTracker = new UserToggleResizeTracker(target, restoreScrollPosition, () => {
			if (this._userToggleResizeTrackers.get(element) === tracker) {
				this._userToggleResizeTrackers.deleteAndDispose(element);
			}
		});
		this._userToggleResizeTrackers.set(element, tracker);
	}

	private cancelUserToggleScrollRestoration(): void {
		for (const tracker of this._userToggleResizeTrackers.values()) {
			tracker.cancelScrollRestoration();
		}
	}

	/**
	 * Scroll to reveal an element.
	 */
	reveal(element: ChatTreeItem, relativeTop?: number): void {
		this._tree.reveal(element, relativeTop);
	}

	/**
	 * The top offset of an element in transcript content space (same space as
	 * `scrollTop`/`scrollHeight`), or `undefined` if it is not in the list. Reads
	 * the layout height model, so it also resolves off-screen elements.
	 */
	getElementTop(element: ChatTreeItem): number | undefined {
		if (!this._tree.hasElement(element)) {
			return undefined;
		}
		return this._tree.getElementTop(element);
	}

	/**
	 * Get the focused elements.
	 */
	getFocus(): ChatTreeItem[] {
		return this._tree.getFocus().filter((e): e is ChatTreeItem => e !== null);
	}

	/**
	 * Set the focused elements.
	 */
	setFocus(elements: ChatTreeItem[]): void {
		this._tree.setFocus(elements);
	}

	focusItem(item: ChatTreeItem): void {
		if (!this.hasElement(item)) {
			return;
		}
		this._tree.setFocus([item]);
		this._tree.domFocus();
	}

	/**
	 * Focus the last item in the list. Returns the index of the focused item.
	 * @param useMostRecentlyFocusedIndex If true, use the mostRecentlyFocusedIndex if valid
	 */
	focusLastItem(useMostRecentlyFocusedIndex?: boolean): number {
		const items = this.getItems();
		if (items.length === 0) {
			return -1;
		}

		let focusIndex: number;
		if (useMostRecentlyFocusedIndex && this._mostRecentlyFocusedItemIndex >= 0 && this._mostRecentlyFocusedItemIndex < items.length) {
			focusIndex = this._mostRecentlyFocusedItemIndex;
		} else {
			focusIndex = items.length - 1;
		}

		this._tree.setFocus([items[focusIndex]]);
		this._tree.domFocus();
		return focusIndex;
	}

	/**
	 * Scroll the list to reveal the last item.
	 */
	scrollToEnd(): void {
		// Reveal the tree's actual last node rather than the held `_lastItem`. `reveal` reliably
		// scrolls all the way down even while item heights are still settling (see #234089)
		const lastElement = this._tree.getNode(null).children.at(-1)?.element;
		if (lastElement) {
			const offset = Math.max(lastElement.currentRenderedHeight ?? 0, 1e6);
			this._tree.reveal(lastElement, offset);
		}
	}

	/**
	 * Suppress auto-scroll behavior temporarily. While suppressed,
	 * _withPersistedAutoScroll will not scroll to bottom after operations.
	 */
	set suppressAutoScroll(value: boolean) {
		this._suppressAutoScroll = value;
	}

	private _withPersistedAutoScroll(fn: () => void): void {
		if (this._suppressAutoScroll) {
			fn();
			return;
		}
		const wasScrolledToBottom = this.isScrolledToBottom;
		fn();
		if (wasScrolledToBottom) {
			this.scrollToEnd();
		}
	}

	/**
	 * Focus the list.
	 */
	focus(): void {
		this._tree.domFocus();
	}

	/**
	 * Get the DOM focus state.
	 */
	isDOMFocused(): boolean {
		return this._tree.isDOMFocused();
	}

	//#endregion

	//#region Renderer methods

	/**
	 * Get code block info for a response.
	 */
	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[] {
		return this._renderer.getCodeBlockInfosForResponse(response);
	}

	/**
	 * Get code block info by URI.
	 */
	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined {
		return this._renderer.getCodeBlockInfoForEditor(uri);
	}

	/**
	 * Get file tree info for a response.
	 */
	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[] {
		return this._renderer.getFileTreeInfosForResponse(response);
	}

	/**
	 * Get the last focused file tree for a response.
	 */
	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined {
		return this._renderer.getLastFocusedFileTreeForResponse(response);
	}

	/**
	 * Get editors currently in use.
	 */
	editorsInUse(): Iterable<CodeBlockPart> {
		return this._renderer.editorsInUse();
	}



	/**
	 * Get template data for a request ID.
	 */
	getTemplateDataForRequestId(requestId: string | undefined): IChatListItemTemplate | undefined {
		if (!requestId) {
			return undefined;
		}
		return this._renderer.getTemplateDataForRequestId(requestId);
	}

	/**
	 * Update renderer options.
	 */
	updateRendererOptions(options: IChatListItemRendererOptions): void {
		this._renderer.updateOptions(options);
	}

	/**
	 * Update the list/tree color overrides. Re-applies the same fan-out from
	 * `listBackground`/`listForeground` to all interaction states that was
	 * originally configured at construction time.
	 */
	setStyles(styles: IChatListWidgetStyles): void {
		this._tree.updateOptions({
			overrideStyles: {
				listFocusBackground: styles.listBackground,
				listInactiveFocusBackground: styles.listBackground,
				listActiveSelectionBackground: styles.listBackground,
				listFocusAndSelectionBackground: styles.listBackground,
				listInactiveSelectionBackground: styles.listBackground,
				listHoverBackground: styles.listBackground,
				listBackground: styles.listBackground,
				listFocusForeground: styles.listForeground,
				listHoverForeground: styles.listForeground,
				listInactiveFocusForeground: styles.listForeground,
				listInactiveSelectionForeground: styles.listForeground,
				listActiveSelectionForeground: styles.listForeground,
				listFocusAndSelectionForeground: styles.listForeground,
				listActiveSelectionIconForeground: undefined,
				listInactiveSelectionIconForeground: undefined,
			}
		});
	}

	/**
	 * Set the visibility of the list.
	 */
	setVisible(visible: boolean): void {
		this._visible = visible;
		this._renderer.setVisible(visible);
	}

	/**
	 * Layout the list.
	 */
	layout(height: number, width: number): void {
		this._bodyDimension = new dom.Dimension(width ?? this._container.clientWidth, height);
		this.updateLastItemMinHeight();
		this._tree.layout(height, width);
		this._renderer.layout(width ?? this._container.clientWidth);
	}

	private _bodyDimension: dom.Dimension | null = null;
	private _previousLastItemMinHeight: number | null = null;

	private updateLastItemMinHeight(): void {
		if (!this._bodyDimension) {
			return;
		}

		const contentHeight = this._bodyDimension.height;
		if (this._renderStyle === 'compact' || this._renderStyle === 'minimal') {
			this._container.style.removeProperty('--chat-current-response-min-height');
		} else {
			const secondToLastItem = this._viewModel?.getItems().at(-2);
			const maxRequestShownHeight = 200;
			const secondToLastItemHeight = Math.min(
				(isRequestVM(secondToLastItem) || isResponseVM(secondToLastItem)) ?
					secondToLastItem.currentRenderedHeight ?? this._delegate.getMeasuredHeight(secondToLastItem) ?? 150 : 150,
				maxRequestShownHeight);
			const lastItemMinHeight = Math.max(contentHeight - (secondToLastItemHeight + 10), 0);
			this._container.style.setProperty('--chat-current-response-min-height', lastItemMinHeight + 'px');
			if (lastItemMinHeight !== this._previousLastItemMinHeight) {
				this._previousLastItemMinHeight = lastItemMinHeight;
				const lastItem = this._viewModel?.getItems().at(-1);
				if (lastItem && this._visible && this._tree.hasElement(lastItem)) {
					this._updateElementHeight(lastItem, undefined);
				}
			}
		}
	}

	//#endregion

}
