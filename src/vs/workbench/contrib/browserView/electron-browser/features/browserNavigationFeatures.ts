/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { $, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { AgentHostChatToolsEnabledSettingId } from '../browserViewWorkbenchService.js';
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
	IBrowserUrlRenderer,
} from '../browserEditor.js';

const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey<boolean>('browserCanGoBack', false, localize('browser.canGoBack', "Whether the browser can go back"));
const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey<boolean>('browserCanGoForward', false, localize('browser.canGoForward', "Whether the browser can go forward"));

/**
 * Browser navigation bar widget: nav toolbar (back/forward/etc), URL
 * display+input, pre/post-URL slots, actions toolbar. Owned by
 * {@link BrowserNavigationFeatures}.
 */
class BrowserNavigationBar extends Disposable {
	readonly element: HTMLElement;
	private readonly _urlInput: HTMLInputElement;
	private readonly _urlDisplay: HTMLElement;
	private readonly _preUrlWidgetsContainer: HTMLElement;
	private readonly _urlBarWidgetsContainer: HTMLElement;
	private readonly _urlRenderers: IBrowserUrlRenderer[] = [];

	constructor(
		private readonly _editor: BrowserEditor,
		instantiationService: IInstantiationService,
		scopedContextKeyService: IContextKeyService,
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
				// Render all actions inline regardless of group.
				toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
				menuOptions: { shouldForwardArgs: true }
			}
		));

		const urlContainer = $('.browser-url-container');
		this._preUrlWidgetsContainer = $('.browser-site-info-slot');

		// URL input is hidden until the user activates the display.
		this._urlInput = $<HTMLInputElement>('input.browser-url-input');
		this._urlInput.type = 'text';
		this._urlInput.placeholder = localize('browser.urlPlaceholder', "Enter a URL");
		this._urlInput.style.display = 'none';

		const urlInputWrapper = $('.browser-url-input-wrapper');
		this._urlDisplay = $('span.browser-url-display');
		this._urlDisplay.tabIndex = 0;
		urlInputWrapper.appendChild(this._urlDisplay);
		urlInputWrapper.appendChild(this._urlInput);

		this._urlBarWidgetsContainer = $('.browser-url-bar-widgets');

		urlContainer.appendChild(this._preUrlWidgetsContainer);
		urlContainer.appendChild(urlInputWrapper);
		urlContainer.appendChild(this._urlBarWidgetsContainer);

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

		navToolbar.context = this._editor;
		actionsToolbar.context = this._editor;

		this.element.appendChild(navContainer);
		this.element.appendChild(urlContainer);
		this.element.appendChild(actionsContainer);

		this._register(addDisposableListener(this._urlInput, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				const url = this._urlInput.value.trim();
				if (url) {
					this._navigateTo(url);
				}
			}
		}));

		// Browser-like behaviour: select all text on focus.
		this._register(addDisposableListener(this._urlInput, EventType.FOCUS, () => {
			this._urlInput.select();
		}));

		this._register(addDisposableListener(this._urlInput, EventType.BLUR, () => {
			this._showDisplay();
		}));
		this._register(addDisposableListener(this._urlDisplay, EventType.FOCUS, () => {
			this._showInput();
		}));
	}

	setUrl(url: string): void {
		this._urlInput.value = url;
		this._renderUrl();
	}

	focusUrlInput(): void {
		this._showInput();
	}

	addPreUrlWidgets(widgets: readonly IBrowserEditorWidget[]): void {
		const sorted = widgets.slice().sort((a, b) => a.order - b.order);
		for (const widget of sorted) {
			this._preUrlWidgetsContainer.appendChild(widget.element);
		}
	}

	addUrlBarWidgets(widgets: readonly IBrowserEditorWidget[]): void {
		const sorted = widgets.slice().sort((a, b) => a.order - b.order);
		for (const widget of sorted) {
			this._urlBarWidgetsContainer.appendChild(widget.element);
		}
	}

	addUrlRenderers(renderers: readonly IBrowserUrlRenderer[]): void {
		for (const renderer of renderers) {
			this._urlRenderers.push(renderer);
			this._register(renderer.onDidChange(() => this._renderUrl()));
		}
		this._renderUrl();
	}

	private _showInput(): void {
		this._urlDisplay.style.display = 'none';
		this._urlInput.style.display = '';
		this._urlInput.select();
		this._urlInput.focus();
	}

	private _showDisplay(): void {
		this._urlInput.style.display = 'none';
		this._urlDisplay.style.display = '';
		this._renderUrl();
	}

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

	private async _navigateTo(url: string): Promise<void> {
		const model = this._editor.model;
		if (!model) {
			return;
		}
		this._editor.group.pinEditor(this._editor.input); // pin editor on navigation

		// Prepend http:// for bare localhost authorities (e.g. "localhost:3000").
		if (/^localhost(:|\/|$)/i.test(url)) {
			url = 'http://' + url;
		} else if (!URL.parse(url)?.protocol) {
			// No scheme — default to http://; sites typically upgrade to https://.
			url = 'http://' + url;
		}

		this._editor.ensureBrowserFocus();
		await model.loadURL(url);
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

	constructor(
		editor: BrowserEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editor);
		this._navbar = this._register(new BrowserNavigationBar(editor, instantiationService, contextKeyService));
		this._canGoBackContext = CONTEXT_BROWSER_CAN_GO_BACK.bindTo(contextKeyService);
		this._canGoForwardContext = CONTEXT_BROWSER_CAN_GO_FORWARD.bindTo(contextKeyService);
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [{ location: BrowserWidgetLocation.Toolbar, element: this._navbar.element, order: 0 }];
	}

	override onContainerCreated(): void {
		const preUrl: IBrowserEditorWidget[] = [];
		const postUrl: IBrowserEditorWidget[] = [];
		const urlRenderers: IBrowserUrlRenderer[] = [];
		for (const contribution of this.editor.getContributions()) {
			if (contribution === this) {
				continue;
			}
			for (const widget of contribution.widgets) {
				if (widget.location === BrowserWidgetLocation.PreUrl) {
					preUrl.push(widget);
				} else if (widget.location === BrowserWidgetLocation.PostUrl) {
					postUrl.push(widget);
				}
			}
			urlRenderers.push(...contribution.urlRenderers);
		}
		this._navbar.addPreUrlWidgets(preUrl);
		this._navbar.addUrlBarWidgets(postUrl);
		this._navbar.addUrlRenderers(urlRenderers);
	}

	override prerenderInput(input: BrowserEditorInput): void {
		this._navbar.setUrl(input.url || '');
		this._canGoBackContext.set(false);
		this._canGoForwardContext.set(false);
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._updateFromModel(model);
		store.add(model.onDidNavigate(() => this._updateFromModel(model)));
	}

	override onModelDetached(): void {
		this._navbar.clear();
		this._canGoBackContext.reset();
		this._canGoForwardContext.reset();
	}

	override tryFocus(): boolean {
		this._navbar.focusUrlInput();
		return true;
	}

	private _updateFromModel(model: IBrowserViewModel): void {
		this._navbar.setUrl(model.url);
		this._canGoBackContext.set(model.canGoBack);
		this._canGoForwardContext.set(model.canGoForward);
	}

	focusUrlInput(): void {
		this._navbar.focusUrlInput();
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
			browserEditor.getContribution(BrowserNavigationFeatures)?.focusUrlInput();
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
				group: BrowserActionGroup.Page,
				order: 10
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
				order: 2
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const preferencesService = accessor.get(IPreferencesService);
		const contextKeyService = accessor.get(IContextKeyService);
		const ids = ['workbench.browser.*', 'chat.sendElementsToChat.*'];
		if (IsSessionsWindowContext.getValue(contextKeyService)) {
			ids.push(AgentHostChatToolsEnabledSettingId);
		}
		await preferencesService.openSettings({ query: `@id:${ids.join(',')}` });
	}
}

registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(HardReloadAction);
registerAction2(FocusUrlInputAction);

registerAction2(OpenInExternalBrowserAction);
registerAction2(OpenBrowserSettingsAction);
