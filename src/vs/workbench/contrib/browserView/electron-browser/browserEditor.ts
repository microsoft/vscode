/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, Dimension, EventType, IDomPosition, registerExternalFocusChecker } from '../../../../base/browser/dom.js';
import { ButtonBar } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { RawContextKey, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, IConstructorSignature, BrandedService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';
import { IBrowserEditorViewState, IBrowserViewModel } from '../../browserView/common/browserView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IBrowserViewKeyDownEvent, IBrowserViewNavigationEvent, IBrowserViewLoadError, IBrowserViewCertificateError, BrowserNewPageLocation } from '../../../../platform/browserView/common/browserView.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { isMacintosh, isLinux } from '../../../../base/common/platform.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { BrowserOverlayManager, BrowserOverlayType, IBrowserOverlayInfo } from './overlayManager.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { BrowserFindWidget, CONTEXT_BROWSER_FIND_WIDGET_FOCUSED, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE } from './browserFindWidget.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { SiteInfoWidget } from './siteInfoWidget.js';
import { logBrowserOpen } from '../../../../platform/browserView/common/browserViewTelemetry.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';

export const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey<boolean>('browserCanGoBack', false, localize('browser.canGoBack', "Whether the browser can go back"));
export const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey<boolean>('browserCanGoForward', false, localize('browser.canGoForward', "Whether the browser can go forward"));
export const CONTEXT_BROWSER_FOCUSED = new RawContextKey<boolean>('browserFocused', true, localize('browser.editorFocused', "Whether the browser editor is focused"));
export const CONTEXT_BROWSER_STORAGE_SCOPE = new RawContextKey<string>('browserStorageScope', '', localize('browser.storageScope', "The storage scope of the current browser view"));
export const CONTEXT_BROWSER_HAS_URL = new RawContextKey<boolean>('browserHasUrl', false, localize('browser.hasUrl', "Whether the browser has a URL loaded"));
export const CONTEXT_BROWSER_HAS_ERROR = new RawContextKey<boolean>('browserHasError', false, localize('browser.hasError', "Whether the browser has a load error"));
export const CONTEXT_BROWSER_DEVTOOLS_OPEN = new RawContextKey<boolean>('browserDevToolsOpen', false, localize('browser.devToolsOpen', "Whether developer tools are open for the current browser view"));

// Re-export find widget context keys for use in actions
export { CONTEXT_BROWSER_FIND_WIDGET_FOCUSED, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE };

/**
 * Get the original implementation of HTMLElement focus (without window auto-focusing)
 * before it gets overridden by the workbench.
 */
const originalHtmlElementFocus = HTMLElement.prototype.focus;


/**
 * Base class for browser editor services that track the model lifecycle.
 *
 * Subclasses implement {@link subscribeToModel} which is called whenever a new model is set.
 * A {@link DisposableStore} is provided that is automatically cleared when the model
 * changes or the editor input is cleared.
 */
export abstract class BrowserEditorContribution extends Disposable {
	private readonly _modelStore = this._register(new DisposableStore());

	constructor(protected readonly editor: BrowserEditor) {
		super();
		this._register(editor.onDidChangeModel(model => {
			this._modelStore.clear();
			if (model) {
				this.subscribeToModel(model, this._modelStore);
			} else {
				this.clear();
			}
		}));
	}

	/**
	 * Called whenever the editor model changes to update state.
	 */
	protected subscribeToModel(_model: IBrowserViewModel, _store: DisposableStore): void { }

	/**
	 * Called when the model is cleared to reset state.
	 */
	clear(): void { }

	/**
	 * Optional widgets to display inside the URL bar (on the right side of the URL input,
	 * before the actions toolbar).
	 * Contributions can override this getter to provide widgets.
	 */
	get urlBarWidgets(): readonly IBrowserEditorWidgetContribution[] { return []; }
}

/**
 * A widget that can be contributed to the browser editor URL bar.
 */
export interface IBrowserEditorWidgetContribution {
	readonly element: HTMLElement;
	/** Ordering value — lower numbers appear first (left). */
	readonly order: number;
}

class BrowserNavigationBar extends Disposable {
	private readonly _urlInput: HTMLInputElement;
	private readonly _urlDisplay: HTMLElement;
	private readonly _siteInfoWidget: SiteInfoWidget;
	private readonly _urlBarWidgetsContainer: HTMLElement;

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

		// URL input container (wraps input + share toggle)
		const urlContainer = $('.browser-url-container');

		// Site info widget (inside URL bar, left side, hidden by default)
		const siteInfoContainer = $('.browser-site-info-slot');
		this._siteInfoWidget = this._register(instantiationService.createInstance(
			SiteInfoWidget,
			siteInfoContainer,
			editor
		));

		// URL input (hidden by default; shown when user clicks the display)
		this._urlInput = $<HTMLInputElement>('input.browser-url-input');
		this._urlInput.type = 'text';
		this._urlInput.placeholder = localize('browser.urlPlaceholder', "Enter a URL");
		this._urlInput.style.display = 'none';

		// URL display — shows the URL when not editing; clickable to switch to input
		const urlInputWrapper = $('.browser-url-input-wrapper');
		this._urlDisplay = $('span.browser-url-display');
		this._urlDisplay.tabIndex = 0;
		urlInputWrapper.appendChild(this._urlDisplay);
		urlInputWrapper.appendChild(this._urlInput);

		this._urlBarWidgetsContainer = $('.browser-url-bar-widgets');

		urlContainer.appendChild(siteInfoContainer);
		urlContainer.appendChild(urlInputWrapper);
		urlContainer.appendChild(this._urlBarWidgetsContainer);

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

		// Assemble layout: nav | url container | actions
		container.appendChild(navContainer);
		container.appendChild(urlContainer);
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

		// Switch back to display mode when the URL bar loses focus
		this._register(addDisposableListener(this._urlInput, EventType.BLUR, () => {
			this._showDisplay();
		}));
		this._register(addDisposableListener(this._urlDisplay, EventType.FOCUS, () => {
			this._showInput();
		}));
	}

	/**
	 * Update the navigation bar state from a navigation event
	 */
	updateFromNavigationEvent(event: IBrowserViewNavigationEvent): void {
		this._urlInput.value = event.url;
		this._updateDisplay();
	}

	/**
	 * Focus the URL input and select all text
	 */
	focusUrlInput(): void {
		this._showInput();
	}

	/**
	 * Show or hide the site info indicator
	 */
	setCertificateError(certError: IBrowserViewCertificateError | undefined): void {
		this._siteInfoWidget.setCertificateError(certError);
		this._urlInput.classList.toggle('cert-error', !!certError);
		this._updateDisplay();
	}

	/**
	 * Switch to input-editing mode: hide display, show and focus input.
	 */
	private _showInput(): void {
		this._urlDisplay.style.display = 'none';
		this._urlInput.style.display = '';
		this._urlInput.select();
		this._urlInput.focus();
	}

	/**
	 * Add widget elements inside the URL bar, sorted by order.
	 */
	addUrlBarWidgets(widgets: readonly IBrowserEditorWidgetContribution[]): void {
		const sorted = widgets.slice().sort((a, b) => a.order - b.order);
		for (const widget of sorted) {
			this._urlBarWidgetsContainer.appendChild(widget.element);
		}
	}

	/**
	 * Switch to display mode: hide the input and show the styled display.
	 */
	private _showDisplay(): void {
		this._urlInput.style.display = 'none';
		this._urlDisplay.style.display = '';
		this._updateDisplay();
	}

	/**
	 * Rebuild the display element's content.  When there is a cert error
	 * and the URL starts with "https://", the protocol is rendered with
	 * a red strikethrough; otherwise the full URL is shown plainly.
	 */
	private _updateDisplay(): void {
		const url = this._urlInput.value;
		const hasCertError = this._urlInput.classList.contains('cert-error');
		const httpsPrefix = 'https:';

		// Clear previous content
		this._urlDisplay.textContent = '';
		this._urlDisplay.classList.toggle('placeholder', !url);

		if (hasCertError && url.startsWith(httpsPrefix)) {
			const protocol = document.createElement('span');
			protocol.className = 'browser-url-display-protocol-bad';
			protocol.textContent = httpsPrefix;
			this._urlDisplay.appendChild(protocol);

			const rest = document.createElement('span');
			rest.textContent = url.slice(httpsPrefix.length);
			this._urlDisplay.appendChild(rest);
		} else {
			this._urlDisplay.textContent = url || localize('browser.urlPlaceholder', "Enter a URL");
		}
	}

	clear(): void {
		this._urlInput.value = '';
		this._siteInfoWidget.setCertificateError(undefined);
		this._updateDisplay();
	}
}

export class BrowserEditor extends EditorPane {

	// -- Contribution registry --------------------------------------------

	private static readonly _contributions: IConstructorSignature<BrowserEditorContribution, [BrowserEditor]>[] = [];
	static registerContribution<Services extends BrandedService[]>(ctor: { new(editor: BrowserEditor, ...services: Services): BrowserEditorContribution }): void {
		BrowserEditor._contributions.push(ctor as IConstructorSignature<BrowserEditorContribution, [BrowserEditor]>);
	}

	private readonly _contributionInstances = new Map<IConstructorSignature<BrowserEditorContribution, [BrowserEditor]>, BrowserEditorContribution>();
	getContribution<T extends BrowserEditorContribution, Services extends BrandedService[]>(ctor: { new(editor: BrowserEditor, ...services: Services): T }): T | undefined {
		return this._contributionInstances.get(ctor as IConstructorSignature<BrowserEditorContribution, [BrowserEditor]>) as T | undefined;
	}

	// -- Model lifecycle ------------------------------------------------

	private _model: IBrowserViewModel | undefined;
	get model(): IBrowserViewModel | undefined { return this._model; }
	private readonly _onDidChangeModel = this._register(new Emitter<IBrowserViewModel | undefined>());
	readonly onDidChangeModel = this._onDidChangeModel.event;

	// -- State ----------------------------------------------------------

	private _overlayVisible = false;
	private _editorVisible = false;
	private _currentKeyDownEvent: IBrowserViewKeyDownEvent | undefined;

	private _navigationBar!: BrowserNavigationBar;
	private _browserContainerWrapper!: HTMLElement;
	private _browserContainer!: HTMLElement;
	get browserContainer(): HTMLElement { return this._browserContainer; }
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
	private _hasUrlContext!: IContextKey<boolean>;
	private _hasErrorContext!: IContextKey<boolean>;
	private _devToolsOpenContext!: IContextKey<boolean>;

	private readonly _inputDisposables = this._register(new DisposableStore());
	private overlayManager: BrowserOverlayManager | undefined;
	private _screenshotTimeout: ReturnType<typeof setTimeout> | undefined;
	private readonly _certActionButton = this._register(new MutableDisposable<ButtonBar>());

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
		@ILayoutService private readonly layoutService: ILayoutService,
	) {
		super(BrowserEditorInput.EDITOR_ID, group, telemetryService, themeService, storageService);
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
		this._hasUrlContext = CONTEXT_BROWSER_HAS_URL.bindTo(contextKeyService);
		this._hasErrorContext = CONTEXT_BROWSER_HAS_ERROR.bindTo(contextKeyService);
		this._devToolsOpenContext = CONTEXT_BROWSER_DEVTOOLS_OPEN.bindTo(contextKeyService);

		// Currently this is always true since it is scoped to the editor container
		CONTEXT_BROWSER_FOCUSED.bindTo(contextKeyService);

		// Create a scoped instantiation service so contributions get the scoped context key service
		const scopedInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, contextKeyService])
		));

		// Instantiate all registered contributions
		for (const ctor of BrowserEditor._contributions) {
			const instance = this._register(scopedInstantiationService.createInstance(ctor, this));
			this._contributionInstances.set(ctor, instance);
		}

		// Create root container
		const root = $('.browser-root');
		parent.appendChild(root);

		// Create toolbar with navigation buttons and URL input
		const toolbar = $('.browser-toolbar');

		// Create navigation bar widget with scoped context
		this._navigationBar = this._register(new BrowserNavigationBar(this, toolbar, this.instantiationService, contextKeyService));

		// Inject URL bar widgets from contributions
		const allWidgets: IBrowserEditorWidgetContribution[] = [];
		for (const contribution of this._contributionInstances.values()) {
			allWidgets.push(...contribution.urlBarWidgets);
		}
		this._navigationBar.addUrlBarWidgets(allWidgets);

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
			findWidget.onDidChangeHeight(() => {
				this.layoutBrowserContainer();
			});
			return findWidget;
		});
		this._register(toDisposable(() => this._findWidget.rawValue?.dispose()));

		// Create browser container wrapper (flex item that fills remaining space)
		this._browserContainerWrapper = $('.browser-container-wrapper');
		this._browserContainerWrapper.style.setProperty('--zoom-factor', String(getZoomFactor(this.window)));
		root.appendChild(this._browserContainerWrapper);

		// Create browser container (stub element for positioning)
		this._browserContainer = $('.browser-container');
		this._browserContainer.tabIndex = 0; // make focusable
		this._browserContainerWrapper.appendChild(this._browserContainer);

		// Create additional wrapper around placeholder contents for applying border radius clipping.
		const placeholderContents = $('.browser-placeholder-contents');
		this._browserContainer.appendChild(placeholderContents);

		// Create placeholder screenshot (background placeholder when WebContentsView is hidden)
		this._placeholderScreenshot = $('.browser-placeholder-screenshot');
		placeholderContents.appendChild(this._placeholderScreenshot);

		// Create overlay pause container (hidden by default via CSS)
		this._overlayPauseContainer = $('.browser-overlay-paused');
		const overlayPauseMessage = $('.browser-overlay-paused-message');
		this._overlayPauseHeading = $('.browser-overlay-paused-heading');
		this._overlayPauseDetail = $('.browser-overlay-paused-detail');
		overlayPauseMessage.appendChild(this._overlayPauseHeading);
		overlayPauseMessage.appendChild(this._overlayPauseDetail);
		this._overlayPauseContainer.appendChild(overlayPauseMessage);
		placeholderContents.appendChild(this._overlayPauseContainer);

		// Create error container (hidden by default)
		this._errorContainer = $('.browser-error-container');
		this._errorContainer.style.display = 'none';
		placeholderContents.appendChild(this._errorContainer);

		// Create welcome container (shown when no URL is loaded)
		this._welcomeContainer = this.createWelcomeContainer();
		placeholderContents.appendChild(this._welcomeContainer);

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
	}

	override focus(): void {
		if (this._model?.url && !this._model.error) {
			void this._model.focus();
		} else {
			this.focusUrlInput();
		}
	}

	override async setInput(input: BrowserEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		this._inputDisposables.clear();

		// Resolve the browser view model from the input
		const model = await input.resolve();

		if (token.isCancellationRequested || this.input !== input) {
			return;
		}

		this._model = model;
		this._onDidChangeModel.fire(model);

		this._storageScopeContext.set(this._model.storageScope);
		this._devToolsOpenContext.set(this._model.isDevToolsOpen);

		// Update find widget with new model
		this._findWidget.rawValue?.setModel(this._model);

		// Initialize UI state and context keys from model
		this.updateNavigationState({
			url: this._model.url,
			title: this._model.title,
			canGoBack: this._model.canGoBack,
			canGoForward: this._model.canGoForward,
			certificateError: this._model.certificateError
		});
		this.setBackgroundImage(this._model.screenshot);

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

		this._inputDisposables.add(this._model.onDidRequestNewPage(({ resource, url, location, position }) => {
			logBrowserOpen(this.telemetryService, (() => {
				switch (location) {
					case BrowserNewPageLocation.Background: return 'browserLinkBackground';
					case BrowserNewPageLocation.Foreground: return 'browserLinkForeground';
					case BrowserNewPageLocation.NewWindow: return 'browserLinkNewWindow';
				}
			})());

			const targetGroup = location === BrowserNewPageLocation.NewWindow ? AUX_WINDOW_GROUP : this.group;
			const viewState: IBrowserEditorViewState = { url };
			this.editorService.openEditor({
				resource: URI.revive(resource),
				options: {
					pinned: true,
					inactive: location === BrowserNewPageLocation.Background,
					auxiliary: {
						bounds: position,
						compact: true
					},
					viewState
				}
			}, targetGroup);
		}));

		this._inputDisposables.add(this.overlayManager!.onDidChangeOverlayState(() => {
			this.checkOverlays();
		}));

		// Listen for workbench zoom level changes and update browser view placeholder screenshot's zoom factor
		this._inputDisposables.add(onDidChangeZoomLevel(targetWindowId => {
			if (targetWindowId === this.window.vscodeWindowId) {
				// Update CSS variable for size calculations
				this._browserContainerWrapper.style.setProperty('--zoom-factor', String(getZoomFactor(this.window)));
			}
		}));

		this.updateErrorDisplay();
		this.layout();
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
	ensureBrowserFocus(): void {
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
		this._hasErrorContext.set(!!error);

		this._navigationBar.setCertificateError(
			this._model.certificateError ?? error?.certificateError
		);

		if (error) {
			// Update error content
			this._certActionButton.clear();

			while (this._errorContainer.firstChild) {
				this._errorContainer.removeChild(this._errorContainer.firstChild);
			}

			const errorContent = $('.browser-error-content');
			const isCertError = !!error.certificateError;

			const errorIcon = $('.browser-error-icon');
			errorIcon.classList.toggle('cert-error', isCertError);
			errorIcon.appendChild(renderIcon(isCertError ? Codicon.workspaceUntrusted : Codicon.globe));

			const errorTitle = $('.browser-error-title');
			errorTitle.textContent = isCertError
				? localize('browser.certErrorLabel', "Certificate Error")
				: localize('browser.loadErrorLabel', "Failed to Load Page");

			const errorMessage = $('.browser-error-detail');
			const errorText = $('span');
			errorText.textContent = isCertError
				? localize('browser.certErrorDescription', "This site's security certificate could not be verified.")
				: `${error.errorDescription} (${error.errorCode})`;
			errorMessage.appendChild(errorText);

			const errorUrl = $('.browser-error-detail');
			const urlLabel = $('strong');
			urlLabel.textContent = localize('browser.errorUrlLabel', "URL:");
			const urlValue = $('code');
			urlValue.textContent = error.url;
			errorUrl.appendChild(urlLabel);
			errorUrl.appendChild(document.createTextNode(' '));
			errorUrl.appendChild(urlValue);

			errorContent.appendChild(errorIcon);
			errorContent.appendChild(errorTitle);
			errorContent.appendChild(errorMessage);

			// Show cert error name below description, above URL
			if (error.certificateError) {
				const extraWarning = $('b.browser-error-detail');
				extraWarning.textContent = localize('browser.certErrorExtraWarning', " Your connection is not private.");
				errorMessage.appendChild(extraWarning);
			}

			errorContent.appendChild(errorUrl);

			// Show certificate details table and actions
			if (error.certificateError) {
				const certError = error.certificateError;

				const certDetailsTable = $('.browser-cert-details-table');

				const heading = $('.browser-cert-details-heading');
				heading.textContent = localize('browser.certDetailsHeading', "Certificate Details");
				certDetailsTable.appendChild(heading);

				const addRow = (label: string, value: string) => {
					const row = $('.browser-cert-details-row');
					const labelEl = $('.browser-cert-details-label');
					labelEl.textContent = label;
					const valueEl = $('.browser-cert-details-value');
					valueEl.textContent = value;
					row.appendChild(labelEl);
					row.appendChild(valueEl);
					certDetailsTable.appendChild(row);
				};

				addRow(localize('browser.certError', "Error"), certError.error);
				addRow(localize('browser.certIssuer', "Issuer"), certError.issuerName);
				addRow(localize('browser.certSubject', "Subject"), certError.subjectName);

				const formatDate = (epoch: number) => new Date(epoch * 1000).toLocaleDateString();
				addRow(
					localize('browser.certValid', "Valid"),
					`${formatDate(certError.validStart)} - ${formatDate(certError.validExpiry)}`
				);

				addRow(localize('browser.certFingerprint', "Fingerprint"), certError.fingerprint);

				errorContent.appendChild(certDetailsTable);

				const actionContainer = $('.browser-cert-action');
				actionContainer.classList.toggle('reverse', isMacintosh || isLinux);
				const canGoBack = this._model.canGoBack;
				const buttonBar = new ButtonBar(actionContainer);
				this._certActionButton.value = buttonBar;

				const primaryButton = buttonBar.addButton({ ...defaultButtonStyles });
				primaryButton.label = canGoBack
					? localize('browser.certGoBack', "Go Back")
					: localize('browser.certCloseTab', "Close Tab");
				primaryButton.onDidClick(() => {
					if (canGoBack) {
						this.goBack();
					} else {
						this.group?.closeEditor(this.input);
					}
				});

				const secondaryButton = buttonBar.addButton({ ...defaultButtonStyles, secondary: true });
				secondaryButton.label = localize('browser.certProceed', "Proceed anyway (unsafe)");
				secondaryButton.onDidClick(() => {
					this._model?.trustCertificate(certError.host, certError.fingerprint);
				});

				errorContent.appendChild(actionContainer);
			}

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

	getCertificateError(): IBrowserViewCertificateError | undefined {
		return this._model?.certificateError;
	}

	/**
	 * Revoke trust for the certificate and close this editor tab.
	 */
	revokeAndClose(certError: IBrowserViewCertificateError): void {
		// This method automatically closes the browser view.
		this._model?.untrustCertificate(certError.host, certError.fingerprint);
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

	async reload(hard?: boolean): Promise<void> {
		return this._model?.reload(hard);
	}

	async toggleDevTools(): Promise<void> {
		return this._model?.toggleDevTools();
	}

	async clearStorage(): Promise<void> {
		return this._model?.clearStorage();
	}

	/**
	 * Show the find widget, optionally pre-populated with selected text from the browser view
	 */
	async showFind(): Promise<void> {
		// Get selected text from the browser view to pre-populate the search box.
		const selectedText = (await this._model?.getSelectedText())?.trim();

		// Only use the selected text if it doesn't contain newlines (single line selection)
		const textToReveal = selectedText && !/[\r\n]/.test(selectedText) ? selectedText : undefined;
		this._findWidget.value.reveal(textToReveal);
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
	 * Update navigation state and context keys
	 */
	private updateNavigationState(event: IBrowserViewNavigationEvent): void {
		// Update navigation bar UI
		this._navigationBar.updateFromNavigationEvent(event);
		this._navigationBar.setCertificateError(event.certificateError);

		// Update context keys for command enablement
		this._canGoBackContext.set(event.canGoBack);
		this._canGoForwardContext.set(event.canGoForward);
		this._hasUrlContext.set(!!event.url);

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
		const chatEnabled = this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key);
		subtitle.textContent = chatEnabled
			? localize('browser.welcomeSubtitleChat', "Use Add Element to Chat to reference UI elements in chat prompts.")
			: localize('browser.welcomeSubtitle', "Enter a URL above to get started.");
		content.appendChild(subtitle);

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

	override layout(dimension?: Dimension, _position?: IDomPosition): void {
		// Layout find widget if it exists
		if (dimension && this._findWidget.rawValue) {
			this._findWidget.rawValue.layout(dimension.width);
		}

		const whenContainerStylesLoaded = this.layoutService.whenContainerStylesLoaded(this.window);
		if (whenContainerStylesLoaded) {
			// In floating windows, we need to ensure that the
			// container is ready for us to compute certain
			// layout related properties.
			whenContainerStylesLoaded.then(() => this.layoutBrowserContainer());
		} else {
			this.layoutBrowserContainer();
		}
	}

	/**
	 * Recompute the layout of the browser container and update the model with the new bounds.
	 * This should generally only be called via layout() to ensure that the container is ready and all necessary styles are loaded.
	 */
	private layoutBrowserContainer(): void {
		if (this._model) {
			this.checkOverlays();

			const containerRect = this._browserContainer.getBoundingClientRect();
			const cornerRadius = this.window.getComputedStyle(this._browserContainer).borderTopLeftRadius ?? '0';

			void this._model.layout({
				windowId: this.group.windowId,
				x: containerRect.left,
				y: containerRect.top,
				width: containerRect.width,
				height: containerRect.height,
				zoomFactor: getZoomFactor(this.window),
				cornerRadius: parseFloat(cornerRadius)
			});
		}
	}

	override clearInput(): void {
		this._inputDisposables.clear();

		// Cancel any scheduled screenshots
		this.cancelScheduledScreenshot();

		// Clear find widget model
		this._findWidget.rawValue?.setModel(undefined);
		this._findWidget.rawValue?.hide();

		void this._model?.setVisible(false);
		this._model = undefined;
		this._onDidChangeModel.fire(undefined);

		this._canGoBackContext.reset();
		this._canGoForwardContext.reset();
		this._hasUrlContext.reset();
		this._hasErrorContext.reset();
		this._storageScopeContext.reset();
		this._devToolsOpenContext.reset();

		this._navigationBar.clear();
		this.setBackgroundImage(undefined);

		super.clearInput();
	}
}
