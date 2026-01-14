/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, disposableWindowInterval, EventType, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { RawContextKey, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { BrowserEditorInput } from './browserEditorInput.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IBrowserViewModel } from '../../browserView/common/browserView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IBrowserViewKeyDownEvent, IBrowserViewNavigationEvent, IBrowserViewLoadError } from '../../../../platform/browserView/common/browserView.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { BrowserOverlayManager } from './overlayManager.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IBrowserElementsService } from '../../../services/browserElements/browser/browserElementsService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { IChatRequestVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { IBrowserTargetLocator, getDisplayNameFromOuterHTML } from '../../../../platform/browserElements/common/browserElements.js';

export const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey<boolean>('browserCanGoBack', false, localize('browser.canGoBack', "Whether the browser can go back"));
export const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey<boolean>('browserCanGoForward', false, localize('browser.canGoForward', "Whether the browser can go forward"));
export const CONTEXT_BROWSER_FOCUSED = new RawContextKey<boolean>('browserFocused', true, localize('browser.editorFocused', "Whether the browser editor is focused"));
export const CONTEXT_BROWSER_STORAGE_SCOPE = new RawContextKey<string>('browserStorageScope', '', localize('browser.storageScope', "The storage scope of the current browser view"));
export const CONTEXT_BROWSER_DEVTOOLS_OPEN = new RawContextKey<boolean>('browserDevToolsOpen', false, localize('browser.devToolsOpen', "Whether developer tools are open for the current browser view"));
export const CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE = new RawContextKey<boolean>('browserElementSelectionActive', false, localize('browser.elementSelectionActive', "Whether element selection is currently active"));

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
				toolbarOptions: { primaryGroup: 'actions' },
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
	private _errorContainer!: HTMLElement;
	private _canGoBackContext!: IContextKey<boolean>;
	private _canGoForwardContext!: IContextKey<boolean>;
	private _storageScopeContext!: IContextKey<string>;
	private _devToolsOpenContext!: IContextKey<boolean>;
	private _elementSelectionActiveContext!: IContextKey<boolean>;

	private _model: IBrowserViewModel | undefined;
	private readonly _inputDisposables = this._register(new DisposableStore());
	private overlayManager: BrowserOverlayManager | undefined;
	private _elementSelectionCts: CancellationTokenSource | undefined;

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

		// Create browser container (stub element for positioning)
		this._browserContainer = $('.browser-container');
		this._browserContainer.tabIndex = 0; // make focusable
		root.appendChild(this._browserContainer);

		// Create error container (hidden by default)
		this._errorContainer = $('.browser-error-container');
		this._errorContainer.style.display = 'none';
		this._browserContainer.appendChild(this._errorContainer);

		this._register(addDisposableListener(this._browserContainer, EventType.FOCUS, (event) => {
			// When the browser container gets focus, make sure the browser view also gets focused.
			// But only if focus was already in the workbench (and not e.g. clicking back into the workbench from the browser view).
			if (event.relatedTarget && this._model && this.shouldShowView) {
				void this._model.focus();
			}
		}));

		this._register(addDisposableListener(this._browserContainer, EventType.BLUR, () => {
			// When focus goes to another part of the workbench, make sure the workbench view becomes focused.
			const focused = this.window.document.activeElement;
			if (focused && focused !== this._browserContainer) {
				this.window.focus();
			}
		}));
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
			this._navigationBar.focusUrlInput();
		}

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
			// When the view gets focused, make sure the container also has focus.
			if (focused) {
				this._browserContainer.focus();
			}
		}));

		this._inputDisposables.add(this._model.onDidChangeDevToolsState(e => {
			this._devToolsOpenContext.set(e.isDevToolsOpen);
		}));

		this._inputDisposables.add(this._model.onDidRequestNewPage(({ url, name, background }) => {
			type IntegratedBrowserNewPageRequestEvent = {
				background: boolean;
			};

			type IntegratedBrowserNewPageRequestClassification = {
				background: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether page was requested to open in background' };
				owner: 'kycutler';
				comment: 'Tracks new page requests from integrated browser';
			};

			this.telemetryService.publicLog2<IntegratedBrowserNewPageRequestEvent, IntegratedBrowserNewPageRequestClassification>(
				'integratedBrowser.newPageRequest',
				{
					background
				}
			);

			// Open a new browser tab for the requested URL
			const browserUri = BrowserViewUri.forUrl(url, name ? `${input.id}-${name}` : undefined);
			this.editorService.openEditor({
				resource: browserUri,
				options: {
					pinned: true,
					inactive: background
				}
			}, this.group);
		}));

		this._inputDisposables.add(this.overlayManager!.onDidChangeOverlayState(() => {
			this.checkOverlays();
		}));

		// Listen for zoom level changes and update browser view zoom factor
		this._inputDisposables.add(onDidChangeZoomLevel(targetWindowId => {
			if (targetWindowId === this.window.vscodeWindowId) {
				this.layout();
			}
		}));
		// Capture screenshot periodically (once per second) to keep background updated
		this._inputDisposables.add(disposableWindowInterval(
			this.window,
			() => this.capturePlaceholderSnapshot(),
			1000
		));

		this.updateErrorDisplay();
		this.layout();
		await this._model.setVisible(this.shouldShowView);

		// Sometimes the element has not been inserted into the DOM yet. Ensure layout after next animation frame.
		scheduleAtNextAnimationFrame(this.window, () => this.layout());
	}

	protected override setEditorVisible(visible: boolean): void {
		this._editorVisible = visible;
		this.updateVisibility();
	}

	private updateVisibility(): void {
		if (this._model) {
			// Blur the background image if the view is hidden due to an overlay.
			this._browserContainer.classList.toggle('blur', this._editorVisible && this._overlayVisible && !this._model?.error);
			void this._model.setVisible(this.shouldShowView);
		}
	}

	private get shouldShowView(): boolean {
		return this._editorVisible && !this._overlayVisible && !this._model?.error;
	}

	private checkOverlays(): void {
		if (!this.overlayManager) {
			return;
		}
		const hasOverlappingOverlay = this.overlayManager.isOverlappingWithOverlays(this._browserContainer);
		if (hasOverlappingOverlay !== this._overlayVisible) {
			this._overlayVisible = hasOverlappingOverlay;
			this.updateVisibility();
		}
	}

	private updateErrorDisplay(): void {
		if (!this._model) {
			return;
		}

		const error: IBrowserViewLoadError | undefined = this._model.error;
		if (error) {
			// Show error display
			this._errorContainer.style.display = 'flex';

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
			// Hide error display
			this._errorContainer.style.display = 'none';
			this.setBackgroundImage(this._model.screenshot);
		}

		this.updateVisibility();
	}

	async navigateToUrl(url: string): Promise<void> {
		if (this._model) {
			this.group.pinEditor(this.input); // pin editor on navigation

			const scheme = URL.parse(url)?.protocol;
			if (!scheme) {
				// If no scheme provided, default to http (to support localhost etc -- sites will generally upgrade to https)
				url = 'http://' + url;
			}

			await this._model.loadURL(url);
		}
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

		try {
			// Get the resource URI for this editor
			const resourceUri = this.input?.resource;
			if (!resourceUri) {
				throw new Error('No resource URI found');
			}

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
			if (this.configurationService.getValue('chat.sendElementsToChat.attachImages') && this._model) {
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
	}

	private setBackgroundImage(buffer: VSBuffer | undefined): void {
		if (buffer) {
			const dataUrl = `data:image/jpeg;base64,${encodeBase64(buffer)}`;
			this._browserContainer.style.backgroundImage = `url('${dataUrl}')`;
		} else {
			this._browserContainer.style.backgroundImage = '';
		}
	}

	/**
	 * Capture a screenshot of the current browser view to use as placeholder background
	 */
	private async capturePlaceholderSnapshot(): Promise<void> {
		if (this._model && !this._overlayVisible) {
			try {
				const buffer = await this._model.captureScreenshot({ quality: 80 });
				this.setBackgroundImage(buffer);
			} catch (error) {
				this.logService.error('BrowserEditor.capturePlaceholderSnapshot: Failed to capture screenshot', error);
			}
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

	override layout(): void {
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
