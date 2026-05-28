/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, Dimension, EventType, IDomPosition } from '../../../../base/browser/dom.js';
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
import { IBrowserViewNavigationEvent, IBrowserViewCertificateError } from '../../../../platform/browserView/common/browserView.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
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
 * Subclasses implement {@link onModelAttached} which is called whenever a new model is set.
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
				this.onModelAttached(model, this._modelStore, isNew);
			} else {
				this.onModelDetached();
			}
		}));
	}

	/**
	 * Called whenever the editor model changes to update state.
	 */
	protected onModelAttached(_model: IBrowserViewModel, _store: DisposableStore, _isNew: boolean): void { }

	/**
	 * Called when the model is cleared to reset state.
	 */
	onModelDetached(): void { }

	/**
	 * Widgets contributed by this feature. Each widget declares its target
	 * {@link BrowserWidgetLocation}; the editor groups widgets by location
	 * and stacks them in {@link IBrowserEditorWidget.order} order.
	 */
	get widgets(): readonly IBrowserEditorWidget[] { return []; }

	/**
	 * Optional renderers for the URL displayed in the navbar. Each renderer is
	 * given the URL and a container; the first to return `true` claims the
	 * render. If none claim it, the navbar falls back to plain text. Used to
	 * decorate URLs for special conditions (e.g. red strikethrough on the
	 * `https:` prefix when a certificate error is active).
	 */
	get urlRenderers(): readonly IBrowserUrlRenderer[] { return []; }

	/**
	 * Called when the editor is laid out with a new dimension.
	 */
	onPaneResized(_width: number): void { }

	/**
	 * Called after the browser container has been laid out and its bounds
	 * pushed to the model. Contributions can use this to react to position
	 * changes (e.g. recompute overlay overlap), unlike {@link onPaneResized} which
	 * only fires on pane dimension changes.
	 */
	afterContainerLayout(): void { }

	/**
	 * Called when the editor pane's visibility changes (e.g. tab switched).
	 * Contributions that drive page rendering use this to pause/resume work.
	 */
	onPaneVisibilityChanged(_visible: boolean): void { }

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
	onContainerCreated(_container: HTMLElement): void { }

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
	beforeContainerLayout(): IContainerLayoutOverride | undefined { return undefined; }
}

/** Customization returned by {@link BrowserEditorContribution.beforeContainerLayout}. */
export interface IContainerLayoutOverride {
	/**
	 * Wrapper padding (CSS px) reserved by this contribution — e.g. for
	 * widgets that sit outside the container (resize sashes), or a baseline
	 * visual margin. The editor takes the per-side max across all
	 * contributors and subtracts the result from the wrapper before passing
	 * the pane info to {@link compute}. Default 0 per side.
	 */
	readonly padding?: {
		top?: number;
		right?: number;
		bottom?: number;
		left?: number;
	};
	/**
	 * Transform the layout. Called in priority order (lower runs first); each
	 * call receives the result of the previous compute plus pane info
	 * (available size and the absolute screen origin of layout-space (0,0)).
	 * The initial input is `{ width: pane.width, height: pane.height, top: 0,
	 * left: 0 }` with no emulation — `top`/`left` are local coordinates
	 * relative to the top-left of the available area. The pane origin lets
	 * contributions reason about absolute pixel alignment (e.g. snap to
	 * physical pixels) and convert back to local coords. Returning
	 * `undefined` leaves the current layout unchanged.
	 */
	readonly compute?: (current: IContainerLayout, pane: IContainerLayoutPane) => IContainerLayout | undefined;
	/**
	 * Priority for {@link compute}. Lower numbers run earlier so later
	 * contributions can refine the result (e.g. emulation runs at priority 0
	 * to size/position the viewport; pixel-snap runs at priority 1000 to
	 * align). Default 0.
	 */
	readonly priority?: number;
}

/** Pane info passed to {@link IContainerLayoutOverride.compute}. */
export interface IContainerLayoutPane {
	/** Available width after aggregated padding is applied (CSS px). */
	readonly width: number;
	/** Available height after aggregated padding is applied (CSS px). */
	readonly height: number;
	/** Absolute screen x of layout-space (0, 0). */
	readonly originX: number;
	/** Absolute screen y of layout-space (0, 0). */
	readonly originY: number;
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

/** Where a contributed widget mounts within the browser editor. */
export const enum BrowserWidgetLocation {
	/** Inside the navbar, before the URL input (e.g. site/security indicators). */
	PreUrl = 'preUrl',
	/** Inside the navbar, after the URL input (e.g. zoom pill, share toggle). */
	PostUrl = 'postUrl',
	/** Between the navbar and the browser container (e.g. find / emulation toolbars). */
	Toolbar = 'toolbar',
	/** Inside the browser container (placeholder screenshot, error overlay, etc.). */
	ContentArea = 'contentArea',
}

/**
 * A widget contributed by a {@link BrowserEditorContribution}. The editor
 * groups widgets by {@link location} and mounts each group sorted by
 * {@link order}.
 */
export interface IBrowserEditorWidget {
	readonly location: BrowserWidgetLocation;
	readonly element: HTMLElement;
	/** Stacking order within the location. Lower numbers render first. */
	readonly order: number;
}

/**
 * Customizes how the URL is rendered into the navbar's URL display element.
 * The navbar iterates contributed renderers in registration order; the first
 * one to return `true` from {@link render} claims the render. If no renderer
 * claims it, the navbar falls back to plain text.
 */
export interface IBrowserUrlRenderer {
	/**
	 * Render the URL into the given (already-emptied) container. Return true if
	 * the URL was rendered; false to fall through to subsequent renderers.
	 */
	render(url: string, container: HTMLElement): boolean;
	/**
	 * Fires when {@link render} would produce a different result for the same
	 * URL (e.g. underlying state changed). The navbar re-renders on this.
	 */
	readonly onDidChange: Event<void>;
}

class BrowserNavigationBar extends Disposable {
	private readonly _urlInput: HTMLInputElement;
	private readonly _urlDisplay: HTMLElement;
	private readonly _preUrlWidgetsContainer: HTMLElement;
	private readonly _urlBarWidgetsContainer: HTMLElement;
	private readonly _urlRenderers: IBrowserUrlRenderer[] = [];

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

		// URL input container (wraps pre-url widgets + input + post-url widgets)
		const urlContainer = $('.browser-url-container');

		// Pre-URL widgets slot (e.g. site/security indicators contributed by features)
		this._preUrlWidgetsContainer = $('.browser-site-info-slot');

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

		urlContainer.appendChild(this._preUrlWidgetsContainer);
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
		this._renderUrl();
	}

	/**
	 * Focus the URL input and select all text
	 */
	focusUrlInput(): void {
		this._showInput();
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
	 * Add widget elements to the pre-URL slot (left of the URL input), sorted by order.
	 */
	addPreUrlWidgets(widgets: readonly IBrowserEditorWidget[]): void {
		const sorted = widgets.slice().sort((a, b) => a.order - b.order);
		for (const widget of sorted) {
			this._preUrlWidgetsContainer.appendChild(widget.element);
		}
	}

	/**
	 * Add widget elements to the post-URL slot (right of the URL input), sorted by order.
	 */
	addUrlBarWidgets(widgets: readonly IBrowserEditorWidget[]): void {
		const sorted = widgets.slice().sort((a, b) => a.order - b.order);
		for (const widget of sorted) {
			this._urlBarWidgetsContainer.appendChild(widget.element);
		}
	}

	/**
	 * Register URL renderers. The navbar re-renders when any renderer's
	 * `onDidChange` fires.
	 */
	addUrlRenderers(renderers: readonly IBrowserUrlRenderer[]): void {
		for (const renderer of renderers) {
			this._urlRenderers.push(renderer);
			this._register(renderer.onDidChange(() => this._renderUrl()));
		}
		this._renderUrl();
	}

	/**
	 * Switch to display mode: hide the input and show the styled display.
	 */
	private _showDisplay(): void {
		this._urlInput.style.display = 'none';
		this._urlDisplay.style.display = '';
		this._renderUrl();
	}

	/**
	 * Rebuild the display element's content. Tries each contributed URL renderer
	 * in order; falls back to plain text if none claims the URL.
	 */
	private _renderUrl(): void {
		const url = this._urlInput.value;

		this._urlDisplay.textContent = '';
		this._urlDisplay.classList.toggle('placeholder', !url);

		for (const renderer of this._urlRenderers) {
			if (renderer.render(url, this._urlDisplay)) {
				return;
			}
		}

		this._urlDisplay.textContent = url || localize('browser.urlPlaceholder', "Enter a URL");
	}

	clear(): void {
		this._urlInput.value = '';
		this._renderUrl();
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
	private _welcomeContainer!: HTMLElement;
	private _canGoBackContext!: IContextKey<boolean>;
	private _canGoForwardContext!: IContextKey<boolean>;
	private _hasUrlContext!: IContextKey<boolean>;

	private readonly _inputDisposables = this._register(new DisposableStore());
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

		// Collect widgets from all contributions, grouped by location.
		const widgetsByLocation = new Map<BrowserWidgetLocation, IBrowserEditorWidget[]>();
		const urlRenderers: IBrowserUrlRenderer[] = [];
		for (const contribution of this._contributionInstances.values()) {
			for (const widget of contribution.widgets) {
				let bucket = widgetsByLocation.get(widget.location);
				if (!bucket) {
					bucket = [];
					widgetsByLocation.set(widget.location, bucket);
				}
				bucket.push(widget);
			}
			urlRenderers.push(...contribution.urlRenderers);
		}
		for (const bucket of widgetsByLocation.values()) {
			bucket.sort((a, b) => a.order - b.order);
		}
		const widgetsAt = (location: BrowserWidgetLocation): readonly IBrowserEditorWidget[] =>
			widgetsByLocation.get(location) ?? [];

		this._navigationBar.addPreUrlWidgets(widgetsAt(BrowserWidgetLocation.PreUrl));
		this._navigationBar.addUrlBarWidgets(widgetsAt(BrowserWidgetLocation.PostUrl));
		this._navigationBar.addUrlRenderers(urlRenderers);

		root.appendChild(navbar);

		// Toolbar widgets — appended between the navbar and the container.
		for (const widget of widgetsAt(BrowserWidgetLocation.Toolbar)) {
			root.appendChild(widget.element);
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
			contribution.onContainerCreated(this._browserContainer);
		}

		// Wrapper around placeholder contents for border radius clipping. Holds
		// contribution-provided content (placeholder screenshot, overlay-pause)
		// plus the editor-owned welcome layer.
		const placeholderContents = $('.browser-placeholder-contents');
		this._browserContainer.appendChild(placeholderContents);

		// Container widgets — stacked inside the placeholder area.
		for (const widget of widgetsAt(BrowserWidgetLocation.ContentArea)) {
			placeholderContents.appendChild(widget.element);
		}

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

		this.layout();
		this.updateVisibility();
	}

	protected override setEditorVisible(visible: boolean): void {
		for (const c of this._contributionInstances.values()) {
			c.onPaneVisibilityChanged(visible);
		}
		this.updateVisibility();
	}

	/**
	 * Make the browser container the active element without moving focus from the browser view.
	 */
	ensureBrowserFocus(): void {
		originalHtmlElementFocus.call(this._browserContainer);
	}

	/**
	 * Notify the editor pane that focus has landed on the page content.
	 * The renderer-providing contribution calls this when the underlying
	 * page reports focus, since the page lives outside the DOM focus tracker
	 * and so doesn't propagate through {@link EditorPane.onDidFocus}.
	 */
	notifyPageFocused(): void {
		this._onDidFocus?.fire();
	}

	private updateVisibility(): void {
		// Welcome container: shown when no URL is loaded
		this._welcomeContainer.style.display = this._model?.url ? 'none' : '';
	}

	/**
	 * Close this editor tab (i.e. the editor input owning the current page).
	 */
	closeTab(): void {
		this.group?.closeEditor(this.input);
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
				contribution.onPaneResized(dimension.width);
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
			const o = c.beforeContainerLayout();
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
		// after padding. layout.top/left are local to the available area; pane
		// info also carries the absolute screen origin so contributions can
		// reason about pixel alignment.
		const paneWidth = Math.max(0, wrapperRect.width - padding.left - padding.right);
		const paneHeight = Math.max(0, wrapperRect.height - padding.top - padding.bottom);
		const pane: IContainerLayoutPane = {
			width: paneWidth,
			height: paneHeight,
			originX: wrapperRect.left + padding.left,
			originY: wrapperRect.top + padding.top,
		};
		const sorted = overrides.slice().sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
		let layout: IContainerLayout = { width: paneWidth, height: paneHeight, top: 0, left: 0 };
		for (const o of sorted) {
			const next = o.compute?.(layout, pane);
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

		for (const c of this._contributionInstances.values()) {
			c.afterContainerLayout();
		}
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

		this._navigationBar.clear();

		super.clearInput();
	}
}
