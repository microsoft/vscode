/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IQuickInputService, QuickInputButtonLocation } from '../../../../../platform/quickinput/common/quickInput.js';
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
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { isLocalhostAuthority } from '../../../../../platform/url/common/trustedDomains.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { match } from '../../../../../base/common/glob.js';
const CONTEXT_BROWSER_EDITOR_OPEN = new RawContextKey('browserEditorOpen', false, localize('browser.editorOpen', "Whether any browser editor is currently open"));
const closeButtonItem = {
    iconClass: ThemeIcon.asClassName(Codicon.close),
    tooltip: localize('browser.closeTab', "Close")
};
const closeAllButtonItem = {
    iconClass: ThemeIcon.asClassName(Codicon.closeAll),
    tooltip: localize('browser.closeAllTabs', "Close All"),
    location: QuickInputButtonLocation.Inline
};
/**
 * Manages a quick pick that lists all open browser tabs grouped by editor group,
 * with close buttons, live updates, and an always-visible "New Integrated Browser Tab" entry.
 */
let BrowserTabQuickPick = class BrowserTabQuickPick extends Disposable {
    constructor(_editorService, _editorGroupsService, quickInputService, telemetryService) {
        super();
        this._editorService = _editorService;
        this._editorGroupsService = _editorGroupsService;
        this._itemListeners = this._register(new DisposableStore());
        this._openNewTabPick = {
            groupId: -1,
            editor: undefined,
            label: localize('browser.openNewTab', "New Integrated Browser Tab"),
            iconClass: ThemeIcon.asClassName(Codicon.add),
            alwaysShow: true,
        };
        this._quickPick = this._register(quickInputService.createQuickPick({ useSeparators: true }));
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
            for (const group of this._editorGroupsService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */)) {
                const browserEditors = group.editors.filter((e) => e instanceof BrowserEditorInput);
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
                this._quickPick.hide();
                await this._editorService.openEditor({
                    resource: BrowserViewUri.forId(generateUuid()),
                });
            }
            else {
                await this._editorService.openEditor(selected.editor, selected.groupId);
            }
        }));
        this._register(this._quickPick.onDidHide(() => this.dispose()));
    }
    show() {
        this._buildItems();
        // Pre-select the currently active browser editor
        const activeEditor = this._editorService.activeEditor;
        if (activeEditor instanceof BrowserEditorInput) {
            const activePick = this._quickPick.items
                .find((item) => item.type !== 'separator' && item.editor === activeEditor);
            if (activePick) {
                this._quickPick.activeItems = [activePick];
            }
        }
        this._quickPick.show();
    }
    _buildItems() {
        this._itemListeners.clear();
        // Remember which editor was active so we can restore selection
        const activeEditor = this._quickPick.activeItems[0]?.editor;
        const picks = [];
        const groups = this._editorGroupsService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */);
        const groupsWithBrowserEditors = groups
            .map(group => ({ group, browserEditors: group.editors.filter((e) => e instanceof BrowserEditorInput) }))
            .filter(({ browserEditors }) => browserEditors.length > 0);
        const multipleGroups = groupsWithBrowserEditors.length > 1;
        // Build a map of group ID to aria label for screen readers
        const mapGroupIdToGroupAriaLabel = new Map();
        for (const { group } of groupsWithBrowserEditors) {
            mapGroupIdToGroupAriaLabel.set(group.id, group.ariaLabel);
        }
        let newActivePick;
        for (const { group, browserEditors } of groupsWithBrowserEditors) {
            if (multipleGroups) {
                picks.push({ type: 'separator', label: group.label });
            }
            for (const editor of browserEditors) {
                const icon = editor.getIcon();
                const description = editor.getDescription();
                const nameAndDescription = description ? `${editor.getName()} ${description}` : editor.getName();
                const pick = {
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
                }
                else if (icon) {
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
};
BrowserTabQuickPick = __decorate([
    __param(0, IEditorService),
    __param(1, IEditorGroupsService),
    __param(2, IQuickInputService),
    __param(3, ITelemetryService)
], BrowserTabQuickPick);
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                // Note: on Linux this conflicts with the "toggle block comment" keybinding.
                //       it's not as problem at the moment becase oh the `when`, but worth noting for the future.
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */,
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
    run(accessor) {
        const picker = accessor.get(IInstantiationService).createInstance(BrowserTabQuickPick);
        picker.show();
    }
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
                ContextKeyExpr.equals('config.workbench.browser.showInTitleBar', 1), CONTEXT_BROWSER_EDITOR_OPEN.negate())
            }
        });
    }
    async run(accessor, urlOrOptions) {
        const editorService = accessor.get(IEditorService);
        const telemetryService = accessor.get(ITelemetryService);
        // Parse arguments
        const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : (urlOrOptions ?? {});
        const resource = BrowserViewUri.forId(generateUuid());
        const group = options.openToSide ? SIDE_GROUP : ACTIVE_GROUP;
        if (options.reuseUrlFilter) {
            const filterUri = URI.parse(options.reuseUrlFilter);
            const matchingEditor = editorService.editors.find((e) => {
                if (!(e instanceof BrowserEditorInput)) {
                    return false;
                }
                const editorUri = URI.parse(e.url || '');
                // URIs default to putting "file" scheme. Check that the scheme is really in the filter.
                if (filterUri.scheme && options.reuseUrlFilter.startsWith(`${filterUri.scheme}:`) && filterUri.scheme !== editorUri.scheme) {
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50, // Priority over search actions
                primary: 2048 /* KeyMod.CtrlCmd */ | 50 /* KeyCode.KeyT */,
            }
        });
    }
    async run(accessor, _browserEditor = accessor.get(IEditorService).activeEditorPane) {
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
    async run(accessor) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        for (const group of editorGroupsService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */)) {
            const browserEditors = group.getEditors(1 /* EditorsOrder.SEQUENTIAL */).filter((e) => e instanceof BrowserEditorInput);
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
    async run(accessor) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        const group = editorGroupsService.getGroup(editorService.activeEditorPane?.group?.id ?? editorGroupsService.activeGroup.id);
        if (!group) {
            return;
        }
        const browserEditors = group.getEditors(1 /* EditorsOrder.SEQUENTIAL */).filter((e) => e instanceof BrowserEditorInput);
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
let BrowserEditorOpenContextKeyContribution = class BrowserEditorOpenContextKeyContribution extends Disposable {
    static { this.ID = 'workbench.contrib.browserEditorOpenContextKey'; }
    constructor(contextKeyService, editorService) {
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
};
BrowserEditorOpenContextKeyContribution = __decorate([
    __param(0, IContextKeyService),
    __param(1, IEditorService)
], BrowserEditorOpenContextKeyContribution);
registerWorkbenchContribution2(BrowserEditorOpenContextKeyContribution.ID, BrowserEditorOpenContextKeyContribution, 3 /* WorkbenchPhase.AfterRestored */);
/**
 * Opens localhost URLs in the Integrated Browser when the setting is enabled.
 */
let LocalhostLinkOpenerContribution = class LocalhostLinkOpenerContribution extends Disposable {
    static { this.ID = 'workbench.contrib.localhostLinkOpener'; }
    constructor(openerService, configurationService, editorService, telemetryService) {
        super();
        this.configurationService = configurationService;
        this.editorService = editorService;
        this.telemetryService = telemetryService;
        this._register(openerService.registerExternalOpener(this));
    }
    async openExternal(href, _ctx, _token) {
        if (!this.configurationService.getValue('workbench.browser.openLocalhostLinks')) {
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
        }
        catch {
            return false;
        }
        logBrowserOpen(this.telemetryService, 'localhostLinkOpener');
        const browserUri = BrowserViewUri.forId(generateUuid());
        await this.editorService.openEditor({ resource: browserUri, options: { pinned: true, viewState: { url: href } } });
        return true;
    }
};
LocalhostLinkOpenerContribution = __decorate([
    __param(0, IOpenerService),
    __param(1, IConfigurationService),
    __param(2, IEditorService),
    __param(3, ITelemetryService)
], LocalhostLinkOpenerContribution);
registerWorkbenchContribution2(LocalhostLinkOpenerContribution.ID, LocalhostLinkOpenerContribution, 1 /* WorkbenchPhase.BlockStartup */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
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
            description: localize({ comment: ['This is the description for a setting.'], key: 'browser.showInTitleBar' }, 'Controls whether the Integrated Browser button is shown in the title bar.')
        },
        'workbench.browser.openLocalhostLinks': {
            type: 'boolean',
            default: false,
            experiment: { mode: 'startup' },
            markdownDescription: localize({ comment: ['This is the description for a setting.'], key: 'browser.openLocalhostLinks' }, 'When enabled, localhost links from the terminal, chat, and other sources will open in the Integrated Browser instead of the system browser.')
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclRhYk1hbmFnZW1lbnRGZWF0dXJlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvZmVhdHVyZXMvYnJvd3NlclRhYk1hbmFnZW1lbnRGZWF0dXJlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuSCxPQUFPLEVBQW9CLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFHeEgsT0FBTyxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0csT0FBTyxFQUFFLG9CQUFvQixFQUFlLE1BQU0sMkRBQTJELENBQUM7QUFFOUcsT0FBTyxFQUFFLGtCQUFrQixFQUEwRCx3QkFBd0IsRUFBYyxNQUFNLHlEQUF5RCxDQUFDO0FBQzNMLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxv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