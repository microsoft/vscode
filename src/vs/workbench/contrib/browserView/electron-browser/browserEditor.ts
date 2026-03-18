/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, Dimension, EventType, IDomPosition, registerExternalFocusChecker } from '../../../../base/browser/dom.js';
import { Button, ButtonBar } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import {
	IBrowserEditorViewState,
	IBrowserViewModel
} from '../../browserView/common/browserView.js';
import { IBrowserZoomService } from '../../browserView/common/browserZoomService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IBrowserViewKeyDownEvent, IBrowserViewNavigationEvent, IBrowserViewLoadError, IBrowserViewCertificateError, BrowserNewPageLocation, browserZoomFactors, browserZoomLabel, browserZoomAccessibilityLabel } from '../../../../platform/browserView/common/browserView.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { isMacintosh, isLinux } from '../../../../base/common/platform.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { BrowserOverlayManager, BrowserOverlayType, IBrowserOverlayInfo } from './overlayManager.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../base/common/async.js';
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
import { SiteInfoWidget } from './siteInfoWidget.js';
import { IChatRequestVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { IElementAncestor, IElementData, IBrowserTargetLocator, getDisplayNameFromOuterHTML } from '../../../../platform/browserElements/common/browserElements.js';
import { logBrowserOpen } from '../../../../platform/browserView/common/browserViewTelemetry.js';
import { URI } from '../../../../base/common/uri.js';
import { ChatConfiguration } from '../../chat/common/constants.js';
import { Event } from '../../../../base/common/event.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';

export const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey<boolean>('browserCanGoBack', false, localize('browser.canGoBack', "Whether the browser can go back"));
export const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey<boolean>('browserCanGoForward', false, localize('browser.canGoForward', "Whether the browser can go forward"));
export const CONTEXT_BROWSER_FOCUSED = new RawContextKey<boolean>('browserFocused', true, localize('browser.editorFocused', "Whether the browser editor is focused"));
export const CONTEXT_BROWSER_STORAGE_SCOPE = new RawContextKey<string>('browserStorageScope', '', localize('browser.storageScope', "The storage scope of the current browser view"));
export const CONTEXT_BROWSER_HAS_URL = new RawContextKey<boolean>('browserHasUrl', false, localize('browser.hasUrl', "Whether the browser has a URL loaded"));
export const CONTEXT_BROWSER_HAS_ERROR = new RawContextKey<boolean>('browserHasError', false, localize('browser.hasError', "Whether the browser has a load error"));
export const CONTEXT_BROWSER_DEVTOOLS_OPEN = new RawContextKey<boolean>('browserDevToolsOpen', false, localize('browser.devToolsOpen', "Whether developer tools are open for the current browser view"));
export const CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE = new RawContextKey<boolean>('browserElementSelectionActive', false, localize('browser.elementSelectionActive', "Whether element selection is currently active"));
export const CONTEXT_BROWSER_CAN_ZOOM_IN = new RawContextKey<boolean>('browserCanZoomIn', true, localize('browser.canZoomIn', "Whether the browser can zoom in further"));
export const CONTEXT_BROWSER_CAN_ZOOM_OUT = new RawContextKey<boolean>('browserCanZoomOut', true, localize('browser.canZoomOut', "Whether the browser can zoom out further"));

// Re-export find widget context keys for use in actions
export { CONTEXT_BROWSER_FIND_WIDGET_FOCUSED, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE };

const canShareBrowserWithAgentContext = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
	ContextKeyExpr.has(`config.workbench.browser.enableChatTools`),
)!;
function watchForAgentSharingContextChanges(contextKeyService: IContextKeyService): Event<unknown> {
	const agentSharingKeys = new Set(canShareBrowserWithAgentContext.keys());
	return Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(agentSharingKeys));
}

/**
 * Get the original implementation of HTMLElement focus (without window auto-focusing)
 * before it gets overridden by the workbench.
 */
const originalHtmlElementFocus = HTMLElement.prototype.focus;

/**
 * Transient zoom-level indicator that briefly appears inside the URL bar on zoom changes.
 * All DOM construction, state, and auto-hide logic are self-contained here.
 */
class BrowserZoomPill extends Disposable {
	readonly element: HTMLElement;
	private readonly _icon: HTMLElement;
	private readonly _label: HTMLElement;
	private readonly _timeout = this._register(new MutableDisposable());

	constructor() {
		super();
		this.element = $('.browser-zoom-pill');
		// Don't announce this transient element; the zoom level is announced via IAccessibilityService.status() in showZoomPill()
		this.element.setAttribute('aria-hidden', 'true');
		this._icon = $('span');
		this._label = $('span');
		this.element.appendChild(this._icon);
		this.element.appendChild(this._label);
	}

	/**
	 * Briefly show the zoom level, then auto-hide after 750 ms.
	 */
	show(zoomLabel: string, isAtOrAboveDefault: boolean): void {
		this._icon.className = ThemeIcon.asClassName(isAtOrAboveDefault ? Codicon.zoomIn : Codicon.zoomOut);
		this._label.textContent = zoomLabel;
		this.element.classList.add('visible');
		// Reset auto-hide timer so rapid zoom actions extend the display
		this._timeout.value = disposableTimeout(() => {
			this.element.classList.remove('visible');
		}, 750); // Chrome shows the zoom level for 1.5 seconds, but we show it for less because ours is non-interactive
	}
}

class BrowserNavigationBar extends Disposable {
	private readonly _urlInput: HTMLInputElement;
	private readonly _urlDisplay: HTMLElement;
	private readonly _shareButton: Button;
	private readonly _shareButtonContainer: HTMLElement;
	private readonly _siteInfoWidget: SiteInfoWidget;
	private readonly _zoomPill: BrowserZoomPill;

	constructor(
		editor: BrowserEditor,
		container: HTMLElement,
		instantiationService: IInstantiationService,
		scopedContextKeyService: IContextKeyService,
		configurationService: IConfigurationService
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

		// Share toggle button (inside URL bar, right side)
		this._shareButtonContainer = $('.browser-share-toggle-container');
		this._shareButton = this._register(new Button(this._shareButtonContainer, {
			supportIcons: true,
			title: localize('browser.shareWithAgent', "Share with Agent"),
			small: true,
			hoverDelegate
		}));
		this._shareButton.element.classList.add('browser-share-toggle');
		this._shareButton.label = '$(agent)';

		this._zoomPill = this._register(new BrowserZoomPill());

		urlContainer.appendChild(siteInfoContainer);
		urlContainer.appendChild(urlInputWrapper);
		urlContainer.appendChild(this._zoomPill.element);
		urlContainer.appendChild(this._shareButtonContainer);

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

		// Share toggle click handler
		this._register(this._shareButton.onDidClick(() => {
			editor.toggleShareWithAgent();
		}));

		// Show share button only when chat is enabled and browser tools are enabled
		const updateShareButtonVisibility = () => {
			this._shareButtonContainer.style.display = scopedContextKeyService.contextMatchesRules(canShareBrowserWithAgentContext) ? '' : 'none';
		};
		updateShareButtonVisibility();
		this._register(watchForAgentSharingContextChanges(scopedContextKeyService)(() => {
			updateShareButtonVisibility();
		}));
	}

	/**
	 * Update the share toggle visual state
	 */
	setShared(isShared: boolean): void {
		this._shareButton.checked = isShared;
		this._shareButton.label = isShared
			? localize('browser.sharingWithAgent', "Sharing with Agent") + ' $(agent)'
			: '$(agent)';
		this._shareButton.setTitle(isShared
			? localize('browser.unshareWithAgent', "Stop Sharing with Agent")
			: localize('browser.shareWithAgent', "Share with Agent"));
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
	 * Briefly show the zoom level indicator pill, then auto-hide.
	 */
	showZoomLevel(zoomLabel: string, isAtOrAboveDefault: boolean): void {
		this._zoomPill.show(zoomLabel, isAtOrAboveDefault);
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
	private _overlayVisible = false;
	private _editorVisible = false;
	private _currentKeyDownEvent: IBrowserViewKeyDownEvent | undefined;

	private _navigationBar!: BrowserNavigationBar;
	private _browserContainerWrapper!: HTMLElement;
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
	private _hasUrlContext!: IContextKey<boolean>;
	private _hasErrorContext!: IContextKey<boolean>;
	private _devToolsOpenContext!: IContextKey<boolean>;
	private _elementSelectionActiveContext!: IContextKey<boolean>;
	private _canZoomInContext!: IContextKey<boolean>;
	private _canZoomOutContext!: IContextKey<boolean>;

	private _model: IBrowserViewModel | undefined;
	private readonly _inputDisposables = this._register(new DisposableStore());
	private overlayManager: BrowserOverlayManager | undefined;
	private _elementSelectionCts: CancellationTokenSource | undefined;
	private _consoleSessionCts: CancellationTokenSource | undefined;
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
		@IBrowserElementsService private readonly browserElementsService: IBrowserElementsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IBrowserZoomService private readonly browserZoomService: IBrowserZoomService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
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
		this._elementSelectionActiveContext = CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE.bindTo(contextKeyService);
		this._canZoomInContext = CONTEXT_BROWSER_CAN_ZOOM_IN.bindTo(contextKeyService);
		this._canZoomOutContext = CONTEXT_BROWSER_CAN_ZOOM_OUT.bindTo(contextKeyService);

		// Currently this is always true since it is scoped to the editor container
		CONTEXT_BROWSER_FOCUSED.bindTo(contextKeyService);

		// Create root container
		const root = $('.browser-root');
		parent.appendChild(root);

		// Create toolbar with navigation buttons and URL input
		const toolbar = $('.browser-toolbar');

		// Create navigation bar widget with scoped context
		this._navigationBar = this._register(new BrowserNavigationBar(this, toolbar, this.instantiationService, contextKeyService, this.configurationService));

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

	override async setInput(input: BrowserEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		this._inputDisposables.clear();

		// Resolve the browser view model from the input
		const model = await input.resolve();
		this._model = model;
		if (token.isCancellationRequested || this.input !== input) {
			return;
		}

		this._storageScopeContext.set(this._model.storageScope);
		this._devToolsOpenContext.set(this._model.isDevToolsOpen);
		this.updateZoomContext();
		this._updateSharingState(true);

		// Update find widget with new model
		this._findWidget.rawValue?.setModel(this._model);

		// Clean up on input disposal
		this._inputDisposables.add(input.onWillDispose(() => {
			this._model = undefined;
		}));

		// Listen for sharing state changes on the model
		this._inputDisposables.add(this._model.onDidChangeSharedWithAgent(() => {
			this._updateSharingState(false);
		}));
		this._inputDisposables.add(watchForAgentSharingContextChanges(this.contextKeyService)(() => {
			this._updateSharingState(false);
		}));

		this._inputDisposables.add(this._model.onDidChangeZoom(() => {
			this.updateZoomContext();
		}));

		// Initialize UI state and context keys from model
		this.updateNavigationState({
			url: this._model.url,
			title: this._model.title,
			canGoBack: this._model.canGoBack,
			canGoForward: this._model.canGoForward,
			certificateError: this._model.certificateError
		});
		this.setBackgroundImage(this._model.screenshot);

		if (!options?.preserveFocus) {
			setTimeout(() => {
				if (this._model === model) {
					if (this._model.url) {
						this._browserContainer.focus();
					} else {
						this.focusUrlInput();
					}
				}
			}, 0);
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

			// Ensure a console session is active while a page URL is loaded.
			if (navEvent.url) {
				this.startConsoleSession();
			} else {
				this.stopConsoleSession();
			}
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

		// Start console log capture session if a URL is loaded
		if (this._model.url) {
			this.startConsoleSession();
		}
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

	private _updateSharingState(isInitialState: boolean): void {
		const sharingEnabled = this.contextKeyService.contextMatchesRules(canShareBrowserWithAgentContext);
		const isShared = sharingEnabled && !!this._model && this._model.sharedWithAgent;

		this._browserContainer.classList.toggle('animate', !isInitialState);
		this._browserContainer.classList.toggle('shared', isShared);
		this._navigationBar.setShared(isShared);
	}

	toggleShareWithAgent(): void {
		if (!this._model) {
			return;
		}
		this._model.setSharedWithAgent(!this._model.sharedWithAgent);
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

	async zoomIn(): Promise<void> {
		await this._model?.zoomIn();
		this.showZoomPill();
	}

	async zoomOut(): Promise<void> {
		await this._model?.zoomOut();
		this.showZoomPill();
	}

	async resetZoom(): Promise<void> {
		await this._model?.resetZoom();
		this.showZoomPill();
	}

	private showZoomPill(): void {
		if (!this._model) {
			return;
		}
		const defaultIndex = this.browserZoomService.getEffectiveZoomIndex(undefined, false);
		const defaultFactor = browserZoomFactors[defaultIndex];
		const currentFactor = this._model.zoomFactor;
		const label = browserZoomLabel(currentFactor);
		this._navigationBar.showZoomLevel(label, currentFactor >= defaultFactor);
		// Announce the new zoom level to screen readers (polite, non-interruptive).
		this.accessibilityService.status(browserZoomAccessibilityLabel(currentFactor));
	}

	private updateZoomContext(): void {
		if (this._model) {
			this._canZoomInContext.set(this._model.canZoomIn);
			this._canZoomOutContext.set(this._model.canZoomOut);
		}
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

			const { attachCss, attachImages } = await this.attachElementDataToChat(elementData);

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
	 * Grab the current console logs from the active console session and attach them to chat.
	 */
	async addConsoleLogsToChat(): Promise<void> {
		const resourceUri = this.input?.resource;
		if (!resourceUri) {
			return;
		}

		const locator: IBrowserTargetLocator = { browserViewId: BrowserViewUri.getId(resourceUri) };

		try {
			const logs = await this.browserElementsService.getConsoleLogs(locator);
			if (!logs) {
				return;
			}

			const toAttach: IChatRequestVariableEntry[] = [];
			toAttach.push({
				id: 'console-logs-' + Date.now(),
				name: localize('consoleLogs', 'Console Logs'),
				fullName: localize('consoleLogs', 'Console Logs'),
				value: logs,
				modelDescription: 'Console logs captured from Integrated Browser.',
				kind: 'element',
				icon: ThemeIcon.fromId(Codicon.terminal.id),
			});

			const widget = await this.chatWidgetService.revealWidget() ?? this.chatWidgetService.lastFocusedWidget;
			widget?.attachmentModel?.addContext(...toAttach);
		} catch (error) {
			this.logService.error('BrowserEditor.addConsoleLogsToChat: Failed to get console logs', error);
		}
	}

	/**
	 * Start a console session to capture logs from the browser view.
	 */
	private startConsoleSession(): void {
		// Don't restart if already running
		if (this._consoleSessionCts) {
			return;
		}

		const resourceUri = this.input?.resource;
		if (!resourceUri || !this._model?.url) {
			return;
		}

		const cts = new CancellationTokenSource();
		this._consoleSessionCts = cts;
		const locator: IBrowserTargetLocator = { browserViewId: BrowserViewUri.getId(resourceUri) };

		this.browserElementsService.startConsoleSession(cts.token, locator).catch(error => {
			if (!cts.token.isCancellationRequested) {
				this.logService.error('BrowserEditor: Failed to start console session', error);
			}
		});
	}

	/**
	 * Stop the active console session.
	 */
	private stopConsoleSession(): void {
		if (this._consoleSessionCts) {
			this._consoleSessionCts.dispose(true);
			this._consoleSessionCts = undefined;
		}
	}

	private createElementContextValue(elementData: IElementData, displayName: string, attachCss: boolean): string {
		const sections: string[] = [];
		sections.push('Attached Element Context from Integrated Browser');
		sections.push(`Element: ${displayName}`);

		const htmlPath = this.formatElementPath(elementData.ancestors);
		if (htmlPath) {
			sections.push(`HTML Path:\n${htmlPath}`);
		}

		const attributeTable = this.formatElementMap(elementData.attributes);
		if (attributeTable) {
			sections.push(`Attributes:\n${attributeTable}`);
		}

		if (attachCss) {
			const computedStyleTable = this.formatElementMap(elementData.computedStyles);
			if (computedStyleTable) {
				sections.push(`Computed Styles:\n${computedStyleTable}`);
			}
		}

		if (elementData.dimensions) {
			const { top, left, width, height } = elementData.dimensions;
			sections.push(
				`Dimensions:\n- top: ${Math.round(top)}px\n- left: ${Math.round(left)}px\n- width: ${Math.round(width)}px\n- height: ${Math.round(height)}px`
			);
		}

		const innerText = elementData.innerText?.trim();
		if (innerText) {
			sections.push(`Inner Text:\n\`\`\`text\n${innerText}\n\`\`\``);
		}

		sections.push(`Outer HTML:\n\`\`\`html\n${elementData.outerHTML}\n\`\`\``);

		if (attachCss) {
			sections.push(`Full Computed CSS:\n\`\`\`css\n${elementData.computedStyle}\n\`\`\``);
		}

		return sections.join('\n\n');
	}

	private async attachElementDataToChat(elementData: IElementData): Promise<{ attachCss: boolean; attachImages: boolean }> {
		const bounds = elementData.bounds;
		const toAttach: IChatRequestVariableEntry[] = [];

		const displayName = getDisplayNameFromOuterHTML(elementData.outerHTML);
		const attachCss = this.configurationService.getValue<boolean>('chat.sendElementsToChat.attachCSS');
		const value = this.createElementContextValue(elementData, displayName, attachCss);

		toAttach.push({
			id: 'element-' + Date.now(),
			name: displayName,
			fullName: displayName,
			value: value,
			modelDescription: attachCss
				? 'Structured browser element context with HTML path, attributes, and computed styles.'
				: 'Structured browser element context with HTML path and attributes.',
			kind: 'element',
			icon: ThemeIcon.fromId(Codicon.layout.id),
			ancestors: elementData.ancestors,
			attributes: elementData.attributes,
			computedStyles: attachCss ? elementData.computedStyles : undefined,
			dimensions: elementData.dimensions,
			innerText: elementData.innerText,
		});

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

		const widget = await this.chatWidgetService.revealWidget() ?? this.chatWidgetService.lastFocusedWidget;
		widget?.attachmentModel?.addContext(...toAttach);

		return { attachCss, attachImages };
	}

	private formatElementPath(ancestors: readonly IElementAncestor[] | undefined): string | undefined {
		if (!ancestors || ancestors.length === 0) {
			return undefined;
		}

		return ancestors
			.map(ancestor => {
				const classes = ancestor.classNames?.length ? `.${ancestor.classNames.join('.')}` : '';
				const id = ancestor.id ? `#${ancestor.id}` : '';
				return `${ancestor.tagName}${id}${classes}`;
			})
			.join(' > ');
	}

	private formatElementMap(entries: Readonly<Record<string, string>> | undefined): string | undefined {
		if (!entries || Object.keys(entries).length === 0) {
			return undefined;
		}

		const normalizedEntries = new Map(Object.entries(entries));
		const lines: string[] = [];

		const marginShorthand = this.createBoxShorthand(normalizedEntries, 'margin');
		if (marginShorthand) {
			lines.push(`- margin: ${marginShorthand}`);
		}

		const paddingShorthand = this.createBoxShorthand(normalizedEntries, 'padding');
		if (paddingShorthand) {
			lines.push(`- padding: ${paddingShorthand}`);
		}

		for (const [name, value] of Array.from(normalizedEntries.entries()).sort(([a], [b]) => a.localeCompare(b))) {
			lines.push(`- ${name}: ${value}`);
		}

		return lines.join('\n');
	}

	private createBoxShorthand(entries: Map<string, string>, propertyName: 'margin' | 'padding'): string | undefined {
		const topKey = `${propertyName}-top`;
		const rightKey = `${propertyName}-right`;
		const bottomKey = `${propertyName}-bottom`;
		const leftKey = `${propertyName}-left`;

		const top = entries.get(topKey);
		const right = entries.get(rightKey);
		const bottom = entries.get(bottomKey);
		const left = entries.get(leftKey);

		if (top === undefined || right === undefined || bottom === undefined || left === undefined) {
			return undefined;
		}

		entries.delete(topKey);
		entries.delete(rightKey);
		entries.delete(bottomKey);
		entries.delete(leftKey);

		return `${top} ${right} ${bottom} ${left}`;
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
			const isEnterKey =
				keyEvent.code === 'Enter' ||
				keyEvent.code === 'NumpadEnter' ||
				keyEvent.key === 'Enter' ||
				keyEvent.key === 'Return';
			if (this._elementSelectionCts && isEnterKey) {
				const cts = this._elementSelectionCts;
				const resourceUri = this.input?.resource;
				if (!resourceUri) {
					return;
				}

				const locator: IBrowserTargetLocator = { browserViewId: BrowserViewUri.getId(resourceUri) };
				const { width, height } = this._browserContainer.getBoundingClientRect();
				const elementData = await this.browserElementsService.getFocusedElementData({ x: 0, y: 0, width, height }, cts.token, locator);
				if (!elementData) {
					return;
				}

				await this.attachElementDataToChat(elementData);
				cts.dispose();
				if (this._elementSelectionCts === cts) {
					this._elementSelectionCts = undefined;
					this._elementSelectionActiveContext.set(false);
				}
				return;
			}

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

		// Cancel any active element selection
		if (this._elementSelectionCts) {
			this._elementSelectionCts.dispose(true);
			this._elementSelectionCts = undefined;
		}

		// Cancel any active console session
		this.stopConsoleSession();

		// Cancel any scheduled screenshots
		this.cancelScheduledScreenshot();

		// Clear find widget model
		this._findWidget.rawValue?.setModel(undefined);
		this._findWidget.rawValue?.hide();

		void this._model?.setVisible(false);
		this._model = undefined;

		this._canGoBackContext.reset();
		this._canGoForwardContext.reset();
		this._hasUrlContext.reset();
		this._hasErrorContext.reset();
		this._storageScopeContext.reset();
		this._devToolsOpenContext.reset();
		this._elementSelectionActiveContext.reset();
		this._canZoomInContext.reset();
		this._canZoomOutContext.reset();

		this._navigationBar.clear();
		this.setBackgroundImage(undefined);

		super.clearInput();
	}
}
