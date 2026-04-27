/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService, GroupsOrder } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorsOrder, GroupIdentifier } from '../../../../common/editor.js';
import { IQuickInputService, IQuickInputButton, IQuickPickItem, IQuickPickSeparator, QuickInputButtonLocation, IQuickPick } from '../../../../../platform/quickinput/common/quickInput.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { BrowserViewUri } from '../../../../../platform/browserView/common/browserViewUri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from '../browserViewActions.js';
import { logBrowserOpen } from '../../../../../platform/browserView/common/browserViewTelemetry.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { IExternalOpener, IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { isLocalhostAuthority } from '../../../../../platform/url/common/trustedDomains.js';
import { IConfigurationService, isConfigured } from '../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { match } from '../../../../../base/common/glob.js';
import { $, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { BrowserEditor, BrowserEditorContribution, IBrowserEditorWidgetContribution } from '../browserEditor.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';

const CONTEXT_BROWSER_EDITOR_OPEN = new RawContextKey<boolean>('browserEditorOpen', false, localize('browser.editorOpen', "Whether any browser editor is currently open"));

interface IBrowserQuickPickItem extends IQuickPickItem {
	groupId: GroupIdentifier;
	editor: BrowserEditorInput;
}

const closeButtonItem: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.close),
	tooltip: localize('browser.closeTab', "Close")
};

const closeAllButtonItem: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.closeAll),
	tooltip: localize('browser.closeAllTabs', "Close All"),
	location: QuickInputButtonLocation.Inline
};


/**
 * Manages a quick pick that lists all open browser tabs grouped by editor group,
 * with close buttons, live updates, and an always-visible "New Integrated Browser Tab" entry.
 */
class BrowserTabQuickPick extends Disposable {

	private readonly _quickPick: IQuickPick<IBrowserQuickPickItem, { useSeparators: true }>;
	private readonly _itemListeners = this._register(new DisposableStore());

	private readonly _openNewTabPick: IBrowserQuickPickItem = {
		groupId: -1,
		editor: undefined!,
		label: localize('browser.openNewTab', "New Integrated Browser Tab"),
		iconClass: ThemeIcon.asClassName(Codicon.add),
		alwaysShow: true,
	};

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IQuickInputService quickInputService: IQuickInputService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
	) {
		super();

		this._quickPick = this._register(quickInputService.createQuickPick<IBrowserQuickPickItem>({ useSeparators: true }));
		this._quickPick.placeholder = localize('browser.quickOpenPlaceholder', "Select a browser tab");
		this._quickPick.matchOnDescription = true;
		this._quickPick.sortByLabel = false;
		this._quickPick.buttons = [closeAllButtonItem];

		this._register(this._quickPick.onDidTriggerItemButton(async ({ item }) => {
			item.editor?.dispose(true);
		}));

		this._register(this._quickPick.onDidTriggerButton(async () => {
			for (const editor of this._browserViewService.getKnownBrowserViews().values()) {
				editor.dispose(true);
			}
		}));

		this._register(this._quickPick.onDidAccept(async () => {
			const [selected] = this._quickPick.selectedItems;
			if (!selected) {
				return;
			}
			if (selected === this._openNewTabPick) {
				logBrowserOpen(telemetryService, 'quickOpenWithoutUrl');
				this._quickPick.hide();
				await this._editorService.openEditor({
					resource: BrowserViewUri.forId(generateUuid()),
				});
			} else {
				await this._editorService.openEditor(selected.editor, selected.groupId);
			}
		}));

		this._register(this._quickPick.onDidHide(() => this.dispose()));
	}

	show(): void {
		this._buildItems();

		// Pre-select the currently active browser editor
		const activeEditor = this._editorService.activeEditor;
		if (activeEditor instanceof BrowserEditorInput) {
			const activePick = (this._quickPick.items as readonly (IBrowserQuickPickItem | IQuickPickSeparator)[])
				.find((item): item is IBrowserQuickPickItem => item.type !== 'separator' && item.editor === activeEditor);
			if (activePick) {
				this._quickPick.activeItems = [activePick];
			}
		}

		this._quickPick.show();
	}

	private _buildItems(): void {
		this._itemListeners.clear();

		// Remember which editor was active so we can restore selection
		const activeEditor = this._quickPick.activeItems[0]?.editor;

		const picks: (IBrowserQuickPickItem | IQuickPickSeparator)[] = [];
		const groups = this._editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE);

		const groupsWithBrowserEditors = groups
			.map(group => ({ group, browserEditors: group.editors.filter((e): e is BrowserEditorInput => e instanceof BrowserEditorInput) }))
			.filter(({ browserEditors }) => browserEditors.length > 0);

		// Track which view IDs appear in at least one editor group
		const viewsInGroups = new Set<string>();
		for (const { browserEditors } of groupsWithBrowserEditors) {
			for (const editor of browserEditors) {
				viewsInGroups.add(editor.id);
			}
		}

		// Background views: known but not open in any editor group
		const backgroundEditors = [...this._browserViewService.getKnownBrowserViews().values()].filter(e => !viewsInGroups.has(e.id));
		const backgroundLabel = localize('browser.backgroundGroup', "Background");

		// Build sections: each editor group + optional background
		type Section = { label: string; ariaLabel: string; groupId: number; editors: BrowserEditorInput[]; isPinned?: (e: BrowserEditorInput) => boolean };
		const sections: Section[] = groupsWithBrowserEditors.map(({ group, browserEditors }) => ({
			label: group.label,
			ariaLabel: group.ariaLabel,
			groupId: group.id,
			editors: browserEditors,
			isPinned: e => group.isPinned(e),
		}));
		if (backgroundEditors.length > 0) {
			sections.push({ label: backgroundLabel, ariaLabel: backgroundLabel, groupId: ACTIVE_GROUP, editors: backgroundEditors });
		}
		for (const { group } of groupsWithBrowserEditors) {
			this._itemListeners.add(group.onDidModelChange(() => this._buildItems()));
		}
		this._itemListeners.add(this._browserViewService.onDidChangeBrowserViews(() => this._buildItems()));

		const hasMultipleSections = sections.length > 1;
		let newActivePick: IBrowserQuickPickItem | undefined;

		for (const section of sections) {
			if (hasMultipleSections) {
				picks.push({ type: 'separator', label: section.label });
			}
			for (const editor of section.editors) {
				const icon = editor.getIcon();
				const description = editor.getDescription();
				const nameAndDescription = description ? `${editor.getName()} ${description}` : editor.getName();
				const pick: IBrowserQuickPickItem = {
					groupId: section.groupId,
					editor,
					label: editor.getName(),
					ariaLabel: hasMultipleSections
						? localize('browserEntryAriaLabelWithGroup', "{0}, {1}", nameAndDescription, section.ariaLabel)
						: nameAndDescription,
					description,
					buttons: [closeButtonItem],
					italic: section.isPinned ? !section.isPinned(editor) : undefined,
				};
				if (icon instanceof URI) {
					pick.iconPath = { dark: icon };
				} else if (icon) {
					pick.iconClass = ThemeIcon.asClassName(icon);
				}
				picks.push(pick);

				if (editor === activeEditor) {
					newActivePick = pick;
				}

				this._itemListeners.add(editor.onDidChangeLabel(() => this._buildItems()));
			}
		}

		picks.push({ type: 'separator' });
		picks.push(this._openNewTabPick);

		this._quickPick.keepScrollPosition = true;
		this._quickPick.items = picks;
		if (newActivePick) {
			this._quickPick.activeItems = [newActivePick];
		}
	}
}

class QuickOpenBrowserAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.QuickOpen,
			title: localize2('browser.quickOpenAction', "Quick Open Browser Tab..."),
			icon: Codicon.globe,
			category: BrowserActionCategory,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				// Note: on Linux this conflicts with the "toggle block comment" keybinding.
				//       it's not as problem at the moment becase oh the `when`, but worth noting for the future.
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
				when: BROWSER_EDITOR_ACTIVE
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const picker = accessor.get(IInstantiationService).createInstance(BrowserTabQuickPick);
		picker.show();
	}
}

interface IOpenBrowserOptions {
	url?: string;
	openToSide?: boolean;

	/**
	 * If set, the first existing tab with a URL matching this glob pattern will be reused / focused instead of opening a new tab.
	 *
	 * This is used by Live Preview extension to reuse tabs, especially after reload / restart.
	 */
	reuseUrlFilter?: string;
}

class OpenIntegratedBrowserAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.Open,
			title: localize2('browser.openAction', "Open Integrated Browser"),
			category: BrowserActionCategory,
			icon: Codicon.globe,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, urlOrOptions?: string | IOpenBrowserOptions): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const telemetryService = accessor.get(ITelemetryService);
		const browserViewService = accessor.get(IBrowserViewWorkbenchService);

		// Parse arguments
		const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : (urlOrOptions ?? {});
		const resource = BrowserViewUri.forId(generateUuid());
		const group = options.openToSide ? SIDE_GROUP : ACTIVE_GROUP;

		if (options.reuseUrlFilter) {
			const filterUri = URI.parse(options.reuseUrlFilter);
			const matchingEditor = [...browserViewService.getKnownBrowserViews().values()].find((e) => {
				const editorUri = URI.parse(e.url || '');
				// URIs default to putting "file" scheme. Check that the scheme is really in the filter.
				if (filterUri.scheme && options.reuseUrlFilter!.startsWith(`${filterUri.scheme}:`) && filterUri.scheme !== editorUri.scheme) {
					return false;
				}
				if (filterUri.authority && !match(filterUri.authority, editorUri.authority)) {
					return false;
				}
				if (filterUri.path && !match(filterUri.path, editorUri.path)) {
					return false;
				}
				if (filterUri.query) {
					const filterParams = new URLSearchParams(filterUri.query);
					const editorParams = new URLSearchParams(editorUri.query);
					if (![...filterParams].every(([key, value]) => match(value, editorParams.get(key) ?? ''))) {
						return false;
					}
				}

				return true;
			});
			if (matchingEditor) {
				if (options.url) {
					matchingEditor.navigate(options.url);
				}
				await editorService.openEditor(matchingEditor);
				return;
			}
		}

		logBrowserOpen(telemetryService, options.url ? 'commandWithUrl' : 'commandWithoutUrl');

		const editorPane = await editorService.openEditor({ resource, options: { viewState: { url: options.url } } }, group);

		// Lock the group when opening to the side
		if (options.openToSide && editorPane?.group) {
			editorPane.group.lock(true);
		}
	}
}

class NewTabAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.NewTab,
			title: localize2('browser.newTabAction', "New Tab"),
			category: BrowserActionCategory,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Tabs,
				order: 1,
			},
			// When already in a browser, Ctrl/Cmd + T opens a new tab
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50, // Priority over search actions
				primary: KeyMod.CtrlCmd | KeyCode.KeyT,
			}
		});
	}

	async run(accessor: ServicesAccessor, _browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const telemetryService = accessor.get(ITelemetryService);
		const resource = BrowserViewUri.forId(generateUuid());

		logBrowserOpen(telemetryService, 'newTabCommand');

		await editorService.openEditor({ resource });
	}
}

class CloseAllBrowserTabsAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.CloseAll,
			title: localize2('browser.closeAll', "Close All Browser Tabs"),
			category: BrowserActionCategory,
			f1: true,
			precondition: CONTEXT_BROWSER_EDITOR_OPEN,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		for (const group of editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
			const browserEditors = group.getEditors(EditorsOrder.SEQUENTIAL).filter((e): e is BrowserEditorInput => e instanceof BrowserEditorInput);
			if (browserEditors.length > 0) {
				await group.closeEditors(browserEditors);
			}
		}
	}
}

class CloseAllBrowserTabsInGroupAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.CloseAllInGroup,
			title: localize2('browser.closeAllInGroup', "Close All Browser Tabs in Group"),
			category: BrowserActionCategory,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const editorService = accessor.get(IEditorService);
		const group = editorGroupsService.getGroup(editorService.activeEditorPane?.group?.id ?? editorGroupsService.activeGroup.id);
		if (!group) {
			return;
		}
		const browserEditors = group.getEditors(EditorsOrder.SEQUENTIAL).filter((e): e is BrowserEditorInput => e instanceof BrowserEditorInput);
		if (browserEditors.length > 0) {
			await group.closeEditors(browserEditors);
		}
	}
}

class OpenOrListBrowsersAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.OpenOrList,
			title: localize2('browser.openOrListAction', "Browser"),
			icon: Codicon.globe,
			f1: false,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Slash,
			},
			menu: {
				id: MenuId.TitleBar,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.workbench.browser.showInTitleBar', false).negate(),
					ContextKeyExpr.or(
						CONTEXT_BROWSER_EDITOR_OPEN,
						// This is a hack to work around `true` just testing for truthiness of the key. It works since `1 == true` in JS.
						ContextKeyExpr.equals('config.workbench.browser.showInTitleBar', 1)
					)
				),
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserViewService = accessor.get(IBrowserViewWorkbenchService);
		const commandService = accessor.get(ICommandService);

		const hasOpenBrowserEditor = browserViewService.getKnownBrowserViews().size > 0;

		if (hasOpenBrowserEditor) {
			await commandService.executeCommand(BrowserViewCommandId.QuickOpen);
			return;
		}

		await commandService.executeCommand(BrowserViewCommandId.Open);
	}
}

// Register in View menu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '4_auxbar',
	command: {
		id: BrowserViewCommandId.OpenOrList,
		title: localize({ key: 'miOpenBrowser', comment: ['&& denotes a mnemonic'] }, "&&Browser")
	},
	order: 2
});

// Register as "Close All Browser Tabs" action in editor title menu to align with the regular "Close All" action
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: BrowserViewCommandId.CloseAllInGroup, title: localize('browser.closeAllInGroupShort', "Close All Browser Tabs") }, group: '1_close', order: 55, when: BROWSER_EDITOR_ACTIVE });

registerAction2(QuickOpenBrowserAction);
registerAction2(OpenIntegratedBrowserAction);
registerAction2(OpenOrListBrowsersAction);
registerAction2(NewTabAction);
registerAction2(CloseAllBrowserTabsAction);
registerAction2(CloseAllBrowserTabsInGroupAction);

registerAction2(class ToggleBrowserTitleBarButton extends ToggleTitleBarConfigAction {
	constructor() {
		super('workbench.browser.showInTitleBar', localize('toggle.browser', 'Integrated Browser'), localize('toggle.browserDescription', "Toggle visibility of the Integrated Browser button in title bar"), 8);
	}
});

/**
 * Tracks whether any browser editor is open across all editor groups and
 * keeps the `browserEditorOpen` context key in sync.
 */
class BrowserEditorOpenContextKeyContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.browserEditorOpenContextKey';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IBrowserViewWorkbenchService browserViewService: IBrowserViewWorkbenchService,
	) {
		super();

		const contextKey = CONTEXT_BROWSER_EDITOR_OPEN.bindTo(contextKeyService);
		const update = () => contextKey.set(browserViewService.getKnownBrowserViews().size > 0);

		update();
		this._register(browserViewService.onDidChangeBrowserViews(() => update()));
	}
}

registerWorkbenchContribution2(BrowserEditorOpenContextKeyContribution.ID, BrowserEditorOpenContextKeyContribution, WorkbenchPhase.AfterRestored);

/**
 * Opens localhost URLs in the Integrated Browser when the setting is enabled.
 */
class LocalhostLinkOpenerContribution extends Disposable implements IWorkbenchContribution, IExternalOpener {
	static readonly ID = 'workbench.contrib.localhostLinkOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		this._register(openerService.registerExternalOpener(this));
	}

	async openExternal(href: string, _ctx: { sourceUri: URI; preferredOpenerId?: string }, _token: CancellationToken): Promise<boolean> {
		if (!this.configurationService.getValue<boolean>('workbench.browser.openLocalhostLinks')) {
			return false;
		}

		try {
			const parsed = new URL(href);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				return false;
			}
			if (!isLocalhostAuthority(parsed.host)) {
				return false;
			}
		} catch {
			return false;
		}

		logBrowserOpen(this.telemetryService, 'localhostLinkOpener');

		// Check whether the setting was explicitly set by the user or is still at its default value.
		// When it is a default, tag the viewState so that the hint pill can be shown.
		const isDefaultLinkOpen = !isConfigured(this.configurationService.inspect('workbench.browser.openLocalhostLinks'));

		const browserUri = BrowserViewUri.forId(generateUuid());
		await this.editorService.openEditor({ resource: browserUri, options: { pinned: true, viewState: { url: href, isDefaultLinkOpen } } });
		return true;
	}
}

registerWorkbenchContribution2(LocalhostLinkOpenerContribution.ID, LocalhostLinkOpenerContribution, WorkbenchPhase.BlockStartup);

// ---- Link opened hint pill (URL bar widget) --------------------------------

const LOCALHOST_HINT_DISMISSED_KEY = 'workbench.browser.linkOpenedHintDismissed';

/**
 * A small pill shown in the URL bar that informs the user their link was opened
 * in the Integrated Browser by default. Clicking it shows a tooltip
 * with an explanation and options to open settings or dismiss permanently.
 */
class LinkOpenedHintPill extends BrowserEditorContribution {

	private readonly _pill: HTMLElement;
	private readonly _attentionTimeout = this._register(new MutableDisposable());

	constructor(
		editor: BrowserEditor,
		@IHoverService private readonly hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super(editor);

		this._pill = $('.browser-link-opened-hint-pill');
		this._pill.tabIndex = 0;
		this._pill.role = 'button';
		this._pill.ariaLabel = localize('browser.linkOpenedHint.ariaLabel', "This link opened in the integrated browser");
		this._pill.ariaHidden = 'true';

		const icon = $('span');
		icon.className = ThemeIcon.asClassName(Codicon.info);
		const label = $('span');
		label.textContent = localize('browser.linkOpenedHint.label', "Link opened here");

		this._pill.appendChild(icon);
		this._pill.appendChild(label);

		const hoverOptions = () => ({
			content: new MarkdownString(localize('browser.linkOpenedHint.detail', "**Integrated Browser**\n\nLocalhost links automatically open in the integrated browser.")),
			actions: [
				{
					label: localize('browser.linkOpenedHint.openSettings', "Open Settings"),
					commandId: 'workbench.action.openSettings',
					iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
					run: () => {
						this.preferencesService.openUserSettings({ query: 'workbench.browser.openLocalhostLinks' });
					}
				},
				{
					label: localize('browser.linkOpenedHint.dismiss', "Don't Show Again"),
					commandId: '',
					run: () => {
						this._dismiss();
					}
				}
			],
			position: { hoverPosition: HoverPosition.BELOW }
		});

		this._register(this.hoverService.setupDelayedHover(this._pill, hoverOptions, { setupKeyboardEvents: true }));
		this._register(addDisposableListener(this._pill, EventType.CLICK, () => {
			this.hoverService.showInstantHover({ ...hoverOptions(), target: this._pill, persistence: { sticky: true } }, true);
		}));
	}

	override get urlBarWidgets(): readonly IBrowserEditorWidgetContribution[] {
		return [{ element: this._pill, order: 100 }];
	}

	protected override subscribeToModel(_model: IBrowserViewModel, _store: DisposableStore, isNew: boolean): void {
		if (IsSessionsWindowContext.getValue(this.contextKeyService)) {
			this._setVisible(false);
			return;
		}

		const input = this.editor.input;
		if (input instanceof BrowserEditorInput && input.isDefaultLinkOpen) {
			const dismissed = this.storageService.getBoolean(LOCALHOST_HINT_DISMISSED_KEY, StorageScope.APPLICATION, false);
			this._setVisible(!dismissed);
			if (!dismissed && isNew) {
				this._callAttention();
			}
		} else {
			this._setVisible(false);
		}
	}

	override clear(): void {
		this._attentionTimeout.clear();
		this._setVisible(false);
	}

	private _setVisible(visible: boolean): void {
		if (!visible) {
			this._attentionTimeout.clear();
			this._pill.classList.remove('attention');
		}
		this._pill.classList.toggle('visible', visible);
		this._pill.ariaHidden = visible ? 'false' : 'true';
	}

	private _callAttention(): void {
		this._attentionTimeout.clear();
		this._pill.classList.remove('attention');
		// Start collapsed (icon only), expand after 300ms, then collapse back after another 2s
		this._attentionTimeout.value = disposableTimeout(() => {
			this._pill.classList.add('attention');
			this._attentionTimeout.value = disposableTimeout(() => {
				this._pill.classList.remove('attention');
			}, 2000);
		}, 300);
	}

	private _dismiss(): void {
		this.storageService.store(LOCALHOST_HINT_DISMISSED_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
		this._setVisible(false);
	}
}

BrowserEditor.registerContribution(LinkOpenedHintPill);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.browser.showInTitleBar': {
			type: ['boolean', 'string'],
			enum: [true, false, 'whenOpen'],
			enumDescriptions: [
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.showInTitleBar.true' }, 'The button is always shown in the title bar.'),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.showInTitleBar.false' }, 'The button is never shown in the title bar.'),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.showInTitleBar.whenOpen' }, 'The button is shown in the title bar when a browser editor is open.')
			],
			default: 'whenOpen',
			experiment: { mode: 'startup' },
			description: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.showInTitleBar' },
				'Controls whether the Integrated Browser button is shown in the title bar.'
			)
		},
		'workbench.browser.openLocalhostLinks': {
			type: 'boolean',
			default: false,
			experiment: { mode: 'startup' },
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.openLocalhostLinks' },
				'When enabled, localhost links from the terminal, chat, and other sources will open in the Integrated Browser instead of the system browser.'
			)
		}
	}
});
