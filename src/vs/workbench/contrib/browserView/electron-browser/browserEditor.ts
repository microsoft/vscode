/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, Dimension, EventType, IDomPosition, registerExternalFocusChecker } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { RawContextKey, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { BrowserEditorInput } from './browserEditorInput.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IBrowserViewModel } from '../../browserView/common/browserView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IBrowserViewKeyDownEvent, IBrowserViewNavigationEvent, IBrowserViewLoadError, BrowserNewPageLocation } from '../../../../platform/browserView/common/browserView.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { BrowserOverlayManager, BrowserOverlayType, IBrowserOverlayInfo } from './overlayManager.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IBrowserElementsService } from '../../../services/browserElements/browser/browserElementsService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { BrowserFindWidget, CONTEXT_BROWSER_FIND_WIDGET_FOCUSED, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE } from './browserFindWidget.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { IChatRequestVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { IBrowserTargetLocator, getDisplayNameFromOuterHTML } from '../../../../platform/browserElements/common/browserElements.js';
import { logBrowserOpen } from './browserViewTelemetry.js';
import { URI } from '../../../../base/common/uri.js';

export const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey<boolean>('browserCanGoBack', false, localize('browser.canGoBack', "Whether the browser can go back"));
export const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey<boolean>('browserCanGoForward', false, localize('browser.canGoForward', "Whether the browser can go forward"));
export const CONTEXT_BROWSER_FOCUSED = new RawContextKey<boolean>('browserFocused', true, localize('browser.editorFocused', "Whether the browser editor is focused"));
export const CONTEXT_BROWSER_STORAGE_SCOPE = new RawContextKey<string>('browserStorageScope', '', localize('browser.storageScope', "The storage scope of the current browser view"));
export const CONTEXT_BROWSER_DEVTOOLS_OPEN = new RawContextKey<boolean>('browserDevToolsOpen', false, localize('browser.devToolsOpen', "Whether developer tools are open for the current browser view"));
export const CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE = new RawContextKey<boolean>('browserElementSelectionActive', false, localize('browser.elementSelectionActive', "Whether element selection is currently active"));

// Re-export find widget context keys for use in actions
export { CONTEXT_BROWSER_FIND_WIDGET_FOCUSED, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE };

/**
 * Get the original implementation of HTMLElement focus (without window auto-focusing)
 * before it gets overridden by the workbench.
 */
const originalHtmlElementFocus = HTMLElement.prototype.focus;

class BrowserNavigationBar extends Disposable {
	private readonly _urlInput: HTMLInputElement;

	constructor(
		editor: BrowserEditor,
		container: HTMLElement,
		instantiationService: IInstantiationService,
		scopedContextKeyService: IContextKeyService
	) {
		super();

		// Create hover delegate for toolbar buttons
		const hoverDelegate = this._register(
			instantiationService.createInstance(
				WorkbenchHoverDelegate,
				'element',
				undefined,
				{ position: { hoverPosition: HoverPosition.ABOVE } }
			)
		);

		// Create navigation toolbar (left side) with scoped context
		const navContainer = $('.browser-nav-toolbar');
		const scopedInstantiationService = instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService]
		));
		const navToolbar = this._register(scopedInstantiationService.createInstance(
			MenuWorkbenchToolBar,
			navContainer,
			MenuId.BrowserNavigationToolbar,
			{
				hoverDelegate,
				highlightToggledItems: true,
				// Render all actions inline regardless of group
				toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
				menuOptions: { shouldForwardArgs: true }
			}
		));

		// URL input
		this._urlInput = $<HTMLInputElement>('input.browser-url-input');
		this._urlInput.type = 'text';
		this._urlInput.placeholder = localize('browser.urlPlaceholder', "Enter URL...");

		// Create actions toolbar (right side) with scoped context
		const actionsContainer = $('.browser-actions-toolbar');
		const actionsToolbar = this._register(scopedInstantiationService.createInstance(
			MenuWorkbenchToolBar,
			actionsContainer,
			MenuId.BrowserActionsToolbar,
			{
				hoverDelegate,
				highlightToggledItems: true,
				toolbarOptions: { primaryGroup: (group) => group.startsWith('actions'), useSeparatorsInPrimaryActions: true },
				menuOptions: { shouldForwardArgs: true }
			}
		));

		navToolbar.context = editor;
		actionsToolbar.context = editor;

		// Assemble layout: nav | url | actions
		container.appendChild(navContainer);
		container.appendChild(this._urlInput);
		container.appendChild(actionsContainer);

		// Setup URL input handler
		this._register(addDisposableListener(this._urlInput, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				const url = this._urlInput.value.trim();
				if (url) {
					editor.navigateToUrl(url);
				}
			}
		}));

		// Select all URL bar text when the URL bar receives focus (like in regular browsers)
		this._register(addDisposableListener(this._urlInput, EventType.FOCUS, () => {
			this._urlInput.select();
		}));
	}

	/**
	 * Update the navigation bar state from a navigation event
	 */
	updateFromNavigationEvent(event: IBrowserViewNavigationEvent): void {
		// URL input is updated, action enablement is handled by context keys
		this._urlInput.value = event.url;
	}

	/**
	 * Focus the URL input and select all text
	 */
	focusUrlInput(): void {
		this._urlInput.select();
		this._urlInput.focus();
	}

	clear(): void {
		this._urlInput.value = '';
	}
}

export class BrowserEditor extends EditorPane {
	static readonly ID = 'workbench.editor.browser';

	private _overlayVisible = false;
	private _editorVisible = false;
	private _currentKeyDownEvent: IBrowserViewKeyDownEvent | undefined;

	private _navigationBar!: BrowserNavigationBar;
	private _browserContainer!: HTMLElement;
	private _placeholderScreenshot!: HTMLElement;
	private _overlayPauseContainer!: HTMLElement;
	private _overlayPauseHeading!: HTMLElement;
	private _overlayPauseDetail!: HTMLElement;
	private _errorContainer!: HTMLElement;
	private _welcomeContainer!: HTMLElement;
	private _findWidgetContainer!: HTMLElement;
	private _findWidget!: Lazy<BrowserFindWidget>;
	private _canGoBackContext!: IContextKey<boolean>;
	private _canGoForwardContext!: IContextKey<boolean>;
	private _storageScopeContext!: IContextKey<string>;
	private _devToolsOpenContext!: IContextKey<boolean>;
	private _elementSelectionActiveContext!: IContextKey<boolean>;

	private _model: IBrowserViewModel | undefined;
	private readonly _inputDisposables = this._register(new DisposableStore());
	private overlayManager: BrowserOverlayManager | undefined;
	private _elementSelectionCts: CancellationTokenSource | undefined;
	private _screenshotTimeout: ReturnType<typeof setTimeout> | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserElementsService private readonly browserElementsService: IBrowserElementsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(BrowserEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		// Create scoped context key service for this editor instance
		const contextKeyService = this._register(this.contextKeyService.createScoped(parent));

		// Create window-specific overlay manager for this editor
		this.overlayManager = this._register(new BrowserOverlayManager(this.window));

		// Bind navigation capability context keys
		this._canGoBackContext = CONTEXT_BROWSER_CAN_GO_BACK.bindTo(contextKeyService);
		this._canGoForwardContext = CONTEXT_BROWSER_CAN_GO_FORWARD.bindTo(contextKeyService);
		this._storageScopeContext = CONTEXT_BROWSER_STORAGE_SCOPE.bindTo(contextKeyService);
		this._devToolsOpenContext = CONTEXT_BROWSER_DEVTOOLS_OPEN.bindTo(contextKeyService);
		this._elementSelectionActiveContext = CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE.bindTo(contextKeyService);

		// Currently this is always true since it is scoped to the editor container
		CONTEXT_BROWSER_FOCUSED.bindTo(contextKeyService);

		// Create root container
		const root = $('.browser-root');
		parent.appendChild(root);

		// Create toolbar with navigation buttons and URL input
		const toolbar = $('.browser-toolbar');

		// Create navigation bar widget with scoped context
		this._navigationBar = this._register(new BrowserNavigationBar(this, toolbar, this.instantiationService, contextKeyService));

		root.appendChild(toolbar);

		// Create find widget container (between toolbar and browser container)
		this._findWidgetContainer = $('.browser-find-widget-wrapper');
		root.appendChild(this._findWidgetContainer);

		// Create find widget (lazy initialization)
		this._findWidget = new Lazy(() => {
			const findWidget = this.instantiationService.createInstance(
				BrowserFindWidget,
				this._findWidgetContainer
			);
			if (this._model) {
				findWidget.setModel(this._model);
			}
			return findWidget;
		});
		this._register(toDisposable(() => this._findWidget.rawValue?.dispose()));

		// Create browser container (stub element for positioning)
		this._browserContainer = $('.browser-container');
		this._browserContainer.tabIndex = 0; // make focusable
		root.appendChild(this._browserContainer);

		// Create placeholder screenshot (background placeholder when WebContentsView is hidden)
		this._placeholderScreenshot = $('.browser-placeholder-screenshot');
		this._browserContainer.appendChild(this._placeholderScreenshot);

		// Create overlay pause container (hidden by default via CSS)
		this._overlayPauseContainer = $('.browser-overlay-paused');
		const overlayPauseMessage = $('.browser-overlay-paused-message');
		this._overlayPauseHeading = $('.browser-overlay-paused-heading');
		this._overlayPauseDetail = $('.browser-overlay-paused-detail');
		overlayPauseMessage.appendChild(this._overlayPauseHeading);
		overlayPauseMessage.appendChild(this._overlayPauseDetail);
		this._overlayPauseContainer.appendChild(overlayPauseMessage);
		this._browserContainer.appendChild(this._overlayPauseContainer);

		// Create error container (hidden by default)
		this._errorContainer = $('.browser-error-container');
		this._errorContainer.style.display = 'none';
		this._browserContainer.appendChild(this._errorContainer);

		// Create welcome container (shown when no URL is loaded)
		this._welcomeContainer = this.createWelcomeContainer();
		this._browserContainer.appendChild(this._welcomeContainer);

		this._register(addDisposableListener(this._browserContainer, EventType.FOCUS, (event) => {
			// When the browser container gets focus, make sure the browser view also gets focused.
			// But only if focus was already in the workbench (and not e.g. clicking back into the workbench from the browser view).
			if (event.relatedTarget && this._model && this.shouldShowView) {
				void this._model.focus();
			}
		}));

		// Register external focus checker so that cross-window focus logic knows when
		// this browser view has focus (since it's outside the normal DOM tree).
		// Include window info so that UI like dialogs appear in the correct window.
		this._register(registerExternalFocusChecker(() => ({
			hasFocus: this._model?.focused ?? false,
			window: this._model?.focused ? this.window : undefined
		})));

		// Automatically call layoutBrowserContainer() when the browser container changes size.
		// Be careful to use `ResizeObserver` from the target window to avoid cross-window issues.
		const resizeObserver = new this.window.ResizeObserver(() => this.layoutBrowserContainer());
		resizeObserver.observe(this._browserContainer);
		this._register(toDisposable(() => resizeObserver.disconnect()));
	}

	override async setInput(input: BrowserEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		this._inputDisposables.clear();

		// Resolve the browser view model from the input
		this._model = await input.resolve();
		if (token.isCancellationRequested || this.input !== input) {
			return;
		}

		this._storageScopeContext.set(this._model.storageScope);
		this._devToolsOpenContext.set(this._model.isDevToolsOpen);

		// Update find widget with new model
		this._findWidget.rawValue?.setModel(this._model);

		// Clean up on input disposal
		this._inputDisposables.add(input.onWillDispose(() => {
			this._model = undefined;
		}));

		// Initialize UI state and context keys from model
		this.updateNavigationState({
			url: this._model.url,
			canGoBack: this._model.canGoBack,
			canGoForward: this._model.canGoForward
		});
		this.setBackgroundImage(this._model.screenshot);

		if (context.newInGroup) {
			if (this._model.url) {
				this._browserContainer.focus();
			} else {
				this.focusUrlInput();
			}
		}

		// Start / stop screenshots when the model visibility changes
		this._inputDisposables.add(this._model.onDidChangeVisibility(() => this.doScreenshot()));

		// Listen to model events for UI updates
		this._inputDisposables.add(this._model.onDidKeyCommand(keyEvent => {
			// Handle like webview does - convert to webview KeyEvent format
			this.handleKeyEventFromBrowserView(keyEvent);
		}));

		this._inputDisposables.add(this._model.onDidNavigate((navEvent: IBrowserViewNavigationEvent) => {
			this.group.pinEditor(this.input); // pin editor on navigation

			// Update navigation bar and context keys from model
			this.updateNavigationState(navEvent);
		}));

		this._inputDisposables.add(this._model.onDidChangeLoadingState(() => {
			this.updateErrorDisplay();
		}));

		this._inputDisposables.add(this._model.onDidChangeFocus(({ focused }) => {
			// When the view gets focused, make sure the editor reports that it has focus,
			// but focus is removed from the workbench.
			if (focused) {
				this._onDidFocus?.fire();
				this.ensureBrowserFocus();
			}
		}));

		this._inputDisposables.add(this._model.onDidChangeDevToolsState(e => {
			this._devToolsOpenContext.set(e.isDevToolsOpen);
		}));

		this._inputDisposables.add(this._model.onDidRequestNewPage(({ resource, location, position }) => {
			logBrowserOpen(this.telemetryService, (() => {
				switch (location) {
					case BrowserNewPageLocation.Background: return 'browserLinkBackground';
					case BrowserNewPageLocation.Foreground: return 'browserLinkForeground';
					case BrowserNewPageLocation.NewWindow: return 'browserLinkNewWindow';
				}
			})());

			const targetGroup = location === BrowserNewPageLocation.NewWindow ? AUX_WINDOW_GROUP : this.group;
			this.editorService.openEditor({
				resource: URI.from(resource),
				options: {
					pinned: true,
					inactive: location === BrowserNewPageLocation.Background,
					auxiliary: {
						bounds: position,
						compact: true
					}
				}
			}, targetGroup);
		}));

		this._inputDisposables.add(this.overlayManager!.onDidChangeOverlayState(() => {
			this.checkOverlays();
		}));

		// Listen for zoom level changes and update browser view zoom factor
		this._inputDisposables.add(onDidChangeZoomLevel(targetWindowId => {
			if (targetWindowId === this.window.vscodeWindowId) {
				this.layoutBrowserContainer();
			}
		}));

		this.updateErrorDisplay();
		this.layoutBrowserContainer();
		this.updateVisibility();
		this.doScreenshot();
	}

	protected override setEditorVisible(visible: boolean): void {
		this._editorVisible = visible;
		this.updateVisibility();
	}

	/**
	 * Make the browser container the active element without moving focus from the browser view.
	 */
	private ensureBrowserFocus(): void {
		originalHtmlElementFocus.call(this._browserContainer);
	}

	private updateVisibility(): void {
		const hasUrl = !!this._model?.url;
		const hasError = !!this._model?.error;
		const isViewingPage = !hasError && hasUrl;
		const isPaused = isViewingPage && this._editorVisible && this._overlayVisible;

		// Welcome container: shown when no URL is loaded
		this._welcomeContainer.style.display = hasUrl ? 'none' : '';

		// Error container: shown when there's a load error
		this._errorContainer.style.display = hasError ? '' : 'none';

		// Placeholder screenshot: shown when there is a page loaded (even when the view is not hidden, so hiding is smooth)
		this._placeholderScreenshot.style.display = isViewingPage ? '' : 'none';

		// Pause overlay: fades in when an overlay is detected
		this._overlayPauseContainer.classList.toggle('visible', isPaused);

		if (this._model) {
			const show = this.shouldShowView;
			if (show === this._model.visible) {
				return;
			}

			if (show) {
				this._model.setVisible(true);
				if (
					this._browserContainer.ownerDocument.hasFocus() &&
					this._browserContainer.ownerDocument.activeElement === this._browserContainer
				) {
					// If the editor is focused, ensure the browser view also gets focus
					void this._model.focus();
				}
			} else {
				this.doScreenshot();

				// Hide the browser view just before the next render.
				// This attempts to give the screenshot some time to be captured and displayed.
				// If we hide immediately it is more likely to flicker while the old screenshot is still visible.
				this.window.requestAnimationFrame(() => this._model?.setVisible(false));
			}
		}
	}

	private get shouldShowView(): boolean {
		return this._editorVisible && !this._overlayVisible && !this._model?.error && !!this._model?.url;
	}

	private checkOverlays(): void {
		if (!this.overlayManager) {
			return;
		}
		const overlappingOverlays = this.overlayManager.getOverlappingOverlays(this._browserContainer);
		const hasOverlappingOverlay = overlappingOverlays.length > 0;
		this.updateOverlayPauseMessage(overlappingOverlays);
		if (hasOverlappingOverlay !== this._overlayVisible) {
			this._overlayVisible = hasOverlappingOverlay;
			this.updateVisibility();
		}
	}

	private updateOverlayPauseMessage(overlappingOverlays: readonly IBrowserOverlayInfo[]): void {
		// Only show the pause message for notification overlays
		const hasNotificationOverlay = overlappingOverlays.some(overlay => overlay.type === BrowserOverlayType.Notification);
		this._overlayPauseContainer.classList.toggle('show-message', hasNotificationOverlay);

		if (hasNotificationOverlay) {
			this._overlayPauseHeading.textContent = localize('browser.overlayPauseHeading.notification', "Paused due to Notification");
			this._overlayPauseDetail.textContent = localize('browser.overlayPauseDetail.notification', "Dismiss the notification to continue using the browser.");
		} else {
			this._overlayPauseHeading.textContent = '';
			this._overlayPauseDetail.textContent = '';
		}
	}

	private updateErrorDisplay(): void {
		if (!this._model) {
			return;
		}

		const error: IBrowserViewLoadError | undefined = this._model.error;
		if (error) {
			// Update error content

			while (this._errorContainer.firstChild) {
				this._errorContainer.removeChild(this._errorContainer.firstChild);
			}

			const errorContent = $('.browser-error-content');
			const errorTitle = $('.browser-error-title');
			errorTitle.textContent = localize('browser.loadErrorLabel', "Failed to Load Page");

			const errorMessage = $('.browser-error-detail');
			const errorText = $('span');
			errorText.textContent = `${error.errorDescription} (${error.errorCode})`;
			errorMessage.appendChild(errorText);

			const errorUrl = $('.browser-error-detail');
			const urlLabel = $('strong');
			urlLabel.textContent = localize('browser.errorUrlLabel', "URL:");
			const urlValue = $('code');
			urlValue.textContent = error.url;
			errorUrl.appendChild(urlLabel);
			errorUrl.appendChild(document.createTextNode(' '));
			errorUrl.appendChild(urlValue);

			errorContent.appendChild(errorTitle);
			errorContent.appendChild(errorMessage);
			errorContent.appendChild(errorUrl);
			this._errorContainer.appendChild(errorContent);

			this.setBackgroundImage(undefined);
		} else {
			this.setBackgroundImage(this._model.screenshot);
		}

		this.updateVisibility();
	}

	getUrl(): string | undefined {
		return this._model?.url;
	}

	async navigateToUrl(url: string): Promise<void> {
		if (this._model) {
			this.group.pinEditor(this.input); // pin editor on navigation

			// Special case localhost URLs (e.g., "localhost:3000") to add http://
			if (/^localhost(:|\/|$)/i.test(url)) {
				url = 'http://' + url;
			} else if (!URL.parse(url)?.protocol) {
				// If no scheme provided, default to http (sites will generally upgrade to https)
				url = 'http://' + url;
			}

			this.ensureBrowserFocus();
			await this._model.loadURL(url);
		}
	}

	focusUrlInput(): void {
		this._navigationBar.focusUrlInput();
	}

	async goBack(): Promise<void> {
		return this._model?.goBack();
	}

	async goForward(): Promise<void> {
		return this._model?.goForward();
	}

	async reload(): Promise<void> {
		return this._model?.reload();
	}

	async toggleDevTools(): Promise<void> {
		return this._model?.toggleDevTools();
	}

	async clearStorage(): Promise<void> {
		return this._model?.clearStorage();
	}

	/**
	 * Show the find widget
	 */
	showFind(): void {
		this._findWidget.value.reveal();
		this._findWidget.value.layout(this._findWidgetContainer.clientWidth);
	}

	/**
	 * Hide the find widget
	 */
	hideFind(): void {
		this._findWidget.rawValue?.hide();
	}

	/**
	 * Find the next match
	 */
	findNext(): void {
		this._findWidget.rawValue?.find(false);
	}

	/**
	 * Find the previous match
	 */
	findPrevious(): void {
		this._findWidget.rawValue?.find(true);
	}

	/**
	 * Start element selection in the browser view, wait for a user selection, and add it to chat.
	 */
	async addElementToChat(): Promise<void> {
		// If selection is already active, cancel it
		if (this._elementSelectionCts) {
			this._elementSelectionCts.dispose(true);
			this._elementSelectionCts = undefined;
			this._elementSelectionActiveContext.set(false);
			return;
		}

		// Start new selection
		const cts = new CancellationTokenSource();
		this._elementSelectionCts = cts;
		this._elementSelectionActiveContext.set(true);

		type IntegratedBrowserAddElementToChatStartEvent = {};

		type IntegratedBrowserAddElementToChatStartClassification = {
			owner: 'jruales';
			comment: 'The user initiated an Add Element to Chat action in Integrated Browser.';
		};

		this.telemetryService.publicLog2<IntegratedBrowserAddElementToChatStartEvent, IntegratedBrowserAddElementToChatStartClassification>('integratedBrowser.addElementToChat.start', {});

		try {
			// Get the resource URI for this editor
			const resourceUri = this.input?.resource;
			if (!resourceUri) {
				throw new Error('No resource URI found');
			}

			// Make the browser the focused view
			this.ensureBrowserFocus();

			// Create a locator - for integrated browser, use the URI scheme to identify
			// Browser view URIs have a special scheme we can match against
			const locator: IBrowserTargetLocator = { browserViewId: BrowserViewUri.getId(this.input.resource) };

			// Start debug session for integrated browser
			await this.browserElementsService.startDebugSession(cts.token, locator);

			// Get the browser container bounds
			const { width, height } = this._browserContainer.getBoundingClientRect();

			// Get element data from user selection
			const elementData = await this.browserElementsService.getElementData({ x: 0, y: 0, width, height }, cts.token, locator);
			if (!elementData) {
				throw new Error('Element data not found');
			}

			const bounds = elementData.bounds;
			const toAttach: IChatRequestVariableEntry[] = [];

			// Prepare HTML/CSS context
			const displayName = getDisplayNameFromOuterHTML(elementData.outerHTML);
			const attachCss = this.configurationService.getValue<boolean>('chat.sendElementsToChat.attachCSS');
			let value = (attachCss ? 'Attached HTML and CSS Context' : 'Attached HTML Context') + '\n\n' + elementData.outerHTML;
			if (attachCss) {
				value += '\n\n' + elementData.computedStyle;
			}

			toAttach.push({
				id: 'element-' + Date.now(),
				name: displayName,
				fullName: displayName,
				value: value,
				kind: 'element',
				icon: ThemeIcon.fromId(Codicon.layout.id),
			});

			// Attach screenshot if enabled
			const attachImages = this.configurationService.getValue<boolean>('chat.sendElementsToChat.attachImages');
			if (attachImages && this._model) {
				const screenshotBuffer = await this._model.captureScreenshot({
					quality: 90,
					rect: bounds
				});

				toAttach.push({
					id: 'element-screenshot-' + Date.now(),
					name: 'Element Screenshot',
					fullName: 'Element Screenshot',
					kind: 'image',
					value: screenshotBuffer.buffer
				});
			}

			// Attach to chat widget
			const widget = await this.chatWidgetService.revealWidget() ?? this.chatWidgetService.lastFocusedWidget;
			widget?.attachmentModel?.addContext(...toAttach);

			type IntegratedBrowserAddElementToChatAddedEvent = {
				attachCss: boolean;
				attachImages: boolean;
			};

			type IntegratedBrowserAddElementToChatAddedClassification = {
				attachCss: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether chat.sendElementsToChat.attachCSS was enabled.' };
				attachImages: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether chat.sendElementsToChat.attachImages was enabled.' };
				owner: 'jruales';
				comment: 'An element was successfully added to chat from Integrated Browser.';
			};

			this.telemetryService.publicLog2<IntegratedBrowserAddElementToChatAddedEvent, IntegratedBrowserAddElementToChatAddedClassification>('integratedBrowser.addElementToChat.added', {
				attachCss,
				attachImages
			});

		} catch (error) {
			if (!cts.token.isCancellationRequested) {
				this.logService.error('BrowserEditor.addElementToChat: Failed to select element', error);
			}
		} finally {
			cts.dispose();
			if (this._elementSelectionCts === cts) {
				this._elementSelectionCts = undefined;
				this._elementSelectionActiveContext.set(false);
			}
		}
	}

	/**
	 * Update navigation state and context keys
	 */
	private updateNavigationState(event: IBrowserViewNavigationEvent): void {
		// Update navigation bar UI
		this._navigationBar.updateFromNavigationEvent(event);

		// Update context keys for command enablement
		this._canGoBackContext.set(event.canGoBack);
		this._canGoForwardContext.set(event.canGoForward);

		// Update visibility (welcome screen, error, browser view)
		this.updateVisibility();
	}

	/**
	 * Create the welcome container shown when no URL is loaded
	 */
	private createWelcomeContainer(): HTMLElement {
		const container = $('.browser-welcome-container');
		const content = $('.browser-welcome-content');

		const iconContainer = $('.browser-welcome-icon');
		iconContainer.appendChild(renderIcon(Codicon.globe));
		content.appendChild(iconContainer);

		const title = $('.browser-welcome-title');
		title.textContent = localize('browser.welcomeTitle', "Browser");
		content.appendChild(title);

		const subtitle = $('.browser-welcome-subtitle');
		subtitle.textContent = localize('browser.welcomeSubtitle', "Enter a URL above to get started.");
		content.appendChild(subtitle);

		const chatEnabled = this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key);
		if (chatEnabled) {
			const tip = $('.browser-welcome-tip');
			tip.textContent = localize('browser.welcomeTip', "Tip: Use Add Element to Chat to reference UI elements in chat prompts.");
			content.appendChild(tip);
		}

		container.appendChild(content);
		return container;
	}

	private setBackgroundImage(buffer: VSBuffer | undefined): void {
		if (buffer) {
			const dataUrl = `data:image/jpeg;base64,${encodeBase64(buffer)}`;
			this._placeholderScreenshot.style.backgroundImage = `url('${dataUrl}')`;
		} else {
			this._placeholderScreenshot.style.backgroundImage = '';
		}
	}

	private async doScreenshot(): Promise<void> {
		if (!this._model) {
			return;
		}

		// Cancel any existing timeout
		this.cancelScheduledScreenshot();

		// Only take screenshots if the model is visible
		if (!this._model.visible) {
			return;
		}

		try {
			// Capture screenshot and set as background image
			const screenshot = await this._model.captureScreenshot({ quality: 80 });
			this.setBackgroundImage(screenshot);
		} catch (error) {
			this.logService.error('Failed to capture browser view screenshot', error);
		}

		// Schedule next screenshot in 1 second
		this._screenshotTimeout = setTimeout(() => this.doScreenshot(), 1000);
	}

	private cancelScheduledScreenshot(): void {
		if (this._screenshotTimeout) {
			clearTimeout(this._screenshotTimeout);
			this._screenshotTimeout = undefined;
		}
	}

	forwardCurrentEvent(): boolean {
		if (this._currentKeyDownEvent && this._model) {
			void this._model.dispatchKeyEvent(this._currentKeyDownEvent);
			return true;
		}
		return false;
	}

	private async handleKeyEventFromBrowserView(keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		this._currentKeyDownEvent = keyEvent;

		try {
			const syntheticEvent = new KeyboardEvent('keydown', keyEvent);
			const standardEvent = new StandardKeyboardEvent(syntheticEvent);

			const handled = this.keybindingService.dispatchEvent(standardEvent, this._browserContainer);
			if (!handled) {
				this.forwardCurrentEvent();
			}
		} catch (error) {
			this.logService.error('BrowserEditor.handleKeyEventFromBrowserView: Error dispatching key event', error);
		} finally {
			this._currentKeyDownEvent = undefined;
		}
	}

	override layout(dimension: Dimension, _position?: IDomPosition): void {
		// Layout find widget if it exists
		this._findWidget.rawValue?.layout(dimension.width);
	}

	/**
	 * This should be called whenever .browser-container changes in size, or when
	 * there could be any elements, such as the command palette, overlapping with it.
	 *
	 * Note that we don't call layoutBrowserContainer() from layout() but instead rely on using a ResizeObserver and on
	 * making direct calls to it. This is because we have seen cases where the getBoundingClientRect() values of
	 * the .browser-container element are not correct during layout() calls, especially during "Move into New Window"
	 * and "Copy into New Window" operations into a different monitor.
	 */
	layoutBrowserContainer(): void {
		if (this._model) {
			this.checkOverlays();

			const containerRect = this._browserContainer.getBoundingClientRect();
			void this._model.layout({
				windowId: this.group.windowId,
				x: containerRect.left,
				y: containerRect.top,
				width: containerRect.width,
				height: containerRect.height,
				zoomFactor: getZoomFactor(this.window)
			});
		}
	}

	override clearInput(): void {
		this._inputDisposables.clear();

		// Cancel any active element selection
		if (this._elementSelectionCts) {
			this._elementSelectionCts.dispose(true);
			this._elementSelectionCts = undefined;
		}

		// Cancel any scheduled screenshots
		this.cancelScheduledScreenshot();

		// Clear find widget model
		this._findWidget.rawValue?.setModel(undefined);
		this._findWidget.rawValue?.hide();

		void this._model?.setVisible(false);
		this._model = undefined;

		this._canGoBackContext.reset();
		this._canGoForwardContext.reset();
		this._storageScopeContext.reset();
		this._devToolsOpenContext.reset();
		this._elementSelectionActiveContext.reset();

		this._navigationBar.clear();
		this.setBackgroundImage(undefined);

		super.clearInput();
	}
}
