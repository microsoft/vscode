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
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
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
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { IExternalOpener, IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { isLocalhostAuthority } from '../../../../../platform/url/common/trustedDomains.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';

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
	) {
		super();

		this._quickPick = this._register(quickInputService.createQuickPick<IBrowserQuickPickItem>({ useSeparators: true }));
		this._quickPick.placeholder = localize('browser.quickOpenPlaceholder', "Select a browser tab or enter a URL");
		this._quickPick.matchOnDescription = true;
		this._quickPick.sortByLabel = false;
		this._quickPick.buttons = [closeAllButtonItem];

		this._register(this._quickPick.onDidTriggerItemButton(async ({ item }) => {
			if (!item.editor) {
				return;
			}
			const group = this._editorGroupsService.getGroup(item.groupId);
			if (group) {
				await group.closeEditor(item.editor, {
					preserveFocus: true // Don't shift focus so the quickpick doesn't close
				});
			}
		}));

		this._register(this._quickPick.onDidTriggerButton(async () => {
			for (const group of this._editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
				const browserEditors = group.editors.filter((e): e is BrowserEditorInput => e instanceof BrowserEditorInput);
				if (browserEditors.length > 0) {
					await group.closeEditors(browserEditors, {
						preserveFocus: true // Don't shift focus so the quickpick doesn't close
					});
				}
			}
		}));

		this._register(this._quickPick.onDidAccept(async () => {
			const [selected] = this._quickPick.selectedItems;
			if (!selected) {
				return;
			}
			if (selected === this._openNewTabPick) {
				logBrowserOpen(telemetryService, 'quickOpenWithoutUrl');
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
		const multipleGroups = groupsWithBrowserEditors.length > 1;

		// Build a map of group ID to aria label for screen readers
		const mapGroupIdToGroupAriaLabel = new Map<GroupIdentifier, string>();
		for (const { group } of groupsWithBrowserEditors) {
			mapGroupIdToGroupAriaLabel.set(group.id, group.ariaLabel);
		}

		let newActivePick: IBrowserQuickPickItem | undefined;

		for (const { group, browserEditors } of groupsWithBrowserEditors) {
			if (multipleGroups) {
				picks.push({ type: 'separator', label: group.label });
			}
			for (const editor of browserEditors) {
				const icon = editor.getIcon();
				const description = editor.getDescription();
				const nameAndDescription = description ? `${editor.getName()} ${description}` : editor.getName();
				const pick: IBrowserQuickPickItem = {
					groupId: group.id,
					editor,
					label: editor.getName(),
					ariaLabel: multipleGroups
						? localize('browserEntryAriaLabelWithGroup', "{0}, {1}", nameAndDescription, mapGroupIdToGroupAriaLabel.get(group.id))
						: nameAndDescription,
					description,
					buttons: [closeButtonItem],
					italic: !group.isPinned(editor),
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
			this._itemListeners.add(group.onDidModelChange(() => this._buildItems()));
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
		const neverShowInTitleBar = ContextKeyExpr.equals('config.workbench.browser.showInTitleBar', false);
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
			menu: {
				id: MenuId.TitleBar,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.and(CONTEXT_BROWSER_EDITOR_OPEN, neverShowInTitleBar.negate()),
			}
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
}

class OpenIntegratedBrowserAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.Open,
			title: localize2('browser.openAction', "Open Integrated Browser"),
			category: BrowserActionCategory,
			icon: Codicon.globe,
			f1: true,
			menu: {
				id: MenuId.TitleBar,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.and(
					// This is a hack to work around `true` just testing for truthiness of the key. It works since `1 == true` in JS.
					ContextKeyExpr.equals('config.workbench.browser.showInTitleBar', 1),
					CONTEXT_BROWSER_EDITOR_OPEN.negate()
				)
			}
		});
	}

	async run(accessor: ServicesAccessor, urlOrOptions?: string | IOpenBrowserOptions): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const telemetryService = accessor.get(ITelemetryService);

		// Parse arguments
		const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : (urlOrOptions ?? {});
		const resource = BrowserViewUri.forId(generateUuid());
		const group = options.openToSide ? SIDE_GROUP : ACTIVE_GROUP;

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

// Register as "Close All Browser Tabs" action in editor title menu to align with the regular "Close All" action
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: BrowserViewCommandId.CloseAllInGroup, title: localize('browser.closeAllInGroupShort', "Close All Browser Tabs") }, group: '1_close', order: 55, when: BROWSER_EDITOR_ACTIVE });

registerAction2(QuickOpenBrowserAction);
registerAction2(OpenIntegratedBrowserAction);
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
		@IEditorService editorService: IEditorService,
	) {
		super();

		const contextKey = CONTEXT_BROWSER_EDITOR_OPEN.bindTo(contextKeyService);
		const update = () => contextKey.set(editorService.editors.some(e => e instanceof BrowserEditorInput));

		update();

		this._register(editorService.onWillOpenEditor(e => {
			if (e.editor instanceof BrowserEditorInput) {
				contextKey.set(true);
			}
		}));
		this._register(editorService.onDidCloseEditor(e => {
			if (e.editor instanceof BrowserEditorInput) {
				update();
			}
		}));
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

		const browserUri = BrowserViewUri.forId(generateUuid());
		await this.editorService.openEditor({ resource: browserUri, options: { pinned: true, viewState: { url: href } } });
		return true;
	}
}

registerWorkbenchContribution2(LocalhostLinkOpenerContribution.ID, LocalhostLinkOpenerContribution, WorkbenchPhase.BlockStartup);

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
