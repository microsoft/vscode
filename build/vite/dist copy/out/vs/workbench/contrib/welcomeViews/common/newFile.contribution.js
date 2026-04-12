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
var NewFileTemplatesManager_1;
import { promiseWithResolvers } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, IMenuService, MenuId, registerAction2, MenuRegistry, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
const builtInSource = localize('Built-In', "Built-In");
const category = localize2('Create', 'Create');
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'welcome.showNewFileEntries',
            title: localize2('welcome.newFile', 'New File...'),
            category,
            f1: true,
            precondition: IsSessionsWindowContext.negate(),
            keybinding: {
                primary: 512 /* KeyMod.Alt */ + 2048 /* KeyMod.CtrlCmd */ + 256 /* KeyMod.WinCtrl */ + 44 /* KeyCode.KeyN */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
            },
            menu: {
                id: MenuId.MenubarFileMenu,
                group: '1_new',
                order: 2,
                when: IsSessionsWindowContext.negate()
            }
        });
    }
    async run(accessor) {
        return assertReturnsDefined(NewFileTemplatesManager.Instance).run();
    }
});
let NewFileTemplatesManager = class NewFileTemplatesManager extends Disposable {
    static { NewFileTemplatesManager_1 = this; }
    constructor(quickInputService, contextKeyService, commandService, keybindingService, menuService) {
        super();
        this.quickInputService = quickInputService;
        this.contextKeyService = contextKeyService;
        this.commandService = commandService;
        this.keybindingService = keybindingService;
        NewFileTemplatesManager_1.Instance = this;
        this._register({ dispose() { if (NewFileTemplatesManager_1.Instance === this) {
                NewFileTemplatesManager_1.Instance = undefined;
            } } });
        this.menu = menuService.createMenu(MenuId.NewFile, contextKeyService);
    }
    allEntries() {
        const items = [];
        for (const [groupName, group] of this.menu.getActions({ renderShortTitle: true })) {
            for (const action of group) {
                if (action instanceof MenuItemAction) {
                    items.push({ commandID: action.item.id, from: action.item.source?.title ?? builtInSource, title: action.label, group: groupName });
                }
            }
        }
        return items;
    }
    async run() {
        const entries = this.allEntries();
        if (entries.length === 0) {
            throw Error('Unexpected empty new items list');
        }
        else if (entries.length === 1) {
            this.commandService.executeCommand(entries[0].commandID);
            return true;
        }
        else {
            return this.selectNewEntry(entries);
        }
    }
    async selectNewEntry(entries) {
        const { promise: resultPromise, resolve: resolveResult } = promiseWithResolvers();
        const disposables = new DisposableStore();
        const qp = this.quickInputService.createQuickPick({ useSeparators: true });
        qp.title = localize('newFileTitle', "New File...");
        qp.placeholder = localize('newFilePlaceholder', "Select File Type or Enter File Name...");
        qp.sortByLabel = false;
        qp.matchOnDetail = true;
        qp.matchOnDescription = true;
        const sortCategories = (a, b) => {
            const categoryPriority = { 'file': 1, 'notebook': 2 };
            if (categoryPriority[a.group] && categoryPriority[b.group]) {
                if (categoryPriority[a.group] !== categoryPriority[b.group]) {
                    return categoryPriority[b.group] - categoryPriority[a.group];
                }
            }
            else if (categoryPriority[a.group]) {
                return 1;
            }
            else if (categoryPriority[b.group]) {
                return -1;
            }
            if (a.from === builtInSource) {
                return 1;
            }
            if (b.from === builtInSource) {
                return -1;
            }
            return a.from.localeCompare(b.from);
        };
        const displayCategory = {
            'file': localize('file', "File"),
            'notebook': localize('notebook', "Notebook"),
        };
        const refreshQp = (entries) => {
            const items = [];
            let lastSeparator;
            entries
                .sort((a, b) => -sortCategories(a, b))
                .forEach((entry) => {
                const command = entry.commandID;
                const keybinding = this.keybindingService.lookupKeybinding(command || '', this.contextKeyService);
                if (lastSeparator !== entry.group) {
                    items.push({
                        type: 'separator',
                        label: displayCategory[entry.group] ?? entry.group
                    });
                    lastSeparator = entry.group;
                }
                items.push({
                    ...entry,
                    label: entry.title,
                    type: 'item',
                    keybinding,
                    buttons: command ? [
                        {
                            iconClass: 'codicon codicon-gear',
                            tooltip: localize('change keybinding', "Configure Keybinding")
                        }
                    ] : [],
                    detail: '',
                    description: entry.from,
                });
            });
            qp.items = items;
        };
        refreshQp(entries);
        disposables.add(this.menu.onDidChange(() => refreshQp(this.allEntries())));
        disposables.add(qp.onDidChangeValue((val) => {
            if (val === '') {
                refreshQp(entries);
                return;
            }
            const currentTextEntry = {
                commandID: 'workbench.action.files.newFile',
                commandArgs: { languageId: undefined, viewType: undefined, fileName: val },
                title: localize('miNewFileWithName', "Create New File ({0})", val),
                group: 'file',
                from: builtInSource,
            };
            refreshQp([currentTextEntry, ...entries]);
        }));
        disposables.add(qp.onDidAccept(async (e) => {
            const selected = qp.selectedItems[0];
            resolveResult(!!selected);
            qp.hide();
            if (selected) {
                await this.commandService.executeCommand(selected.commandID, selected.commandArgs);
            }
        }));
        disposables.add(qp.onDidHide(() => {
            qp.dispose();
            disposables.dispose();
            resolveResult(false);
        }));
        disposables.add(qp.onDidTriggerItemButton(e => {
            qp.hide();
            this.commandService.executeCommand('workbench.action.openGlobalKeybindings', e.item.commandID);
            resolveResult(false);
        }));
        qp.show();
        return resultPromise;
    }
};
NewFileTemplatesManager = NewFileTemplatesManager_1 = __decorate([
    __param(0, IQuickInputService),
    __param(1, IContextKeyService),
    __param(2, ICommandService),
    __param(3, IKeybindingService),
    __param(4, IMenuService)
], NewFileTemplatesManager);
Registry.as(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(NewFileTemplatesManager, 3 /* LifecyclePhase.Restored */);
MenuRegistry.appendMenuItem(MenuId.NewFile, {
    group: 'file',
    command: {
        id: 'workbench.action.files.newUntitledFile',
        title: localize('miNewFile2', "Text File")
    },
    order: 1
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV3RmlsZS5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lVmlld3MvY29tbW9uL25ld0ZpbGUuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBUyxZQUFZLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDckosT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBdUMsTUFBTSxzREFBc0QsQ0FBQztBQUMvSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsSUFBSSxtQkFBbUIsRUFBbUMsTUFBTSxrQ0FBa0MsQ0FBQztBQUd0SCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQ3ZE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