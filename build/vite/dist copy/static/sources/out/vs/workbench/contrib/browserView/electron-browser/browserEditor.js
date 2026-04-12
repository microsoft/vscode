/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BrowserEditor_1;
import './media/browser.css';
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, EventType, registerExternalFocusChecker } from '../../../../base/browser/dom.js';
import { ButtonBar } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { RawContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { BrowserNewPageLocation } from '../../../../platform/browserView/common/browserView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { isMacintosh, isLinux } from '../../../../base/common/platform.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { BrowserOverlayManager, BrowserOverlayType } from './overlayManager.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { encodeBase64 } from '../../../../base/common/buffer.js';
import { SiteInfoWidget } from './siteInfoWidget.js';
import { logBrowserOpen } from '../../../../platform/browserView/common/browserViewTelemetry.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
export const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey('browserCanGoBack', false, localize('browser.canGoBack', "Whether the browser can go back"));
export const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey('browserCanGoForward', false, localize('browser.canGoForward', "Whether the browser can go forward"));
export const CONTEXT_BROWSER_FOCUSED = new RawContextKey('browserFocused', true, localize('browser.editorFocused', "Whether the browser editor is focused"));
export const CONTEXT_BROWSER_HAS_URL = new RawContextKey('browserHasUrl', false, localize('browser.hasUrl', "Whether the browser has a URL loaded"));
export const CONTEXT_BROWSER_HAS_ERROR = new RawContextKey('browserHasError', false, localize('browser.hasError', "Whether the browser has a load error"));
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
export class BrowserEditorContribution extends Disposable {
    constructor(editor) {
        super();
        this.editor = editor;
        this._modelStore = this._register(new DisposableStore());
        this._register(editor.onDidChangeModel(model => {
            this._modelStore.clear();
            if (model) {
                this.subscribeToModel(model, this._modelStore);
            }
            else {
                this.clear();
            }
        }));
    }
    /**
     * Called whenever the editor model changes to update state.
     */
    subscribeToModel(_model, _store) { }
    /**
     * Called when the model is cleared to reset state.
     */
    clear() { }
    /**
     * Optional widgets to display inside the URL bar (on the right side of the URL input,
     * before the actions toolbar).
     * Contributions can override this getter to provide widgets.
     */
    get urlBarWidgets() { return []; }
    /**
     * Optional toolbar-like elements to insert into the editor root between the navbar and the
     * browser container.  Contributions can override this getter to provide elements.
     */
    get toolbarElements() { return []; }
    /**
     * Called when the editor is laid out with a new dimension.
     */
    layout(_width) { }
}
class BrowserNavigationBar extends Disposable {
    constructor(editor, container, instantiationService, scopedContextKeyService) {
        super();
        // Create hover delegate for toolbar buttons
        const hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, 'element', undefined, { position: { hoverPosition: 3 /* HoverPosition.ABOVE */ } }));
        // Create navigation toolbar (left side) with scoped context
        const navContainer = $('.browser-nav-toolbar');
        const scopedInstantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));
        const navToolbar = this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, navContainer, MenuId.BrowserNavigationToolbar, {
            hoverDelegate,
            highlightToggledItems: true,
            // Render all actions inline regardless of group
            toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
            menuOptions: { shouldForwardArgs: true }
        }));
        // URL input container (wraps input + share toggle)
        const urlContainer = $('.browser-url-container');
        // Site info widget (inside URL bar, left side, hidden by default)
        const siteInfoContainer = $('.browser-site-info-slot');
        this._siteInfoWidget = this._register(instantiationService.createInstance(SiteInfoWidget, siteInfoContainer, editor));
        // URL input (hidden by default; shown when user clicks the display)
        this._urlInput = $('input.browser-url-input');
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
        const actionsToolbar = this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, MenuId.BrowserActionsToolbar, {
            hoverDelegate,
            highlightToggledItems: true,
            toolbarOptions: { primaryGroup: (group) => group.startsWith('actions'), useSeparatorsInPrimaryActions: true },
            menuOptions: { shouldForwardArgs: true }
        }));
        navToolbar.context = editor;
        actionsToolbar.context = editor;
        // Assemble layout: nav | url container | actions
        container.appendChild(navContainer);
        container.appendChild(urlContainer);
        container.appendChild(actionsContainer);
        // Setup URL input handler
        this._register(addDisposableListener(this._urlInput, EventType.KEY_DOWN, (e) => {
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
    updateFromNavigationEvent(event) {
        this._urlInput.value = event.url;
        this._updateDisplay();
    }
    /**
     * Focus the URL input and select all text
     */
    focusUrlInput() {
        this._showInput();
    }
    /**
     * Show or hide the site info indicator
     */
    setCertificateError(certError) {
        this._siteInfoWidget.setCertificateError(certError);
        this._urlInput.classList.toggle('cert-error', !!certError);
        this._updateDisplay();
    }
    /**
     * Switch to input-editing mode: hide display, show and focus input.
     */
    _showInput() {
        this._urlDisplay.style.display = 'none';
        this._urlInput.style.display = '';
        this._urlInput.select();
        this._urlInput.focus();
    }
    /**
     * Add widget elements inside the URL bar, sorted by order.
     */
    addUrlBarWidgets(widgets) {
        const sorted = widgets.slice().sort((a, b) => a.order - b.order);
        for (const widget of sorted) {
            this._urlBarWidgetsContainer.appendChild(widget.element);
        }
    }
    /**
     * Switch to display mode: hide the input and show the styled display.
     */
    _showDisplay() {
        this._urlInput.style.display = 'none';
        this._urlDisplay.style.display = '';
        this._updateDisplay();
    }
    /**
     * Rebuild the display element's content.  When there is a cert error
     * and the URL starts with "https://", the protocol is rendered with
     * a red strikethrough; otherwise the full URL is shown plainly.
     */
    _updateDisplay() {
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
        }
        else {
            this._urlDisplay.textContent = url || localize('browser.urlPlaceholder', "Enter a URL");
        }
    }
    clear() {
        this._urlInput.value = '';
        this._siteInfoWidget.setCertificateError(undefined);
        this._updateDisplay();
    }
}
let BrowserEditor = class BrowserEditor extends EditorPane {
    static { BrowserEditor_1 = this; }
    // -- Contribution registry --------------------------------------------
    static { this._contributions = []; }
    static registerContribution(ctor) {
        BrowserEditor_1._contributions.push(ctor);
    }
    getContribution(ctor) {
        return this._contributionInstances.get(ctor);
    }
    get model() { return this._model; }
    get browserContainer() { return this._browserContainer; }
    constructor(group, telemetryService, themeService, storageService, keybindingService, logService, instantiationService, contextKeyService, editorService, layoutService) {
        super(BrowserEditorInput.EDITOR_ID, group, telemetryService, themeService, storageService);
        this.keybindingService = keybindingService;
        this.logService = logService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.editorService = editorService;
        this.layoutService = layoutService;
        this._contributionInstances = new Map();
        this._onDidChangeModel = this._register(new Emitter());
        this.onDidChangeModel = this._onDidChangeModel.event;
        // -- State ----------------------------------------------------------
        this._overlayVisible = false;
        this._editorVisible = false;
        this._inputDisposables = this._register(new DisposableStore());
        this._certActionButton = this._register(new MutableDisposable());
    }
    createEditor(parent) {
        // Create scoped context key service for this editor instance
        const contextKeyService = this._register(this.contextKeyService.createScoped(parent));
        // Create window-specific overlay manager for this editor
        this.overlayManager = this._register(new BrowserOverlayManager(this.window));
        // Bind navigation capability context keys
        this._canGoBackContext = CONTEXT_BROWSER_CAN_GO_BACK.bindTo(contextKeyService);
        this._canGoForwardContext = CONTEXT_BROWSER_CAN_GO_FORWARD.bindTo(contextKeyService);
        this._hasUrlContext = CONTEXT_BROWSER_HAS_URL.bindTo(contextKeyService);
        this._hasErrorContext = CONTEXT_BROWSER_HAS_ERROR.bindTo(contextKeyService);
        // Currently this is always true since it is scoped to the editor container
        CONTEXT_BROWSER_FOCUSED.bindTo(contextKeyService);
        // Create a scoped instantiation service so contributions get the scoped context key service
        const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        // Instantiate all registered contributions
        for (const ctor of BrowserEditor_1._contributions) {
            const instance = this._register(scopedInstantiationService.createInstance(ctor, this));
            this._contributionInstances.set(ctor, instance);
        }
        // Create root container
        const root = $('.browser-root');
        parent.appendChild(root);
        // Create navbar with navigation buttons and URL input
        const navbar = $('.browser-navbar');
        // Create navigation bar widget with scoped context
        this._navigationBar = this._register(new BrowserNavigationBar(this, navbar, this.instantiationService, contextKeyService));
        // Inject URL bar widgets from contributions
        const allWidgets = [];
        for (const contribution of this._contributionInstances.values()) {
            allWidgets.push(...contribution.urlBarWidgets);
        }
        this._navigationBar.addUrlBarWidgets(allWidgets);
        root.appendChild(navbar);
        // Collect toolbar elements from contributions (e.g. find widget container)
        for (const contribution of this._contributionInstances.values()) {
            for (const element of contribution.toolbarElements) {
                root.appendChild(element);
            }
        }
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
                this.requestFocus();
            }
        }));
        this._register(addDisposableListener(this._browserContainer, EventType.BLUR, () => {
            // If the container becomes blurred, cancel any scheduled focus call.
            // This can happen when e.g. a menu closes and focus shifts back to the browser, then immediately focuses another element.
            this.cancelFocus();
        }));
        // Register external focus checker so that cross-window focus logic knows when
        // this browser view has focus (since it's outside the normal DOM tree).
        // Include window info so that UI like dialogs appear in the correct window.
        this._register(registerExternalFocusChecker(() => ({
            hasFocus: this._model?.focused ?? false,
            window: this._model?.focused ? this.window : undefined
        })));
    }
    focus() {
        if (this._model?.url && !this._model.error) {
            this.requestFocus();
        }
        else {
            this.focusUrlInput();
        }
    }
    requestFocus() {
        this.ensureBrowserFocus();
        if (this._focusTimeout) {
            return;
        }
        this._focusTimeout = setTimeout(() => {
            this._focusTimeout = undefined;
            if (this._model) {
                void this._model.focus();
            }
        }, 0);
    }
    cancelFocus() {
        if (this._focusTimeout) {
            clearTimeout(this._focusTimeout);
            this._focusTimeout = undefined;
        }
    }
    async setInput(input, options, context, token) {
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
        this._inputDisposables.add(this._model.onDidNavigate((navEvent) => {
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
        this._inputDisposables.add(this._model.onDidRequestNewPage(({ resource, url, location, position }) => {
            logBrowserOpen(this.telemetryService, (() => {
                switch (location) {
                    case BrowserNewPageLocation.Background: return 'browserLinkBackground';
                    case BrowserNewPageLocation.Foreground: return 'browserLinkForeground';
                    case BrowserNewPageLocation.NewWindow: return 'browserLinkNewWindow';
                }
            })());
            const targetGroup = location === BrowserNewPageLocation.NewWindow ? AUX_WINDOW_GROUP : this.group;
            const viewState = { url };
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
        this._inputDisposables.add(this.overlayManager.onDidChangeOverlayState(() => {
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
    setEditorVisible(visible) {
        this._editorVisible = visible;
        this.updateVisibility();
    }
    /**
     * Make the browser container the active element without moving focus from the browser view.
     */
    ensureBrowserFocus() {
        originalHtmlElementFocus.call(this._browserContainer);
    }
    updateVisibility() {
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
                if (this._browserContainer.ownerDocument.hasFocus() &&
                    this._browserContainer.ownerDocument.activeElement === this._browserContainer) {
                    // If the editor is focused, ensure the browser view also gets focus
                    this.requestFocus();
                }
            }
            else {
                this.doScreenshot();
                // Hide the browser view just before the next render.
                // This attempts to give the screenshot some time to be captured and displayed.
                // If we hide immediately it is more likely to flicker while the old screenshot is still visible.
                this.window.requestAnimationFrame(() => this._model?.setVisible(false));
            }
        }
    }
    get shouldShowView() {
        return this._editorVisible && !this._overlayVisible && !this._model?.error && !!this._model?.url;
    }
    checkOverlays() {
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
    updateOverlayPauseMessage(overlappingOverlays) {
        // Only show the pause message for notification overlays
        const hasNotificationOverlay = overlappingOverlays.some(overlay => overlay.type === BrowserOverlayType.Notification);
        this._overlayPauseContainer.classList.toggle('show-message', hasNotificationOverlay);
        if (hasNotificationOverlay) {
            this._overlayPauseHeading.textContent = localize('browser.overlayPauseHeading.notification', "Paused due to Notification");
            this._overlayPauseDetail.textContent = localize('browser.overlayPauseDetail.notification', "Dismiss the notification to continue using the browser.");
        }
        else {
            this._overlayPauseHeading.textContent = '';
            this._overlayPauseDetail.textContent = '';
        }
    }
    updateErrorDisplay() {
        if (!this._model) {
            return;
        }
        const error = this._model.error;
        this._hasErrorContext.set(!!error);
        this._navigationBar.setCertificateError(this._model.certificateError ?? error?.certificateError);
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
                const addRow = (label, value) => {
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
                const formatDate = (epoch) => new Date(epoch * 1000).toLocaleDateString();
                addRow(localize('browser.certValid', "Valid"), `${formatDate(certError.validStart)} - ${formatDate(certError.validExpiry)}`);
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
                    }
                    else {
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
        }
        else {
            this.setBackgroundImage(this._model.screenshot);
        }
        this.updateVisibility();
    }
    getUrl() {
        return this._model?.url;
    }
    getCertificateError() {
        return this._model?.certificateError;
    }
    /**
     * Revoke trust for the certificate and close this editor tab.
     */
    revokeAndClose(certError) {
        // This method automatically closes the browser view.
        this._model?.untrustCertificate(certError.host, certError.fingerprint);
    }
    async navigateToUrl(url) {
        if (this._model) {
            this.group.pinEditor(this.input); // pin editor on navigation
            // Special case localhost URLs (e.g., "localhost:3000") to add http://
            if (/^localhost(:|\/|$)/i.test(url)) {
                url = 'http://' + url;
            }
            else if (!URL.parse(url)?.protocol) {
                // If no scheme provided, default to http (sites will generally upgrade to https)
                url = 'http://' + url;
            }
            this.ensureBrowserFocus();
            await this._model.loadURL(url);
        }
    }
    focusUrlInput() {
        this._navigationBar.focusUrlInput();
    }
    async goBack() {
        return this._model?.goBack();
    }
    async goForward() {
        return this._model?.goForward();
    }
    async reload(hard) {
        return this._model?.reload(hard);
    }
    async toggleDevTools() {
        return this._model?.toggleDevTools();
    }
    async clearStorage() {
        return this._model?.clearStorage();
    }
    /**
     * Update navigation state and context keys
     */
    updateNavigationState(event) {
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
    createWelcomeContainer() {
        const container = $('.browser-welcome-container');
        const content = $('.browser-welcome-content');
        const iconContainer = $('.browser-welcome-icon');
        iconContainer.appendChild(renderIcon(Codicon.globe));
        content.appendChild(iconContainer);
        const title = $('.browser-welcome-title');
        title.textContent = localize('browser.welcomeTitle', "Browser");
        content.appendChild(title);
        const subtitle = $('.browser-welcome-subtitle');
        const chatEnabled = this.contextKeyService.getContextKeyValue(ChatContextKeys.enabled.key);
        subtitle.textContent = chatEnabled
            ? localize('browser.welcomeSubtitleChat', "Use Add Element to Chat to reference UI elements in chat prompts.")
            : localize('browser.welcomeSubtitle', "Enter a URL above to get started.");
        content.appendChild(subtitle);
        container.appendChild(content);
        return container;
    }
    setBackgroundImage(buffer) {
        if (buffer) {
            const dataUrl = `data:image/jpeg;base64,${encodeBase64(buffer)}`;
            this._placeholderScreenshot.style.backgroundImage = `url('${dataUrl}')`;
        }
        else {
            this._placeholderScreenshot.style.backgroundImage = '';
        }
    }
    async doScreenshot() {
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
        }
        catch (error) {
            this.logService.error('Failed to capture browser view screenshot', error);
        }
        // Schedule next screenshot in 1 second
        this._screenshotTimeout = setTimeout(() => this.doScreenshot(), 1000);
    }
    cancelScheduledScreenshot() {
        if (this._screenshotTimeout) {
            clearTimeout(this._screenshotTimeout);
            this._screenshotTimeout = undefined;
        }
    }
    async handleKeyEventFromBrowserView(keyEvent) {
        try {
            const syntheticEvent = new KeyboardEvent('keydown', keyEvent);
            const standardEvent = new StandardKeyboardEvent(syntheticEvent);
            this.keybindingService.dispatchEvent(standardEvent, this._browserContainer);
        }
        catch (error) {
            this.logService.error('BrowserEditor.handleKeyEventFromBrowserView: Error dispatching key event', error);
        }
    }
    layout(dimension, _position) {
        if (dimension) {
            for (const contribution of this._contributionInstances.values()) {
                contribution.layout(dimension.width);
            }
        }
        const whenContainerStylesLoaded = this.layoutService.whenContainerStylesLoaded(this.window);
        if (whenContainerStylesLoaded) {
            // In floating windows, we need to ensure that the
            // container is ready for us to compute certain
            // layout related properties.
            whenContainerStylesLoaded.then(() => this.layoutBrowserContainer());
        }
        else {
            this.layoutBrowserContainer();
        }
    }
    /**
     * Recompute the layout of the browser container and update the model with the new bounds.
     * This should generally only be called via layout() to ensure that the container is ready and all necessary styles are loaded.
     */
    layoutBrowserContainer() {
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
    clearInput() {
        this._inputDisposables.clear();
        // Cancel any scheduled timers
        this.cancelScheduledScreenshot();
        this.cancelFocus();
        void this._model?.setVisible(false);
        this._model = undefined;
        this._onDidChangeModel.fire(undefined);
        this._canGoBackContext.reset();
        this._canGoForwardContext.reset();
        this._hasUrlContext.reset();
        this._hasErrorContext.reset();
        this._navigationBar.clear();
        this.setBackgroundImage(undefined);
        super.clearInput();
    }
};
BrowserEditor = BrowserEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IKeybindingService),
    __param(5, ILogService),
    __param(6, IInstantiationService),
    __param(7, IContextKeyService),
    __param(8, IEditorService),
    __param(9, ILayoutService)
], BrowserEditor);
export { BrowserEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlckVkaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvYnJvd3NlckVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxxQkFBcUIsQ0FBQztBQUM3QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBYSxTQUFTLEVBQWdCLDRCQUE0QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0ksT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUVqRixPQUFPLEVBQUUsYUFBYSxFQUFlLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEgsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBeUMsTUFBTSw0REFBNEQsQ0FBQztBQUMxSSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUs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