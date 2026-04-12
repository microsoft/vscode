/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { Extensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { HelpQuickAccessProvider } from '../../../../platform/quickinput/browser/helpQuickAccess.js';
import { ViewQuickAccessProvider, OpenViewPickerAction, QuickAccessViewPickerAction } from './viewQuickAccess.js';
import { CommandsQuickAccessProvider, ShowAllCommandsAction, ClearCommandHistoryAction } from './commandsQuickAccess.js';
import { MenuRegistry, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { inQuickPickContext, getQuickNavigateHandler } from '../../../browser/quickaccess.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
//#region Quick Access Proviers
const quickAccessRegistry = Registry.as(Extensions.Quickaccess);
quickAccessRegistry.registerQuickAccessProvider({
    ctor: HelpQuickAccessProvider,
    prefix: HelpQuickAccessProvider.PREFIX,
    placeholder: localize('helpQuickAccessPlaceholder', "Type '{0}' to get help on the actions you can take from here.", HelpQuickAccessProvider.PREFIX),
    helpEntries: [{
            description: localize('helpQuickAccess', "Show all Quick Access Providers"),
            commandCenterOrder: 70,
            commandCenterLabel: localize('more', 'More')
        }]
});
quickAccessRegistry.registerQuickAccessProvider({
    ctor: ViewQuickAccessProvider,
    prefix: ViewQuickAccessProvider.PREFIX,
    contextKey: 'inViewsPicker',
    placeholder: localize('viewQuickAccessPlaceholder', "Type the name of a view, output channel or terminal to open."),
    helpEntries: [{ description: localize('viewQuickAccess', "Open View"), commandId: OpenViewPickerAction.ID }]
});
quickAccessRegistry.registerQuickAccessProvider({
    ctor: CommandsQuickAccessProvider,
    prefix: CommandsQuickAccessProvider.PREFIX,
    contextKey: 'inCommandsPicker',
    placeholder: localize('commandsQuickAccessPlaceholder', "Type the name of a command to run."),
    helpEntries: [{ description: localize('commandsQuickAccess', "Show and Run Commands"), commandId: ShowAllCommandsAction.ID, commandCenterOrder: 20 }]
});
//#endregion
//#region Menu contributions
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
    group: '1_open',
    command: {
        id: ShowAllCommandsAction.ID,
        title: localize({ key: 'miCommandPalette', comment: ['&& denotes a mnemonic'] }, "&&Command Palette...")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
    group: '1_welcome',
    command: {
        id: ShowAllCommandsAction.ID,
        title: localize({ key: 'miShowAllCommands', comment: ['&& denotes a mnemonic'] }, "Show All Commands")
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
    group: '1_open',
    command: {
        id: OpenViewPickerAction.ID,
        title: localize({ key: 'miOpenView', comment: ['&& denotes a mnemonic'] }, "&&Open View...")
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
    group: '5_infile_nav',
    command: {
        id: 'workbench.action.gotoLine',
        title: localize({ key: 'miGotoLine', comment: ['&& denotes a mnemonic'] }, "Go to &&Line/Column...")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
    group: '1_command',
    command: {
        id: ShowAllCommandsAction.ID,
        title: localize('commandPalette', "Command Palette...")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
    group: 'z_commands',
    when: EditorContextKeys.editorSimpleInput.toNegated(),
    command: {
        id: ShowAllCommandsAction.ID,
        title: localize('commandPalette', "Command Palette..."),
    },
    order: 1
});
//#endregion
//#region Workbench actions and commands
registerAction2(ClearCommandHistoryAction);
registerAction2(ShowAllCommandsAction);
registerAction2(OpenViewPickerAction);
registerAction2(QuickAccessViewPickerAction);
const inViewsPickerContextKey = 'inViewsPicker';
const inViewsPickerContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(inViewsPickerContextKey));
const viewPickerKeybinding = QuickAccessViewPickerAction.KEYBINDING;
const quickAccessNavigateNextInViewPickerId = 'workbench.action.quickOpenNavigateNextInViewPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: quickAccessNavigateNextInViewPickerId,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
    handler: getQuickNavigateHandler(quickAccessNavigateNextInViewPickerId, true),
    when: inViewsPickerContext,
    primary: viewPickerKeybinding.primary,
    linux: viewPickerKeybinding.linux,
    mac: viewPickerKeybinding.mac
});
const quickAccessNavigatePreviousInViewPickerId = 'workbench.action.quickOpenNavigatePreviousInViewPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: quickAccessNavigatePreviousInViewPickerId,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
    handler: getQuickNavigateHandler(quickAccessNavigatePreviousInViewPickerId, false),
    when: inViewsPickerContext,
    primary: viewPickerKeybinding.primary | 1024 /* KeyMod.Shift */,
    linux: viewPickerKeybinding.linux,
    mac: {
        primary: viewPickerKeybinding.mac.primary | 1024 /* KeyMod.Shift */
    }
});
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tBY2Nlc3MuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcXVpY2thY2Nlc3MvYnJvd3Nlci9xdWlja0FjY2Vzcy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBd0IsVUFBVSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDekcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxvQkFBb0IsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ2xILE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxxQkFBcUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3pILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXZHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sK0RBQStELENBQUM7QUFDdEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFbkYsK0JBQStCO0FBRS9CLE1BQU0sbUJBQW1CLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBdUIsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBRXRGLG1CQUFtQixDQUFDLDJCQUEyQixDQUFDO0lBQy9DLElBQUksRUFBRSx1QkFBdUI7SUFDN0IsTUFBTSxFQUFFLHVCQUF1QixDQUFDLE1BQU07SUFDdEMsV0FBVyxFQUFFLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSwrREFBK0QsRUFBRSx1QkFBdUIsQ0FBQyxNQUFNLENBQUM7SUFDcEosV0FBVyxFQUFFLENBQUM7WUFDYixXQUFXLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixFQUFFLGlDQUFpQyxDQUFDO1lBQzNFLGtCQUFrQixFQUFFLEVBQUU7WUFDdEIsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7U0FDNUMsQ0FBQztDQUNGLENBQUMsQ0FBQztBQUVILG1CQUFtQixDQUFDLDJCQUEyQixDQUFDO0lBQy9DLElBQUksRUFBRSx1QkFBdUI7SUFDN0IsTUFBTSxFQUFFLHVCQUF1QixDQUFDLE1BQU07SUFDdEMsVUFBVSxFQUFFLGVBQWU7SUFDM0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSw4REFBOEQsQ0FBQztJQUNuSCxXQUFXLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLEVBQUUsU0FBUyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxDQUFDO0NBQzVHLENBQUMsQ0FBQztBQUVILG1CQUFtQixDQUFDLDJCQUEyQixDQUFDO0lBQy9DLElBQUksRUFBRSwyQkFBMkI7SUFDakMsTUFBTSxFQUFFLDJCQUEyQixDQUFDLE1BQU07SUFDMUMsVUFBVSxFQUFFLGtCQUFrQjtJQUM5QixXQUFXLEVBQUUsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLG9DQUFvQyxDQUFDO0lBQzdGLFdBQVcsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSx1QkFBdUIsQ0FBQyxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxFQUFFLENBQUM7Q0FDckosQ0FBQyxDQUFDO0FBRUgsWUFBWTtBQUdaLDRCQUE0QjtBQUU1QixZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFFBQVE7SUFDZixPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUscUJBQXFCLENBQUMsRUFBRTtRQUM1QixLQUFLLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxzQkFBc0IsQ0FBQztLQUN4RztJQUNELEtBQUssRUFBRSxDQUFDO0NBQ1IsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFO0lBQ25ELEtBQUssRUFBRSxXQUFXO0lBQ2xCLE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFO1FBQzVCLEtBQUssRUFBRSxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLG1CQUFtQixDQUFDO0tBQ3RHO0lBQ0QsS0FBSyxFQUFFLENBQUM7Q0FDUixDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFFBQVE7SUFDZixPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsb0JBQW9CLENBQUMsRUFBRTtRQUMzQixLQUFLLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLENBQUM7S0FDNUY7SUFDRCxLQUFLLEVBQUUsQ0FBQztDQUNSLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRTtJQUNqRCxLQUFLLEVBQUUsY0FBYztJQUNyQixPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsMkJBQTJCO1FBQy9CLEtBQUssRUFBRSxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSx3QkFBd0IsQ0FBQztLQUNwRztJQUNELEtBQUssRUFBRSxDQUFDO0NBQ1IsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFO0lBQ2xELEtBQUssRUFBRSxXQUFXO0lBQ2xCLE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFO1FBQzVCLEtBQUssRUFBRSxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsb0JBQW9CLENBQUM7S0FDdkQ7SUFDRCxLQUFLLEVBQUUsQ0FBQztDQUNSLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRTtJQUNqRCxLQUFLLEVBQUUsWUFBWTtJQUNuQixJQUFJLEVBQUUsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsU0FBUyxFQUFFO0lBQ3JELE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFO1FBQzVCLEtBQUssRUFBRSxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsb0JBQW9CLENBQUM7S0FDdkQ7SUFDRCxLQUFLLEVBQUUsQ0FBQztDQUNSLENBQUMsQ0FBQztBQUVILFlBQVk7QUFHWix3Q0FBd0M7QUFFeEMsZUFBZSxDQUFDLHlCQUF5QixDQUFDLENBQUM7QUFDM0MsZUFBZSxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDdkMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLENBQUM7QUFDdEMsZUFBZSxDQUFDLDJCQUEyQixDQUFDLENBQUM7QUFFN0MsTUFBTSx1QkFBdUIsR0FBRyxlQUFlLENBQUM7QUFDaEQsTUFBTSxvQkFBb0IsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO0FBQ2pILE1BQU0sb0JBQW9CLEdBQUcsMkJBQTJCLENBQUMsVUFBVSxDQUFDO0FBRXBFLE1BQU0scUNBQXFDLEdBQUcsb0RBQW9ELENBQUM7QUFDbkcsbUJBQW1CLENBQUMsZ0NBQWdDLENBQUM7SUFDcEQsRUFBRSxFQUFFLHFDQUFxQztJQUN6QyxNQUFNLEVBQUUsOENBQW9DLEVBQUU7SUFDOUMsT0FBTyxFQUFFLHVCQUF1QixDQUFDLHFDQUFxQyxFQUFFLElBQUksQ0FBQztJQUM3RSxJQUFJLEVBQUUsb0JBQW9CO0lBQzFCLE9BQU8sRUFBRSxvQkFBb0IsQ0FBQyxPQUFPO0lBQ3JDLEtBQUssRUFBRSxvQkFBb0IsQ0FBQyxLQUFLO0lBQ2pDLEdBQUcsRUFBRSxvQkFBb0IsQ0FBQyxHQUFHO0NBQzdCLENBQUMsQ0FBQztBQUVILE1BQU0seUNBQXlDLEdBQUcsd0RBQXdELENBQUM7QUFDM0csbUJBQW1CLENBQUMsZ0NBQWdDLENBQUM7SUFDcEQsRUFBRSxFQUFFLHlDQUF5QztJQUM3QyxNQUFNLEVBQUUsOENBQW9DLEVBQUU7SUFDOUMsT0FBTyxFQUFFLHVCQUF1QixDQUFDLHlDQUF5QyxFQUFFLEtBQUssQ0FBQztJQUNsRixJQUFJLEVBQUUsb0JBQW9CO0lBQzFCLE9BQU8sRUFBRSxvQkFBb0IsQ0FBQyxPQUFPLDBCQUFlO0lBQ3BELEtBQUssRUFBRSxvQkFBb0IsQ0FBQyxLQUFLO0lBQ2pDLEdBQUcsRUFBRTtRQUNKLE9BQU8sRUFBRSxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsT0FBTywwQkFBZTtLQUN4RDtDQUNELENBQUMsQ0FBQztBQUVILFlBQVkifQ==