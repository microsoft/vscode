/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, Dimension, EventType, IDomPosition } from '../../../../base/browser/dom.js';
import { ButtonBar } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { RawContextKey, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, IConstructorSignature, BrandedService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';
import { IBrowserViewModel } from '../../browserView/common/browserView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IBrowserViewNavigationEvent, IBrowserViewLoadError, IBrowserViewCertificateError } from '../../../../platform/browserView/common/browserView.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { isMacintosh, isLinux } from '../../../../base/common/platform.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { SiteInfoWidget } from './siteInfoWidget.js';
import { Emitter } from '../../../../base/common/event.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';

export const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey<boolean>('browserCanGoBack', false, localize('browser.canGoBack', "Whether the browser can go back"));
export const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey<boolean>('browserCanGoForward', false, localize('browser.canGoForward', "Whether the browser can go forward"));
export const CONTEXT_BROWSER_FOCUSED = new RawContextKey<boolean>('browserFocused', true, localize('browser.editorFocused', "Whether the browser editor is focused"));
export const CONTEXT_BROWSER_HAS_URL = new RawContextKey<boolean>('browserHasUrl', false, localize('browser.hasUrl', "Whether the browser has a URL loaded"));
export const CONTEXT_BROWSER_HAS_ERROR = new RawContextKey<boolean>('browserHasError', false, localize('browser.hasError', "Whether the browser has a load error"));

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
		this._register(editor.onDidChangeModel(({ model, isNew }) => {
			this._modelStore.clear();
			if (model) {
				this.subscribeToModel(model, this._modelStore, isNew);
			} else {
				this.clear();
			}
		}));
	}

	/**
	 * Called whenever the editor model changes to update state.
	 */
	protected subscribeToModel(_model: IBrowserViewModel, _store: DisposableStore, _isNew: boolean): void { }

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

	/**
	 * Optional toolbar-like elements to insert into the editor root between the navbar and the
	 * browser container.  Contributions can override this getter to provide elements.
	 */
	get toolbarElements(): readonly HTMLElement[] { return []; }

	/**
	 * Called when the editor is laid out with a new dimension.
	 */
	layout(_width: number): void { }

	/**
	 * Called when the editor pane's visibility changes (e.g. tab switched).
	 * Contributions that drive page rendering use this to pause/resume work.
	 */
	setEditorVisible(_visible: boolean): void { }

	/**
	 * Called when the editor wants focus to land on the page content. Most
	 * contributions ignore this; the renderer-providing contribution typically
	 * forwards focus to the underlying page.
	 */
	focusPage(): void { }

	/**
	 * Called once after the editor's browser container DOM has been created.
	 * Use to do setup that needs to attach to `editor.browserContainer`.
	 */
	onContainerReady(_container: HTMLElement): void { }

	/**
	 * Optional contributions to how the browser container is sized and
	 * positioned within the editor's wrapper. Multiple contributions are
	 * supported: padding is taken as the max across all contributors (so each
	 * contributor's reservation is honoured without double-counting);
	 * `compute` callbacks are chained in priority order (lower {@link
	 * IContainerLayoutOverride.priority} runs first), each receiving the
	 * previous result so contributions can stack (e.g. device emulation sizes
	 * and centers the viewport, then pixel-snap aligns it).
	 */
	getContainerLayoutOverride(): IContainerLayoutOverride | undefined { return undefined; }

	/**
	 * Content elements to mount inside the browser container's placeholder
	 * area (welcome screen, error page, overlay-pause message, etc.). The
	 * editor stacks them in {@link IBrowserContainerContent.order} order;
	 * each content manages its own visibility.
	 */
	get containerContents(): readonly IBrowserContainerContent[] { return []; }
}

/** Customization returned by {@link BrowserEditorContribution.getContainerLayoutOverride}. */
export interface IContainerLayoutOverride {
	/**
	 * Wrapper padding (CSS px) reserved by this contribution — e.g. for
	 * widgets that sit outside the container (resize sashes), or a baseline
	 * visual margin. The editor takes the per-side max across all
	 * contributors and subtracts the result from the wrapper before passing
	 * `paneWidth`/`paneHeight` to {@link compute}. Default 0 per side.
	 */
	readonly padding?: {
		top?: number;
		right?: number;
		bottom?: number;
		left?: number;
	};
	/**
	 * Transform the layout. Called in priority order (lower runs first); each
	 * call receives the result of the previous compute plus the available
	 * pane size (wrapper minus aggregated padding) for reference. The initial
	 * input is `{ width: paneWidth, height: paneHeight, top: 0, left: 0 }`
	 * with no emulation — `top`/`left` are local coordinates relative to the
	 * top-left of the available area. Returning `undefined` leaves the
	 * current layout unchanged.
	 */
	readonly compute?: (current: IContainerLayout, paneWidth: number, paneHeight: number) => IContainerLayout | undefined;
	/**
	 * Priority for {@link compute}. Lower numbers run earlier so later
	 * contributions can refine the result (e.g. emulation runs at priority 0
	 * to size/position the viewport; pixel-snap runs at priority 1000 to
	 * align). Default 0.
	 */
	readonly priority?: number;
}

export interface IContainerLayout {
	readonly width: number;
	readonly height: number;
	/** Local position within the wrapper (CSS px). Defaults to 0. */
	readonly top?: number;
	readonly left?: number;
	readonly emulation?: {
		readonly scale: number;
	};
}

/** A widget that can be contributed to the browser editor URL bar. */
export interface IBrowserEditorWidgetContribution {
	readonly element: HTMLElement;
	/** Ordering value — lower numbers appear first (left). */
	readonly order: number;
}

/**
 * Content that sits inside the browser container's placeholder area (welcome
 * screen, error page, overlay-pause message, etc.). Each content owns its own
 * visibility — the editor only stacks elements by {@link order}.
 */
export interface IBrowserContainerContent {
	readonly element: HTMLElement;
	/** Stacking order — lower numbers are farther back (rendered first). */
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
	private readonly _onDidChangeModel = this._register(new Emitter<{
		model: IBrowserViewModel | undefined;
		isNew: boolean;
	}>());
	readonly onDidChangeModel = this._onDidChangeModel.event;

	// -- State ----------------------------------------------------------

	private _navigationBar!: BrowserNavigationBar;
	private _browserContainerWrapper!: HTMLElement;
	private _browserContainer!: HTMLElement;
	get browserContainer(): HTMLElement { return this._browserContainer; }
	private _errorContainer!: HTMLElement;
	private _welcomeContainer!: HTMLElement;
	private _canGoBackContext!: IContextKey<boolean>;
	private _canGoForwardContext!: IContextKey<boolean>;
	private _hasUrlContext!: IContextKey<boolean>;
	private _hasErrorContext!: IContextKey<boolean>;

	private readonly _inputDisposables = this._register(new DisposableStore());
	private readonly _certActionButton = this._register(new MutableDisposable<ButtonBar>());
	private _currentPadding: { top: number; right: number; bottom: number; left: number } = { top: 0, right: 0, bottom: 0, left: 0 };

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILayoutService private readonly layoutService: ILayoutService,
	) {
		super(BrowserEditorInput.EDITOR_ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		// Create scoped context key service for this editor instance
		const contextKeyService = this._register(this.contextKeyService.createScoped(parent));

		// Bind navigation capability context keys
		this._canGoBackContext = CONTEXT_BROWSER_CAN_GO_BACK.bindTo(contextKeyService);
		this._canGoForwardContext = CONTEXT_BROWSER_CAN_GO_FORWARD.bindTo(contextKeyService);
		this._hasUrlContext = CONTEXT_BROWSER_HAS_URL.bindTo(contextKeyService);
		this._hasErrorContext = CONTEXT_BROWSER_HAS_ERROR.bindTo(contextKeyService);

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
		root.tabIndex = -1; // Click focusable (for kb shortcuts), but not in tab order
		parent.appendChild(root);

		// Create navbar with navigation buttons and URL input
		const navbar = $('.browser-navbar');

		// Create navigation bar widget with scoped context
		this._navigationBar = this._register(new BrowserNavigationBar(this, navbar, this.instantiationService, contextKeyService));

		// Inject URL bar widgets from contributions
		const allWidgets: IBrowserEditorWidgetContribution[] = [];
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

		// Notify contributions that the container DOM is ready.
		for (const contribution of this._contributionInstances.values()) {
			contribution.onContainerReady(this._browserContainer);
		}

		// Wrapper around placeholder contents for border radius clipping. Holds
		// contribution-provided content (placeholder screenshot, overlay-pause)
		// plus the editor-owned error and welcome layers.
		const placeholderContents = $('.browser-placeholder-contents');
		this._browserContainer.appendChild(placeholderContents);

		// Collect and stack container contents from contributions.
		const contents: IBrowserContainerContent[] = [];
		for (const contribution of this._contributionInstances.values()) {
			contents.push(...contribution.containerContents);
		}
		contents.sort((a, b) => a.order - b.order);
		for (const content of contents) {
			placeholderContents.appendChild(content.element);
		}

		// Create error container (hidden by default)
		this._errorContainer = $('.browser-error-container');
		this._errorContainer.style.display = 'none';
		placeholderContents.appendChild(this._errorContainer);

		// Create welcome container (shown when no URL is loaded)
		this._welcomeContainer = this.createWelcomeContainer();
		placeholderContents.appendChild(this._welcomeContainer);
	}

	override focus(): void {
		if (this._model?.url && !this._model.error) {
			for (const c of this._contributionInstances.values()) {
				c.focusPage();
			}
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

		let model = input.model;
		const isNew = !model;
		if (!model) {
			// Set initial navigation state from the input so that the UI is populated while the model is loading.
			this.updateNavigationState({
				url: input.url || '',
				title: input.title || '',
				canGoBack: false,
				canGoForward: false,
				certificateError: undefined
			});

			// Resolve the browser view model from the input
			model = await input.resolve();
		}

		if (token.isCancellationRequested || this.input !== input) {
			return;
		}

		this._model = model;
		this._onDidChangeModel.fire({ model, isNew });

		// Initialize UI state and context keys from model
		this.updateNavigationState({
			url: this._model.url,
			title: this._model.title,
			canGoBack: this._model.canGoBack,
			canGoForward: this._model.canGoForward,
			certificateError: this._model.certificateError
		});

		// When closing a tab, the model gets disposed before the editor input is cleared.
		// So we make sure we don't keep a reference to the disposed model.
		this._inputDisposables.add(this._model.onWillDispose(() => {
			this._model = undefined;
		}));

		this._inputDisposables.add(this._model.onDidNavigate((navEvent: IBrowserViewNavigationEvent) => {
			this.group.pinEditor(this.input); // pin editor on navigation

			// Update navigation bar and context keys from model
			this.updateNavigationState(navEvent);
		}));

		this._inputDisposables.add(this._model.onDidChangeLoadingState(() => {
			this.updateErrorDisplay();
		}));

		// Listen for workbench zoom level changes and update browser view placeholder screenshot's zoom factor
		this._inputDisposables.add(onDidChangeZoomLevel(targetWindowId => {
			if (targetWindowId === this.window.vscodeWindowId) {
				// Update CSS variable for size calculations
				this._browserContainerWrapper.style.setProperty('--zoom-factor', String(getZoomFactor(this.window)));
				// Re-push container bounds and emulation: zoom-factor affects
				// both the screen-px conversion in main and the Chromium
				// emulation scale (so the emulated viewport fills the WCV).
				this.layoutBrowserContainer();
			}
		}));

		this.updateErrorDisplay();
		this.layout();
		this.updateVisibility();
	}

	protected override setEditorVisible(visible: boolean): void {
		for (const c of this._contributionInstances.values()) {
			c.setEditorVisible(visible);
		}
		this.updateVisibility();
	}

	/**
	 * Make the browser container the active element without moving focus from the browser view.
	 */
	ensureBrowserFocus(): void {
		originalHtmlElementFocus.call(this._browserContainer);
	}

	private updateVisibility(): void {
		// Welcome container: shown when no URL is loaded
		this._welcomeContainer.style.display = this._model?.url ? 'none' : '';

		// Error container: shown when there's a load error
		this._errorContainer.style.display = this._model?.error ? '' : 'none';
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

	override layout(dimension?: Dimension, _position?: IDomPosition): void {
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
		} else {
			this.layoutBrowserContainer();
		}
	}

	/**
	 * Recompute the layout of the browser container and push the resulting
	 * bounds + emulation to the renderer. Should generally only be called
	 * via {@link layout} so the container is fully styled first.
	 */
	layoutBrowserContainer(retries = 2): void {
		if (!this._model) {
			return;
		}

		const overrides: IContainerLayoutOverride[] = [];
		for (const c of this._contributionInstances.values()) {
			const o = c.getContainerLayoutOverride();
			if (o) {
				overrides.push(o);
			}
		}

		// Take the per-side max of padding contributions so each reservation is
		// honoured without double-counting overlapping widgets.
		const padding = { top: 0, right: 0, bottom: 0, left: 0 };
		for (const o of overrides) {
			padding.top = Math.max(padding.top, o.padding?.top ?? 0);
			padding.right = Math.max(padding.right, o.padding?.right ?? 0);
			padding.bottom = Math.max(padding.bottom, o.padding?.bottom ?? 0);
			padding.left = Math.max(padding.left, o.padding?.left ?? 0);
		}
		this._currentPadding = padding;

		const wrapperRect = this._browserContainerWrapper.getBoundingClientRect();
		if ((wrapperRect.width === 0 || wrapperRect.height === 0) && retries > 0) {
			// Wrapper not measured yet; retry on the next frame.
			this.window.requestAnimationFrame(() => this.layoutBrowserContainer(retries - 1));
			return;
		}

		// Chain compute callbacks in priority order over the area available
		// after padding. layout.top/left are local to the available area.
		const paneWidth = Math.max(0, wrapperRect.width - padding.left - padding.right);
		const paneHeight = Math.max(0, wrapperRect.height - padding.top - padding.bottom);
		const sorted = overrides.slice().sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
		let layout: IContainerLayout = { width: paneWidth, height: paneHeight, top: 0, left: 0 };
		for (const o of sorted) {
			const next = o.compute?.(layout, paneWidth, paneHeight);
			if (next) {
				layout = next;
			}
		}

		const left = padding.left + (layout.left ?? 0);
		const top = padding.top + (layout.top ?? 0);
		this._browserContainer.style.width = `${layout.width}px`;
		this._browserContainer.style.height = `${layout.height}px`;
		this._browserContainer.style.left = `${left}px`;
		this._browserContainer.style.top = `${top}px`;

		const cornerRadius = parseFloat(this.window.getComputedStyle(this._browserContainer).borderTopLeftRadius ?? '0');
		void this._model.layout({
			windowId: this.group.windowId,
			x: wrapperRect.left + left,
			y: wrapperRect.top + top,
			width: layout.width,
			height: layout.height,
			zoomFactor: getZoomFactor(this.window),
			cornerRadius,
			emulation: layout.emulation,
		});
	}

	/**
	 * Wrapper content-area size in CSS px — the area available to layout
	 * contributions after their aggregated padding is applied.
	 */
	get paneSize(): { width: number; height: number } {
		const r = this._browserContainerWrapper.getBoundingClientRect();
		const p = this._currentPadding;
		return {
			width: Math.max(0, r.width - p.left - p.right),
			height: Math.max(0, r.height - p.top - p.bottom),
		};
	}

	override clearInput(): void {
		this._inputDisposables.clear();

		this._model = undefined;
		this._onDidChangeModel.fire({ model: undefined, isNew: false });

		this._canGoBackContext.reset();
		this._canGoForwardContext.reset();
		this._hasUrlContext.reset();
		this._hasErrorContext.reset();

		this._navigationBar.clear();

		super.clearInput();
	}
}
