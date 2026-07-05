/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import {
	BROWSER_SEARCH_NONE,
	BrowserSearchEngineId,
	BrowserSearchEngineSettingId,
	buildSearchUrl,
	getBrowserSearchEngineLabel,
	resolveAddressBarInputType,
} from '../../common/browserSearch.js';
import {
	BROWSER_EDITOR_ACTIVE,
	BrowserActionCategory,
	BrowserActionGroup,
	BrowserEditor,
	BrowserEditorContribution,
	BrowserWidgetLocation,
	CONTEXT_BROWSER_FOCUSED,
	CONTEXT_BROWSER_HAS_URL,
	IBrowserEditorWidget,
	IBrowserUrlSuggestionAction,
} from '../browserEditor.js';
import { BrowserUrlBarWidget, IBrowserUrlBarHost, IUrlPickerItem } from '../widgets/browserUrlBarWidget.js';

const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey<boolean>('browserCanGoBack', false, localize('browser.canGoBack', "Whether the browser can go back"));
const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey<boolean>('browserCanGoForward', false, localize('browser.canGoForward', "Whether the browser can go forward"));

/**
 * Browser navigation bar widget: nav toolbar (back/forward/etc), URL bar
 * (display + editing picker, see {@link BrowserUrlBarWidget}), actions toolbar.
 * Owned by {@link BrowserNavigationFeatures}.
 */
class BrowserNavigationBar extends Disposable {
	readonly element: HTMLElement;
	private readonly _urlBar: BrowserUrlBarWidget;

	constructor(
		editor: BrowserEditor,
		instantiationService: IInstantiationService,
		scopedContextKeyService: IContextKeyService,
		private readonly _configurationService: IConfigurationService,
		private readonly _preferencesService: IPreferencesService,
	) {
		super();

		this.element = $('.browser-navbar');

		const hoverDelegate = this._register(
			instantiationService.createInstance(
				WorkbenchHoverDelegate,
				'element',
				undefined,
				{ position: { hoverPosition: HoverPosition.ABOVE } }
			)
		);

		const scopedInstantiationService = instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService]
		));

		const navContainer = $('.browser-nav-toolbar');
		const navToolbar = this._register(scopedInstantiationService.createInstance(
			MenuWorkbenchToolBar,
			navContainer,
			MenuId.BrowserNavigationToolbar,
			{
				hoverDelegate,
				highlightToggledItems: true,
				// Render all actions inline regardless of group.
				toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
				menuOptions: { shouldForwardArgs: true }
			}
		));
		navToolbar.context = editor;

		const urlBarHost: IBrowserUrlBarHost = {
			get input() { return editor.input instanceof BrowserEditorInput ? editor.input : undefined; },
			ensureBrowserFocus: () => editor.ensureBrowserFocus(),
			getPrimaryActions: (text) => this._resolvePrimaryActions(text),
			getPlaceholder: () => this._searchEngine
				? localize({ key: 'browser.urlOrSearchPlaceholder', comment: ['Placeholder text shown in the integrated browser\'s address (URL) bar when it is empty. The user can either type a search query to search the web, or type a URL to navigate to it.'] }, "Search or enter URL")
				: localize('browser.urlPlaceholder', "Enter a URL"),
		};
		this._urlBar = this._register(instantiationService.createInstance(BrowserUrlBarWidget, urlBarHost));

		const actionsContainer = $('.browser-actions-toolbar');
		const actionsToolbar = this._register(scopedInstantiationService.createInstance(
			MenuWorkbenchToolBar,
			actionsContainer,
			MenuId.BrowserActionsToolbar,
			{
				hoverDelegate,
				highlightToggledItems: true,
				toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
				menuOptions: { shouldForwardArgs: true },
				responsiveBehavior: {
					enabled: true,
					kind: 'last',
					minItems: 0,

					// The URL bar is the flexible element, so the actions toolbar's own
					// element width does not reflect the room it could occupy.
					// So we pass manual calculations based on the navbar's overall width and the URL bar's width.
					observedElement: this.element,
					getAvailableWidth: () => {
						const toolbarBounds = this.element.getBoundingClientRect();
						const urlBarBounds = this._urlBar.element.getBoundingClientRect();
						return Math.max(0, toolbarBounds.right - urlBarBounds.left - 240 /* approximate: preferred width of the URL input plus padding */);
					}
				},
			}
		));
		actionsToolbar.context = editor;

		this.element.appendChild(navContainer);
		this.element.appendChild(this._urlBar.element);
		this.element.appendChild(actionsContainer);
	}

	refreshUrl(): void { this._urlBar.refreshUrl(); }
	previewUrl(url: string): void { this._urlBar.previewUrl(url); }
	focusUrlInput(): void { this._urlBar.focusUrlInput(); }
	openUrlPicker(): void { this._urlBar.openUrlPicker(); }
	clear(): void { this._urlBar.clear(); }

	mountContributions(contributions: readonly BrowserEditorContribution[]): void { this._urlBar.mountContributions(contributions); }

	/**
	 * The configured address bar search engine, or `undefined` when search
	 * routing is disabled (the setting is `'none'`).
	 */
	private get _searchEngine(): BrowserSearchEngineId | undefined {
		const value = this._configurationService.getValue<string>(BrowserSearchEngineSettingId);
		return value && value !== BROWSER_SEARCH_NONE ? value as BrowserSearchEngineId : undefined;
	}

	/**
	 * The URL bar's primary picker item(s) for the given text, mirroring
	 * Chrome/Edge. With search enabled: a URL reads "{url}" (globe icon) first
	 * with a search fallback after, a clear query reads "{query} - {engine}
	 * Search" (search icon), and an ambiguous input offers both — Search first,
	 * then Go to — so the user can pick. The destination URL is resolved here
	 * (search text → search-engine URL) so {@link BrowserEditorInput.navigate}
	 * receives a plain URL; the telemetry source is passed through so a
	 * search-initiated navigation is tracked as such.
	 */
	private _resolvePrimaryActions(text: string): IUrlPickerItem[] {
		const goTo: IUrlPickerItem = {
			id: text,
			label: text,
			iconClass: ThemeIcon.asClassName(Codicon.globe),
			apply: input => input.navigate(text),
		};
		const engineId = this._searchEngine;
		if (!engineId) {
			return [goTo];
		}
		const configureEngineButton: IBrowserUrlSuggestionAction = {
			id: 'browser.configureSearchEngine',
			iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
			tooltip: localize('browser.configureSearchEngine', "Configure Search Engine"),
			run: () => void this._preferencesService.openSettings({ query: `@id:${BrowserSearchEngineSettingId}` }),
		};
		const search: IUrlPickerItem = {
			id: text,
			label: localize('browser.searchFor', "{0} - {1} Search", text, getBrowserSearchEngineLabel(engineId)),
			iconClass: ThemeIcon.asClassName(Codicon.search),
			buttons: [configureEngineButton],
			apply: input => input.navigate(buildSearchUrl(text, engineId), { source: 'searchInput' }),
		};
		switch (resolveAddressBarInputType(text)) {
			case 'url':
				// Looks like a URL: navigate first, but still offer search after.
				return [goTo, search];
			case 'query':
				return [search];
			default:
				// Ambiguous: offer both, search first.
				return [search, goTo];
		}
	}
}


/**
 * Owns the navbar widget and the navigation-related context keys. Mounts
 * sibling PreUrl/PostUrl widgets and URL renderers into the navbar.
 */
export class BrowserNavigationFeatures extends BrowserEditorContribution {

	private readonly _navbar: BrowserNavigationBar;
	private readonly _canGoBackContext: IContextKey<boolean>;
	private readonly _canGoForwardContext: IContextKey<boolean>;
	private readonly _pendingTryFocus = this._register(new MutableDisposable());

	/**
	 * Whether a navigation has been initiated on the current tab. Once true,
	 * an empty URL means "navigation in flight" rather than "fresh tab", so
	 * {@link tryFocus} keeps focus on the page instead of reopening the picker.
	 */
	private _hasInitiatedNavigation = false;

	constructor(
		editor: BrowserEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IPreferencesService preferencesService: IPreferencesService,
	) {
		super(editor);
		this._navbar = this._register(new BrowserNavigationBar(editor, instantiationService, contextKeyService, configurationService, preferencesService));
		this._canGoBackContext = CONTEXT_BROWSER_CAN_GO_BACK.bindTo(contextKeyService);
		this._canGoForwardContext = CONTEXT_BROWSER_CAN_GO_FORWARD.bindTo(contextKeyService);

		// Keep the URL bar presentation (placeholder, primary action) in sync
		// when the user toggles search settings while the bar is visible.
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(BrowserSearchEngineSettingId)) {
				this._navbar.refreshUrl();
			}
		}));
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [{ location: BrowserWidgetLocation.Toolbar, element: this._navbar.element, order: 0 }];
	}

	override onContainerCreated(): void {
		const contributions: BrowserEditorContribution[] = [];
		for (const contribution of this.editor.getContributions()) {
			if (contribution !== this) {
				contributions.push(contribution);
			}
		}
		this._navbar.mountContributions(contributions);
	}

	override prerenderInput(_input: BrowserEditorInput): void {
		this._navbar.refreshUrl();
		this._canGoBackContext.set(false);
		this._canGoForwardContext.set(false);
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		// A model that is already loading on attach (e.g. switching back to a
		// tab mid-navigation) counts as having initiated navigation.
		this._hasInitiatedNavigation = model.loading;
		this._updateFromModel(model);
		store.add(model.onDidNavigate(() => this._updateFromModel(model)));
		store.add(model.onWillNavigate(url => {
			this._hasInitiatedNavigation = true;
			this._navbar.previewUrl(url);
		}));
	}

	override onModelDetached(): void {
		this._hasInitiatedNavigation = false;
		this._navbar.clear();
		this._canGoBackContext.reset();
		this._canGoForwardContext.reset();
	}

	override tryFocus(): boolean {
		const input = this.editor.input;

		// Defer one tick so editor-tab activation can focus the tab control first;
		// then we move focus into the browser editor's URL flow.
		this._pendingTryFocus.value = disposableTimeout(() => {
			if (this.editor.input !== input) {
				return;
			}

			// A new tab (no URL loaded) auto-opens the picker so the user can immediately type / browse suggestions.
			// Otherwise we move focus into the browser editor so it doesn't stay on the tab control.
			const url = this.editor.model?.url ?? (input instanceof BrowserEditorInput ? input.url : undefined);
			if (!url && !this._hasInitiatedNavigation) {
				this._navbar.openUrlPicker();
			} else {
				this.editor.ensureBrowserFocus();
			}
		}, 0);
		return true;
	}

	private _updateFromModel(model: IBrowserViewModel): void {
		this._navbar.refreshUrl();
		this._canGoBackContext.set(model.canGoBack);
		this._canGoForwardContext.set(model.canGoForward);
	}

	focusUrlInput(): void {
		this._navbar.focusUrlInput();
	}

	openUrlPicker(): void {
		this._navbar.openUrlPicker();
	}
}

BrowserEditor.registerContribution(BrowserNavigationFeatures);

class GoBackAction extends Action2 {
	static readonly ID = BrowserViewCommandId.GoBack;

	constructor() {
		super({
			id: GoBackAction.ID,
			title: localize2('browser.goBackAction', 'Go Back'),
			category: BrowserActionCategory,
			icon: Codicon.arrowLeft,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_BACK),
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 1,
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50,
				primary: KeyMod.Alt | KeyCode.LeftArrow,
				secondary: [KeyCode.BrowserBack],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.BracketLeft, secondary: [KeyCode.BrowserBack, KeyMod.CtrlCmd | KeyCode.LeftArrow] }
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.model?.goBack();
		}
	}
}

class GoForwardAction extends Action2 {
	static readonly ID = BrowserViewCommandId.GoForward;

	constructor() {
		super({
			id: GoForwardAction.ID,
			title: localize2('browser.goForwardAction', 'Go Forward'),
			category: BrowserActionCategory,
			icon: Codicon.arrowRight,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_FORWARD),
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 2,
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50,
				primary: KeyMod.Alt | KeyCode.RightArrow,
				secondary: [KeyCode.BrowserForward],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.BracketRight, secondary: [KeyCode.BrowserForward, KeyMod.CtrlCmd | KeyCode.RightArrow] }
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.model?.goForward();
		}
	}
}

class ReloadAction extends Action2 {
	static readonly ID = BrowserViewCommandId.Reload;

	constructor() {
		super({
			id: ReloadAction.ID,
			title: localize2('browser.reloadAction', 'Reload'),
			category: BrowserActionCategory,
			icon: Codicon.refresh,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 3,
				alt: {
					id: HardReloadAction.ID,
					title: localize2('browser.hardReloadAction', 'Hard Reload'),
					icon: Codicon.refresh,
				}
			},
			keybinding: {
				when: CONTEXT_BROWSER_FOCUSED,
				weight: KeybindingWeight.WorkbenchContrib + 75,
				primary: KeyMod.CtrlCmd | KeyCode.KeyR,
				secondary: [KeyCode.F5],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyR, secondary: [] }
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.model?.reload();
		}
	}
}

class HardReloadAction extends Action2 {
	static readonly ID = BrowserViewCommandId.HardReload;

	constructor() {
		super({
			id: HardReloadAction.ID,
			title: localize2('browser.hardReloadAction', 'Hard Reload'),
			category: BrowserActionCategory,
			icon: Codicon.refresh,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: {
				when: CONTEXT_BROWSER_FOCUSED,
				weight: KeybindingWeight.WorkbenchContrib + 75,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
				secondary: [KeyMod.CtrlCmd | KeyCode.F5],
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR, secondary: [] }
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.model?.reload(true);
		}
	}
}

class FocusUrlInputAction extends Action2 {
	static readonly ID = BrowserViewCommandId.FocusUrlInput;

	constructor() {
		super({
			id: FocusUrlInputAction.ID,
			title: localize2('browser.focusUrlInputAction', 'Focus URL Input'),
			category: BrowserActionCategory,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserNavigationFeatures)?.openUrlPicker();
		}
	}
}

class OpenInExternalBrowserAction extends Action2 {
	static readonly ID = BrowserViewCommandId.OpenExternal;

	constructor() {
		super({
			id: OpenInExternalBrowserAction.ID,
			title: localize2('browser.openExternalAction', 'Open in External Browser'),
			category: BrowserActionCategory,
			icon: Codicon.linkExternal,
			f1: true,
			// Note: We do allow opening in an external browser even if there is an error page shown
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Tools,
				order: 10,
				isHiddenByDefault: true,
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			const url = browserEditor.model?.url;
			if (url) {
				const openerService = accessor.get(IOpenerService);
				await openerService.open(url, {
					// ensures that VS Code itself doesn't try to open the URL, even for non-"http(s):" scheme URLs.
					openExternal: true,
					// ensures that the link isn't opened in Integrated Browser or other contributed external openers. False is the default, but just being explicit here.
					allowContributedOpeners: false
				});
			}
		}
	}
}

class OpenBrowserSettingsAction extends Action2 {
	static readonly ID = BrowserViewCommandId.OpenSettings;

	constructor() {
		super({
			id: OpenBrowserSettingsAction.ID,
			title: localize2('browser.openSettingsAction', 'Browser Settings'),
			category: BrowserActionCategory,
			icon: Codicon.settingsGear,
			f1: false,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Settings,
				order: 2,
				isHiddenByDefault: true,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const preferencesService = accessor.get(IPreferencesService);
		await preferencesService.openSettings({ query: `@id:workbench.browser.*` });
	}
}

registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(HardReloadAction);
registerAction2(FocusUrlInputAction);

registerAction2(OpenInExternalBrowserAction);
registerAction2(OpenBrowserSettingsAction);
