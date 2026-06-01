/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
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
} from '../browserEditor.js';
import { BrowserUrlBarWidget, IBrowserUrlBarHost } from '../widgets/browserUrlBarWidget.js';

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
				toolbarOptions: { primaryGroup: (group) => group.startsWith('actions'), useSeparatorsInPrimaryActions: true },
				menuOptions: { shouldForwardArgs: true }
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
		this._updateFromModel(model);
		store.add(model.onDidNavigate(() => this._updateFromModel(model)));
		store.add(model.onWillNavigate(url => this._navbar.previewUrl(url)));
	}

	override onModelDetached(): void {
		this._navbar.clear();
		this._canGoBackContext.reset();
		this._canGoForwardContext.reset();
	}

	override tryFocus(): boolean {
		// A new tab (no URL loaded) auto-opens the picker so the user can
		// immediately type / browse suggestions. For tabs that already have a
		// URL (e.g. error or loading state — page-renderer focus didn't claim
		// us, or input is still prerendering before the model attaches) we
		// just focus the display so the URL stays visible.
		const input = this.editor.input;
		const url = this.editor.model?.url ?? (input instanceof BrowserEditorInput ? input.url : undefined);
		if (!url) {
			this._navbar.openUrlPicker();
		} else {
			this._navbar.focusUrlInput();
		}
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
