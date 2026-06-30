/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browser.css';
import { localize, localize2 } from '../../../../nls.js';
import { $, Dimension, IDomPosition } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ContextKeyExpr, IContextKey, RawContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, IConstructorSignature, BrandedService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IQuickInputButton } from '../../../../platform/quickinput/common/quickInput.js';
import { IBrowserViewModel } from '../../browserView/common/browserView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';

export const CONTEXT_BROWSER_FOCUSED = new RawContextKey<boolean>('browserFocused', true, localize('browser.editorFocused', "Whether the browser editor is focused"));
export const CONTEXT_BROWSER_HAS_URL = new RawContextKey<boolean>('browserHasUrl', false, localize('browser.hasUrl', "Whether the browser has a URL loaded"));
export const CONTEXT_BROWSER_HAS_ERROR = new RawContextKey<boolean>('browserHasError', false, localize('browser.hasError', "Whether the browser has a load error"));

/** Context key expression matching when the browser editor is the active editor. */
export const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals('activeEditor', BrowserEditorInput.EDITOR_ID);

/** Localized "Browser" category for command palette grouping. */
export const BrowserActionCategory = localize2('browserCategory', "Browser");

/** Menu groups used by browser-editor actions. */
export enum BrowserActionGroup {
	Tabs = '1_tabs',
	Zoom = '2_zoom',
	Tools = '3_tools',
	Data = '4_data',
	Settings = '5_settings'
}

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
	 * Called when an input is attached but no model exists yet. Use to render
	 * placeholder UI from the input's metadata (e.g. show the URL in the navbar)
	 * while the model resolves. Only fires when the input has no preloaded model;
	 * after the model resolves, {@link onModelAttached} takes over.
	 */
	prerenderInput(_input: BrowserEditorInput): void { }

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
	 * Optional URL bar suggestion providers (open tabs, history, favorites,
	 * search engines, ...). The navbar invokes each provider in sorted order
	 * when the URL picker opens or its value changes, and renders the merged
	 * suggestions below the built-in "Go to" entry.
	 */
	get urlSuggestionProviders(): readonly IBrowserUrlSuggestionProvider[] { return []; }

	/**
	 * Optional action providers for buttons rendered in the URL picker chrome.
	 * The navbar collects buttons from each provider when the picker opens
	 * and refreshes them when a provider fires {@link IBrowserUrlPickerActionProvider.onDidChange}.
	 */
	get urlPickerActionProviders(): readonly IBrowserUrlPickerActionProvider[] { return []; }

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
	 * Called when the editor wants focus. Contributions are tried in
	 * registration order; the first to return `true` claims the focus. The
	 * renderer-providing contribution typically handles this when a page is
	 * loaded; the navbar handles it as a fallback by focusing the URL input.
	 */
	tryFocus(): boolean { return false; }

	/**
	 * Called once after the editor's browser container DOM has been created
	 * and all toolbar widgets have been mounted. Use for any setup that needs
	 * the editor's DOM to exist or needs to read sibling contributions (e.g.
	 * the navbar pulls pre/post-URL widgets from other features here).
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

/**
 * A single URL bar suggestion. Suggestions are produced by
 * {@link IBrowserUrlSuggestionProvider}s contributed via
 * {@link BrowserEditorContribution.urlSuggestionProviders}. When the user
 * picks a suggestion the navbar invokes {@link apply}, passing the active
 * {@link BrowserEditorInput} so the suggestion can decide what to do with it
 * (navigate, swap to a different tab, etc.).
 */
export interface IBrowserUrlSuggestion {
	/** Stable identifier used as the picker item id. */
	readonly id: string;
	/** Label shown in the suggestion list. */
	readonly label: string;
	/** Optional secondary description (e.g. host, date, source). */
	readonly description?: string;
	/** Optional leading icon (codicon). */
	readonly icon?: ThemeIcon;
	/** Optional leading icon (image, e.g. favicon). Takes precedence over {@link icon}. */
	readonly iconPath?: { dark: URI; light?: URI };
	/**
	 * Optional per-item actions rendered as inline buttons on the
	 * suggestion's row (e.g. a delete button on a favorite suggestion).
	 */
	readonly actions?: readonly IBrowserUrlSuggestionAction[];
	/**
	 * Invoked when the suggestion is accepted. Receives the input that owns
	 * the URL bar so the suggestion can act on its editor (e.g. swap the
	 * editor's input for a different tab, or load a URL into its model).
	 */
	apply(input: BrowserEditorInput): void | Promise<void>;
}

/**
 * A per-item button rendered inline on a suggestion's row (e.g. a delete
 * button on a favorite). Extends {@link IQuickInputButton} so visual
 * properties are configured the same way as any other picker button; adds
 * an {@link id} for identification and a {@link run} callback that receives
 * the active {@link BrowserEditorInput} so the action can operate on the
 * editor it was triggered from.
 */
export interface IBrowserUrlSuggestionAction extends IQuickInputButton {
	/** Stable id (useful for telemetry/debugging). */
	readonly id: string;
	/** Invoked when the user activates the per-item button. */
	run(input: BrowserEditorInput): void | Promise<void>;
}

/** Context passed to providers when suggestions are requested. */
export interface IBrowserUrlSuggestionContext {
	/** Current URL bar text (may be empty). */
	readonly text: string;
	/** The input that owns the URL bar requesting suggestions. */
	readonly input: BrowserEditorInput;
}

/**
 * A source of URL bar suggestions (open tabs, history, favorites, search
 * engines, ...). Contributions return providers via
 * {@link BrowserEditorContribution.urlSuggestionProviders}.
 */
export interface IBrowserUrlSuggestionProvider {
	/**
	 * Optional group label rendered as a separator above this provider's
	 * suggestions (only shown when the provider returns at least one item).
	 */
	readonly label?: string;
	/**
	 * Optional group description rendered next to the separator label
	 * (e.g. "Select a tab to switch"). Only shown when {@link label} is set.
	 */
	readonly description?: string;
	/** Sort order between providers. Lower runs first. Defaults to 0. */
	readonly order?: number;
	/**
	 * Optional buttons rendered inline on the group's separator row. Only
	 * shown when the provider returns at least one suggestion. Use these for
	 * commands that operate on the whole group (e.g. a "manage" picker).
	 */
	readonly actions?: readonly IBrowserUrlSuggestionAction[];
	/**
	 * Fires when the set of suggestions or any suggestion's state has changed.
	 * The navbar re-requests suggestions when this fires.
	 */
	readonly onDidChange?: Event<void>;
	getSuggestions(context: IBrowserUrlSuggestionContext, token: CancellationToken): Promise<readonly IBrowserUrlSuggestion[]>;
}

/**
 * A button rendered in the URL picker chrome.
 * Extends {@link IQuickInputButton} so visual properties (icon, tooltip,
 * toggle state, location) are configured the same way as any other picker
 * button; adds an {@link id} for identification and a {@link run} callback
 * that receives the active {@link BrowserEditorInput} so the action can
 * operate on the editor it was triggered from.
 */
export interface IBrowserUrlPickerAction extends IQuickInputButton {
	/** Stable id (useful for telemetry/debugging). */
	readonly id: string;
	/** Invoked when the user activates the button. */
	run(input: BrowserEditorInput): void | Promise<void>;
}

/**
 * A source of URL picker chrome actions. Providers are queried once when the
 * picker opens; if a provider's actions or their state change while the
 * picker is open, fire {@link onDidChange} to have the navbar rebuild the
 * button list.
 */
export interface IBrowserUrlPickerActionProvider {
	/** Fires when the action set or any action's visual state changes. */
	readonly onDidChange?: Event<void>;
	/** Sort order between providers. Lower runs first. Defaults to 0. */
	readonly order?: number;
	getActions(input: BrowserEditorInput): readonly IBrowserUrlPickerAction[];
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

	/** All instantiated contributions in registration order. */
	getContributions(): Iterable<BrowserEditorContribution> {
		return this._contributionInstances.values();
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

	private _browserContainerWrapper!: HTMLElement;
	private _browserContainer!: HTMLElement;
	get browserContainer(): HTMLElement { return this._browserContainer; }

	private _hasUrlContext!: IContextKey<boolean>;
	private _hasErrorContext!: IContextKey<boolean>;

	private readonly _inputDisposables = this._register(new DisposableStore());
	private _currentPadding: { top: number; right: number; bottom: number; left: number } = { top: 0, right: 0, bottom: 0, left: 0 };

	override get input(): BrowserEditorInput | undefined { return super.input as BrowserEditorInput | undefined; }

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

		// Collect widgets from all contributions, grouped by location.
		const widgetsByLocation = new Map<BrowserWidgetLocation, IBrowserEditorWidget[]>();
		for (const contribution of this._contributionInstances.values()) {
			for (const widget of contribution.widgets) {
				let bucket = widgetsByLocation.get(widget.location);
				if (!bucket) {
					bucket = [];
					widgetsByLocation.set(widget.location, bucket);
				}
				bucket.push(widget);
			}
		}
		for (const bucket of widgetsByLocation.values()) {
			bucket.sort((a, b) => a.order - b.order);
		}
		const widgetsAt = (location: BrowserWidgetLocation): readonly IBrowserEditorWidget[] =>
			widgetsByLocation.get(location) ?? [];

		// Toolbar widgets — stacked at the top of the editor. The navbar is the
		// first toolbar widget (order 0); find/emulation/etc follow in order.
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
		// contribution-provided content area widgets (welcome placeholder,
		// placeholder screenshot, overlay-pause, error overlay, ...).
		const placeholderContents = $('.browser-placeholder-contents');
		this._browserContainer.appendChild(placeholderContents);

		// Container widgets — stacked inside the placeholder area.
		for (const widget of widgetsAt(BrowserWidgetLocation.ContentArea)) {
			placeholderContents.appendChild(widget.element);
		}
	}

	override focus(): void {
		for (const c of this._contributionInstances.values()) {
			if (c.tryFocus()) {
				return;
			}
		}
		// Fallback when no contribution claimed focus (e.g. tests).
		this.ensureBrowserFocus();
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
			this._hasUrlContext.set(!!input.url);
			this._hasErrorContext.set(false);

			// Let contributions render placeholder UI from the input's metadata
			// (e.g. URL, title) while the model is loading.
			for (const c of this._contributionInstances.values()) {
				c.prerenderInput(input);
			}

			// Resolve the browser view model from the input
			model = await input.resolve();
		}

		if (token.isCancellationRequested || this.input !== input) {
			return;
		}

		this._model = model;
		this._onDidChangeModel.fire({ model, isNew });

		this._hasUrlContext.set(!!model.url);
		this._hasErrorContext.set(!!model.error);

		// When closing a tab, the model gets disposed before the editor input is cleared.
		// So we make sure we don't keep a reference to the disposed model.
		this._inputDisposables.add(this._model.onWillDispose(() => {
			if (this._model === model) {
				this._model = undefined;
				this._onDidChangeModel.fire({ model: undefined, isNew: false });
			}
		}));

		this._inputDisposables.add(this._model.onWillNavigate(() => {
			this.group.pinEditor(this.input); // pin editor on navigation
			this.ensureBrowserFocus();
		}));

		this._inputDisposables.add(this._model.onDidNavigate(() => {
			this.group.pinEditor(this.input); // pin editor on navigation
			this._hasUrlContext.set(!!model.url);
		}));

		this._inputDisposables.add(this._model.onDidChangeLoadingState(() => {
			this._hasErrorContext.set(!!model.error);
		}));

		this._inputDisposables.add(model.onDidChangeFocus(({ focused }) => {
			// When the view gets focused, make sure the editor reports that it has focus,
			// but focus is removed from the workbench.
			if (focused) {
				this._onDidFocus?.fire();
				this.ensureBrowserFocus();
			}
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
	}

	protected override setEditorVisible(visible: boolean): void {
		for (const c of this._contributionInstances.values()) {
			c.onPaneVisibilityChanged(visible);
		}
	}

	/**
	 * Make the browser container the active element without moving focus from the browser view.
	 */
	ensureBrowserFocus(): void {
		originalHtmlElementFocus.call(this._browserContainer);
		this.window.document.getSelection()?.removeAllRanges();
	}

	/**
	 * Close this editor tab (i.e. the editor input owning the current page).
	 */
	closeTab(): void {
		this.group?.closeEditor(this.input);
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

		if (this._model) {
			this._model = undefined;
			this._onDidChangeModel.fire({ model: undefined, isNew: false });
		}

		this._hasUrlContext.reset();
		this._hasErrorContext.reset();

		super.clearInput();
	}
}
