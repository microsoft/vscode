/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../nls.js';
import { MenuId, Action2, registerAction2 } from '../../../platform/actions/common/actions.js';
import { KeybindingsRegistry } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, ItemActivation, QuickInputHideReason } from '../../../platform/quickinput/common/quickInput.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { CommandsRegistry, ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { inQuickPickContext, defaultQuickAccessContext, getQuickNavigateHandler } from '../quickaccess.js';
import { Codicon } from '../../../base/common/codicons.js';
const UNIFIED_AGENTS_BAR_SETTING = 'chat.unifiedAgentsBar.enabled';
//#region Quick access management commands and keys
const globalQuickAccessKeybinding = {
    primary: 2048 /* KeyMod.CtrlCmd */ | 46 /* KeyCode.KeyP */,
    secondary: [2048 /* KeyMod.CtrlCmd */ | 35 /* KeyCode.KeyE */],
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 46 /* KeyCode.KeyP */, secondary: undefined }
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.action.closeQuickOpen',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: inQuickPickContext,
    primary: 9 /* KeyCode.Escape */, secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */],
    handler: accessor => {
        const quickInputService = accessor.get(IQuickInputService);
        return quickInputService.cancel(QuickInputHideReason.Gesture);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.action.acceptSelectedQuickOpenItem',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: inQuickPickContext,
    primary: 0,
    handler: accessor => {
        const quickInputService = accessor.get(IQuickInputService);
        return quickInputService.accept();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.action.alternativeAcceptSelectedQuickOpenItem',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: inQuickPickContext,
    primary: 0,
    handler: accessor => {
        const quickInputService = accessor.get(IQuickInputService);
        return quickInputService.accept({ ctrlCmd: true, alt: false, shift: false });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.action.focusQuickOpen',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: inQuickPickContext,
    primary: 0,
    handler: accessor => {
        const quickInputService = accessor.get(IQuickInputService);
        quickInputService.focus();
    }
});
const quickAccessNavigateNextInFilePickerId = 'workbench.action.quickOpenNavigateNextInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: quickAccessNavigateNextInFilePickerId,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
    handler: getQuickNavigateHandler(quickAccessNavigateNextInFilePickerId, true),
    when: defaultQuickAccessContext,
    primary: globalQuickAccessKeybinding.primary,
    secondary: globalQuickAccessKeybinding.secondary,
    mac: globalQuickAccessKeybinding.mac
});
const quickAccessNavigatePreviousInFilePickerId = 'workbench.action.quickOpenNavigatePreviousInFilePicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: quickAccessNavigatePreviousInFilePickerId,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
    handler: getQuickNavigateHandler(quickAccessNavigatePreviousInFilePickerId, false),
    when: defaultQuickAccessContext,
    primary: globalQuickAccessKeybinding.primary | 1024 /* KeyMod.Shift */,
    secondary: [globalQuickAccessKeybinding.secondary[0] | 1024 /* KeyMod.Shift */],
    mac: {
        primary: globalQuickAccessKeybinding.mac.primary | 1024 /* KeyMod.Shift */,
        secondary: undefined
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.action.quickPickManyToggle',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: inQuickPickContext,
    primary: 0,
    handler: accessor => {
        const quickInputService = accessor.get(IQuickInputService);
        quickInputService.toggle();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.action.quickInputBack',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
    when: inQuickPickContext,
    primary: 0,
    win: { primary: 512 /* KeyMod.Alt */ | 15 /* KeyCode.LeftArrow */ },
    mac: { primary: 256 /* KeyMod.WinCtrl */ | 88 /* KeyCode.Minus */ },
    linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 88 /* KeyCode.Minus */ },
    handler: accessor => {
        const quickInputService = accessor.get(IQuickInputService);
        quickInputService.back();
    }
});
registerAction2(class QuickAccessAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.quickOpen',
            title: localize2('quickOpen', "Go to File..."),
            metadata: {
                description: `Quick access`,
                args: [{
                        name: 'prefix',
                        schema: {
                            'type': 'string'
                        }
                    }]
            },
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: globalQuickAccessKeybinding.primary,
                secondary: globalQuickAccessKeybinding.secondary,
                mac: globalQuickAccessKeybinding.mac
            },
            f1: true
        });
    }
    run(accessor, prefix) {
        const quickInputService = accessor.get(IQuickInputService);
        quickInputService.quickAccess.show(typeof prefix === 'string' ? prefix : undefined, { preserveValue: typeof prefix === 'string' /* preserve as is if provided */ });
    }
});
registerAction2(class QuickAccessAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.quickOpenWithModes',
            title: localize('quickOpenWithModes', "Quick Open"),
            icon: Codicon.search,
            menu: {
                id: MenuId.CommandCenterCenter,
                order: 100
            }
        });
    }
    async run(accessor) {
        const openClassicQuickAccess = () => {
            const quickInputService = accessor.get(IQuickInputService);
            const providerOptions = {
                includeHelp: true,
                from: 'commandCenter',
            };
            quickInputService.quickAccess.show(undefined, {
                preserveValue: true,
                providerOptions
            });
        };
        const configurationService = accessor.get(IConfigurationService);
        const commandService = accessor.get(ICommandService);
        const useUnifiedQuickAccess = configurationService.getValue(UNIFIED_AGENTS_BAR_SETTING) === true;
        if (useUnifiedQuickAccess) {
            try {
                await commandService.executeCommand('workbench.action.unifiedQuickAccess');
            }
            catch {
                openClassicQuickAccess();
            }
            return;
        }
        openClassicQuickAccess();
    }
});
CommandsRegistry.registerCommand('workbench.action.quickOpenPreviousEditor', async (accessor) => {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.quickAccess.show('', { itemActivation: ItemActivation.SECOND });
});
//#endregion
//#region Workbench actions
class BaseQuickAccessNavigateAction extends Action2 {
    constructor(id, title, next, quickNavigate, keybinding) {
        super({ id, title, f1: true, keybinding });
        this.id = id;
        this.next = next;
        this.quickNavigate = quickNavigate;
    }
    async run(accessor) {
        const keybindingService = accessor.get(IKeybindingService);
        const quickInputService = accessor.get(IQuickInputService);
        const keys = keybindingService.lookupKeybindings(this.id);
        const quickNavigate = this.quickNavigate ? { keybindings: keys } : undefined;
        quickInputService.navigate(this.next, quickNavigate);
    }
}
class QuickAccessNavigateNextAction extends BaseQuickAccessNavigateAction {
    constructor() {
        super('workbench.action.quickOpenNavigateNext', localize2('quickNavigateNext', 'Navigate Next in Quick Open'), true, true);
    }
}
class QuickAccessNavigatePreviousAction extends BaseQuickAccessNavigateAction {
    constructor() {
        super('workbench.action.quickOpenNavigatePrevious', localize2('quickNavigatePrevious', 'Navigate Previous in Quick Open'), false, true);
    }
}
class QuickAccessSelectNextAction extends BaseQuickAccessNavigateAction {
    constructor() {
        super('workbench.action.quickOpenSelectNext', localize2('quickSelectNext', 'Select Next in Quick Open'), true, false, {
            weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
            when: inQuickPickContext,
            primary: 0,
            mac: { primary: 256 /* KeyMod.WinCtrl */ | 44 /* KeyCode.KeyN */ }
        });
    }
}
class QuickAccessSelectPreviousAction extends BaseQuickAccessNavigateAction {
    constructor() {
        super('workbench.action.quickOpenSelectPrevious', localize2('quickSelectPrevious', 'Select Previous in Quick Open'), false, false, {
            weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
            when: inQuickPickContext,
            primary: 0,
            mac: { primary: 256 /* KeyMod.WinCtrl */ | 46 /* KeyCode.KeyP */ }
        });
    }
}
registerAction2(QuickAccessSelectNextAction);
registerAction2(QuickAccessSelectPreviousAction);
registerAction2(QuickAccessNavigateNextAction);
registerAction2(QuickAccessNavigatePreviousAction);
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tBY2Nlc3NBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvYWN0aW9ucy9xdWlja0FjY2Vzc0FjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUUvRixPQUFPLEVBQUUsbUJBQW1CLEVBQXFDLE1BQU0sNERBQTRELENBQUM7QUFDcEksT0FBTyxFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzdILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUVoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUseUJBQXlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUczRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsTUFBTSwwQkFBMEIsR0FBRywrQkFBK0IsQ0FBQztBQUVuRSxtREFBbUQ7QUFFbkQsTUFBTSwyQkFBMkIsR0FBRztJQUNuQyxPQUFPLEVBQUUsaURBQTZCO0lBQ3RDLFNBQVMsRUFBRSxDQUFDLGlEQUE2QixDQUFDO0lBQzFDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxpREFBNkIsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFO0NBQ3JFLENBQUM7QUFFRixtQkFBbUIs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