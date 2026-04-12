/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Action, Separator, SubmenuAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { TaskExecutionSupportedContext } from '../../tasks/common/taskService.js';
import { TERMINAL_VIEW_ID } from '../common/terminal.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { terminalStrings } from '../common/terminalStrings.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { HasSpeechProvider } from '../../speech/common/speechService.js';
import { hasKey } from '../../../../base/common/types.js';
export var TerminalContextMenuGroup;
(function (TerminalContextMenuGroup) {
    TerminalContextMenuGroup["Chat"] = "0_chat";
    TerminalContextMenuGroup["Create"] = "1_create";
    TerminalContextMenuGroup["Edit"] = "3_edit";
    TerminalContextMenuGroup["Clear"] = "5_clear";
    TerminalContextMenuGroup["Kill"] = "7_kill";
    TerminalContextMenuGroup["Config"] = "9_config";
})(TerminalContextMenuGroup || (TerminalContextMenuGroup = {}));
export var TerminalMenuBarGroup;
(function (TerminalMenuBarGroup) {
    TerminalMenuBarGroup["Create"] = "1_create";
    TerminalMenuBarGroup["Run"] = "3_run";
    TerminalMenuBarGroup["Manage"] = "5_manage";
    TerminalMenuBarGroup["Configure"] = "7_configure";
})(TerminalMenuBarGroup || (TerminalMenuBarGroup = {}));
export function setupTerminalMenus() {
    MenuRegistry.appendMenuItems([
        {
            id: MenuId.MenubarTerminalMenu,
            item: {
                group: "1_create" /* TerminalMenuBarGroup.Create */,
                command: {
                    id: "workbench.action.terminal.new" /* TerminalCommandId.New */,
                    title: localize({ key: 'miNewTerminal', comment: ['&& denotes a mnemonic'] }, "&&New Terminal")
                },
                order: 1
            }
        },
        {
            id: MenuId.MenubarTerminalMenu,
            item: {
                group: "1_create" /* TerminalMenuBarGroup.Create */,
                command: {
                    id: "workbench.action.terminal.newInNewWindow" /* TerminalCommandId.NewInNewWindow */,
                    title: localize({ key: 'miNewInNewWindow', comment: ['&& denotes a mnemonic'] }, "New Terminal &&Window"),
                    precondition: ContextKeyExpr.has("terminalIsOpen" /* TerminalContextKeyStrings.IsOpen */)
                },
                order: 2,
                when: TerminalContextKeys.processSupported
            }
        },
        {
            id: MenuId.MenubarTerminalMenu,
            item: {
                group: "1_create" /* TerminalMenuBarGroup.Create */,
                command: {
                    id: "workbench.action.terminal.split" /* TerminalCommandId.Split */,
                    title: localize({ key: 'miSplitTerminal', comment: ['&& denotes a mnemonic'] }, "&&Split Terminal"),
                    precondition: ContextKeyExpr.has("terminalIsOpen" /* TerminalContextKeyStrings.IsOpen */)
                },
                order: 2,
                when: TerminalContextKeys.processSupported
            }
        },
        {
            id: MenuId.MenubarTerminalMenu,
            item: {
                group: "3_run" /* TerminalMenuBarGroup.Run */,
                command: {
                    id: "workbench.action.terminal.runActiveFile" /* TerminalCommandId.RunActiveFile */,
                    title: localize({ key: 'miRunActiveFile', comment: ['&& denotes a mnemonic'] }, "Run &&Active File")
                },
                order: 3,
                when: TerminalContextKeys.processSupported
            }
        },
        {
            id: MenuId.MenubarTerminalMenu,
            item: {
                group: "3_run" /* TerminalMenuBarGroup.Run */,
                command: {
                    id: "workbench.action.terminal.runSelectedText" /* TerminalCommandId.RunSelectedText */,
                    title: localize({ key: 'miRunSelectedText', comment: ['&& denotes a mnemonic'] }, "Run &&Selected Text")
                },
                order: 4,
                when: TerminalContextKeys.processSupported
            }
        },
    ]);
    MenuRegistry.appendMenuItems([
        {
            id: MenuId.TerminalInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.killViewOrEditor" /* TerminalCommandId.KillViewOrEditor */,
                    title: terminalStrings.kill.value,
                },
                group: "7_kill" /* TerminalContextMenuGroup.Kill */
            }
        },
        {
            id: MenuId.TerminalInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.copySelection" /* TerminalCommandId.CopySelection */,
                    title: localize('workbench.action.terminal.copySelection.short', "Copy")
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */,
                order: 1
            }
        },
        {
            id: MenuId.TerminalInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.copySelectionAsHtml" /* TerminalCommandId.CopySelectionAsHtml */,
                    title: localize('workbench.action.terminal.copySelectionAsHtml', "Copy as HTML")
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */,
                order: 2
            }
        },
        {
            id: MenuId.TerminalInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.paste" /* TerminalCommandId.Paste */,
                    title: localize('workbench.action.terminal.paste.short', "Paste")
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */,
                order: 3
            }
        },
        {
            id: MenuId.TerminalInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.clear" /* TerminalCommandId.Clear */,
                    title: localize('workbench.action.terminal.clear', "Clear")
                },
                group: "5_clear" /* TerminalContextMenuGroup.Clear */,
            }
        },
        {
            id: MenuId.TerminalInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.sizeToContentWidth" /* TerminalCommandId.SizeToContentWidth */,
                    title: terminalStrings.toggleSizeToContentWidth
                },
                group: "9_config" /* TerminalContextMenuGroup.Config */
            }
        },
        {
            id: MenuId.TerminalInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.selectAll" /* TerminalCommandId.SelectAll */,
                    title: localize('workbench.action.terminal.selectAll', "Select All"),
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */,
                order: 3
            }
        },
    ]);
    MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, {
        command: {
            id: "workbench.action.createTerminalEditorSameGroup" /* TerminalCommandId.CreateTerminalEditorSameGroup */,
            title: terminalStrings.new
        },
        group: '1_zzz_file',
        order: 30,
        when: TerminalContextKeys.processSupported
    });
    MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, {
        command: {
            id: "workbench.action.createTerminalEditorSameGroup" /* TerminalCommandId.CreateTerminalEditorSameGroup */,
            title: terminalStrings.new
        },
        group: '1_zzz_file',
        order: 30,
        when: TerminalContextKeys.processSupported
    });
    MenuRegistry.appendMenuItems([
        {
            id: MenuId.TerminalEditorInstanceContext,
            item: {
                group: "1_create" /* TerminalContextMenuGroup.Create */,
                command: {
                    id: "workbench.action.terminal.split" /* TerminalCommandId.Split */,
                    title: terminalStrings.split.value
                }
            }
        },
        {
            id: MenuId.TerminalEditorInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.new" /* TerminalCommandId.New */,
                    title: terminalStrings.new
                },
                group: "1_create" /* TerminalContextMenuGroup.Create */
            }
        },
        {
            id: MenuId.TerminalEditorInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.killEditor" /* TerminalCommandId.KillEditor */,
                    title: terminalStrings.kill.value
                },
                group: "7_kill" /* TerminalContextMenuGroup.Kill */
            }
        },
        {
            id: MenuId.TerminalEditorInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.copySelection" /* TerminalCommandId.CopySelection */,
                    title: localize('workbench.action.terminal.copySelection.short', "Copy")
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */,
                order: 1
            }
        },
        {
            id: MenuId.TerminalEditorInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.copySelectionAsHtml" /* TerminalCommandId.CopySelectionAsHtml */,
                    title: localize('workbench.action.terminal.copySelectionAsHtml', "Copy as HTML")
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */,
                order: 2
            }
        },
        {
            id: MenuId.TerminalEditorInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.paste" /* TerminalCommandId.Paste */,
                    title: localize('workbench.action.terminal.paste.short', "Paste")
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */,
                order: 3
            }
        },
        {
            id: MenuId.TerminalEditorInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.clear" /* TerminalCommandId.Clear */,
                    title: localize('workbench.action.terminal.clear', "Clear")
                },
                group: "5_clear" /* TerminalContextMenuGroup.Clear */,
            }
        },
        {
            id: MenuId.TerminalEditorInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.selectAll" /* TerminalCommandId.SelectAll */,
                    title: localize('workbench.action.terminal.selectAll', "Select All"),
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */,
                order: 3
            }
        },
        {
            id: MenuId.TerminalEditorInstanceContext,
            item: {
                command: {
                    id: "workbench.action.terminal.sizeToContentWidth" /* TerminalCommandId.SizeToContentWidth */,
                    title: terminalStrings.toggleSizeToContentWidth
                },
                group: "9_config" /* TerminalContextMenuGroup.Config */
            }
        }
    ]);
    MenuRegistry.appendMenuItems([
        {
            id: MenuId.TerminalTabEmptyAreaContext,
            item: {
                command: {
                    id: "workbench.action.terminal.newWithProfile" /* TerminalCommandId.NewWithProfile */,
                    title: localize('workbench.action.terminal.newWithProfile.short', "New Terminal With Profile...")
                },
                group: "1_create" /* TerminalContextMenuGroup.Create */
            }
        },
        {
            id: MenuId.TerminalTabEmptyAreaContext,
            item: {
                command: {
                    id: "workbench.action.terminal.new" /* TerminalCommandId.New */,
                    title: terminalStrings.new
                },
                group: "1_create" /* TerminalContextMenuGroup.Create */
            }
        }
    ]);
    MenuRegistry.appendMenuItems([
        {
            id: MenuId.TerminalNewDropdownContext,
            item: {
                command: {
                    id: "workbench.action.terminal.selectDefaultShell" /* TerminalCommandId.SelectDefaultProfile */,
                    title: localize2('workbench.action.terminal.selectDefaultProfile', 'Select Default Profile'),
                },
                group: '3_configure'
            }
        },
        {
            id: MenuId.TerminalNewDropdownContext,
            item: {
                command: {
                    id: "workbench.action.terminal.openSettings" /* TerminalCommandId.ConfigureTerminalSettings */,
                    title: localize('workbench.action.terminal.openSettings', "Configure Terminal Settings")
                },
                group: '3_configure'
            }
        },
        {
            id: MenuId.TerminalNewDropdownContext,
            item: {
                command: {
                    id: 'workbench.action.tasks.runTask',
                    title: localize('workbench.action.tasks.runTask', "Run Task...")
                },
                when: TaskExecutionSupportedContext,
                group: '4_tasks',
                order: 1
            },
        },
        {
            id: MenuId.TerminalNewDropdownContext,
            item: {
                command: {
                    id: 'workbench.action.tasks.configureTaskRunner',
                    title: localize('workbench.action.tasks.configureTaskRunner', "Configure Tasks...")
                },
                when: TaskExecutionSupportedContext,
                group: '4_tasks',
                order: 2
            },
        }
    ]);
    MenuRegistry.appendMenuItems([
        {
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.switchTerminal" /* TerminalCommandId.SwitchTerminal */,
                    title: localize2('workbench.action.terminal.switchTerminal', 'Switch Terminal')
                },
                group: 'navigation',
                order: 0,
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', TERMINAL_VIEW_ID), ContextKeyExpr.not(`config.${"terminal.integrated.tabs.enabled" /* TerminalSettingId.TabsEnabled */}`)),
            }
        },
        {
            // This is used to show instead of tabs when there is only a single terminal
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.focus" /* TerminalCommandId.Focus */,
                    title: terminalStrings.focus
                },
                alt: {
                    id: "workbench.action.terminal.split" /* TerminalCommandId.Split */,
                    title: terminalStrings.split.value,
                    icon: Codicon.splitHorizontal
                },
                group: 'navigation',
                order: 0,
                when: ContextKeyExpr.and(ContextKeyExpr.not("hasHiddenChatTerminals" /* TerminalContribContextKeyStrings.ChatHasHiddenTerminals */), ContextKeyExpr.equals('view', TERMINAL_VIEW_ID), ContextKeyExpr.has(`config.${"terminal.integrated.tabs.enabled" /* TerminalSettingId.TabsEnabled */}`), ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.tabs.showActiveTerminal" /* TerminalSettingId.TabsShowActiveTerminal */}`, 'singleTerminal'), ContextKeyExpr.equals("terminalGroupCount" /* TerminalContextKeyStrings.GroupCount */, 1)), ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.tabs.showActiveTerminal" /* TerminalSettingId.TabsShowActiveTerminal */}`, 'singleTerminalOrNarrow'), ContextKeyExpr.or(ContextKeyExpr.equals("terminalGroupCount" /* TerminalContextKeyStrings.GroupCount */, 1), ContextKeyExpr.has("isTerminalTabsNarrow" /* TerminalContextKeyStrings.TabsNarrow */))), ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.tabs.showActiveTerminal" /* TerminalSettingId.TabsShowActiveTerminal */}`, 'singleGroup'), ContextKeyExpr.equals("terminalGroupCount" /* TerminalContextKeyStrings.GroupCount */, 1)), ContextKeyExpr.equals(`config.${"terminal.integrated.tabs.showActiveTerminal" /* TerminalSettingId.TabsShowActiveTerminal */}`, 'always'))),
            }
        },
        {
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.split" /* TerminalCommandId.Split */,
                    title: terminalStrings.split,
                    icon: Codicon.splitHorizontal
                },
                group: 'navigation',
                order: 2,
                when: TerminalContextKeys.shouldShowViewInlineActions
            }
        },
        {
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.kill" /* TerminalCommandId.Kill */,
                    title: terminalStrings.kill,
                    icon: Codicon.trash
                },
                group: 'navigation',
                order: 3,
                when: TerminalContextKeys.shouldShowViewInlineActions
            }
        },
        {
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.new" /* TerminalCommandId.New */,
                    title: terminalStrings.new,
                    icon: Codicon.plus
                },
                alt: {
                    id: "workbench.action.terminal.split" /* TerminalCommandId.Split */,
                    title: terminalStrings.split.value,
                    icon: Codicon.splitHorizontal
                },
                group: 'navigation',
                order: 0,
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', TERMINAL_VIEW_ID), ContextKeyExpr.or(TerminalContextKeys.webExtensionContributedProfile, TerminalContextKeys.processSupported))
            }
        },
        {
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.clear" /* TerminalCommandId.Clear */,
                    title: localize('workbench.action.terminal.clearLong', "Clear Terminal"),
                    icon: Codicon.clearAll
                },
                group: 'navigation',
                order: 6,
                when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
                isHiddenByDefault: true
            }
        },
        {
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.runActiveFile" /* TerminalCommandId.RunActiveFile */,
                    title: localize('workbench.action.terminal.runActiveFile', "Run Active File"),
                    icon: Codicon.run
                },
                group: 'navigation',
                order: 7,
                when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
                isHiddenByDefault: true
            }
        },
        {
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.runSelectedText" /* TerminalCommandId.RunSelectedText */,
                    title: localize('workbench.action.terminal.runSelectedText', "Run Selected Text"),
                    icon: Codicon.selection
                },
                group: 'navigation',
                order: 8,
                when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
                isHiddenByDefault: true
            },
        },
        {
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.startVoice" /* TerminalCommandId.StartVoice */,
                    title: localize('workbench.action.terminal.startVoice', "Start Dictation"),
                },
                group: 'navigation',
                order: 9,
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', TERMINAL_VIEW_ID), TerminalContextKeys.terminalDictationInProgress.toNegated()),
                isHiddenByDefault: true
            },
        },
        {
            id: MenuId.ViewTitle,
            item: {
                command: {
                    id: "workbench.action.terminal.stopVoice" /* TerminalCommandId.StopVoice */,
                    title: localize('workbench.action.terminal.stopVoice', "Stop Dictation"),
                },
                group: 'navigation',
                order: 9,
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', TERMINAL_VIEW_ID), TerminalContextKeys.terminalDictationInProgress),
                isHiddenByDefault: true
            },
        },
    ]);
    MenuRegistry.appendMenuItems([
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.splitActiveTab" /* TerminalCommandId.SplitActiveTab */,
                    title: terminalStrings.split.value,
                },
                group: "1_create" /* TerminalContextMenuGroup.Create */,
                order: 1
            }
        },
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.moveToEditor" /* TerminalCommandId.MoveToEditor */,
                    title: terminalStrings.moveToEditor.value
                },
                group: "1_create" /* TerminalContextMenuGroup.Create */,
                order: 2
            }
        },
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.moveIntoNewWindow" /* TerminalCommandId.MoveIntoNewWindow */,
                    title: terminalStrings.moveIntoNewWindow.value
                },
                group: "1_create" /* TerminalContextMenuGroup.Create */,
                order: 2
            }
        },
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.renameActiveTab" /* TerminalCommandId.RenameActiveTab */,
                    title: localize('workbench.action.terminal.renameInstance', "Rename...")
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */
            }
        },
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.changeIconActiveTab" /* TerminalCommandId.ChangeIconActiveTab */,
                    title: localize('workbench.action.terminal.changeIcon', "Change Icon...")
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */
            }
        },
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.changeColorActiveTab" /* TerminalCommandId.ChangeColorActiveTab */,
                    title: localize('workbench.action.terminal.changeColor', "Change Color...")
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */
            }
        },
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.sizeToContentWidth" /* TerminalCommandId.SizeToContentWidth */,
                    title: terminalStrings.toggleSizeToContentWidth
                },
                group: "3_edit" /* TerminalContextMenuGroup.Edit */
            }
        },
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.joinActiveTab" /* TerminalCommandId.JoinActiveTab */,
                    title: localize('workbench.action.terminal.joinInstance', "Join Terminals")
                },
                when: TerminalContextKeys.tabsSingularSelection.toNegated(),
                group: "9_config" /* TerminalContextMenuGroup.Config */
            }
        },
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.unsplit" /* TerminalCommandId.Unsplit */,
                    title: terminalStrings.unsplit.value
                },
                when: ContextKeyExpr.and(TerminalContextKeys.tabsSingularSelection, TerminalContextKeys.splitTerminalTabFocused),
                group: "9_config" /* TerminalContextMenuGroup.Config */
            }
        },
        {
            id: MenuId.TerminalTabContext,
            item: {
                command: {
                    id: "workbench.action.terminal.killActiveTab" /* TerminalCommandId.KillActiveTab */,
                    title: terminalStrings.kill.value
                },
                group: "7_kill" /* TerminalContextMenuGroup.Kill */,
            }
        }
    ]);
    MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
        command: {
            id: "workbench.action.terminal.moveToTerminalPanel" /* TerminalCommandId.MoveToTerminalPanel */,
            title: terminalStrings.moveToTerminalPanel
        },
        when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
        group: '2_files'
    });
    MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
        command: {
            id: "workbench.action.terminal.rename" /* TerminalCommandId.Rename */,
            title: terminalStrings.rename
        },
        when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
        group: '2_files'
    });
    MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
        command: {
            id: "workbench.action.terminal.changeColor" /* TerminalCommandId.ChangeColor */,
            title: terminalStrings.changeColor
        },
        when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
        group: '2_files'
    });
    MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
        command: {
            id: "workbench.action.terminal.changeIcon" /* TerminalCommandId.ChangeIcon */,
            title: terminalStrings.changeIcon
        },
        when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
        group: '2_files'
    });
    MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
        command: {
            id: "workbench.action.terminal.sizeToContentWidth" /* TerminalCommandId.SizeToContentWidth */,
            title: terminalStrings.toggleSizeToContentWidth
        },
        when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
        group: '2_files'
    });
    for (const menuId of [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle]) {
        MenuRegistry.appendMenuItem(menuId, {
            command: {
                id: "workbench.action.createTerminalEditorSameGroup" /* TerminalCommandId.CreateTerminalEditorSameGroup */,
                title: terminalStrings.new,
                icon: Codicon.plus
            },
            alt: {
                id: "workbench.action.terminal.split" /* TerminalCommandId.Split */,
                title: terminalStrings.split.value,
                icon: Codicon.splitHorizontal
            },
            group: 'navigation',
            order: 0,
            when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal)
        });
        MenuRegistry.appendMenuItem(menuId, {
            command: {
                id: "workbench.action.terminal.clear" /* TerminalCommandId.Clear */,
                title: localize('workbench.action.terminal.clearLong', "Clear Terminal"),
                icon: Codicon.clearAll
            },
            group: 'navigation',
            order: 6,
            when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
            isHiddenByDefault: true
        });
        MenuRegistry.appendMenuItem(menuId, {
            command: {
                id: "workbench.action.terminal.runActiveFile" /* TerminalCommandId.RunActiveFile */,
                title: localize('workbench.action.terminal.runActiveFile', "Run Active File"),
                icon: Codicon.run
            },
            group: 'navigation',
            order: 7,
            when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
            isHiddenByDefault: true
        });
        MenuRegistry.appendMenuItem(menuId, {
            command: {
                id: "workbench.action.terminal.runSelectedText" /* TerminalCommandId.RunSelectedText */,
                title: localize('workbench.action.terminal.runSelectedText', "Run Selected Text"),
                icon: Codicon.selection
            },
            group: 'navigation',
            order: 8,
            when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
            isHiddenByDefault: true
        });
        MenuRegistry.appendMenuItem(menuId, {
            command: {
                id: "workbench.action.terminal.startVoice" /* TerminalCommandId.StartVoice */,
                title: localize('workbench.action.terminal.startVoiceEditor', "Start Dictation"),
                icon: Codicon.mic
            },
            group: 'navigation',
            order: 9,
            when: ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal), TerminalContextKeys.terminalDictationInProgress.negate()),
            isHiddenByDefault: true
        });
        MenuRegistry.appendMenuItem(menuId, {
            command: {
                id: "workbench.action.terminal.stopVoice" /* TerminalCommandId.StopVoice */,
                title: localize('workbench.action.terminal.stopVoiceEditor', "Stop Dictation"),
                icon: Codicon.run
            },
            group: 'navigation',
            order: 10,
            when: ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal), HasSpeechProvider, TerminalContextKeys.terminalDictationInProgress),
            isHiddenByDefault: true
        });
    }
}
export function getTerminalActionBarArgs(location, profiles, defaultProfileName, contributedProfiles, terminalService, dropdownMenu, disposableStore) {
    profiles = profiles.filter(e => !e.isAutoDetected);
    const [aiProfiles, otherProfiles] = splitProfiles(profiles);
    const [aiContributedProfiles, otherContributedProfiles] = splitContributedProfiles(contributedProfiles);
    const dropdownActions = [];
    const submenuActions = [];
    const splitLocation = (location === TerminalLocation.Editor || (typeof location === 'object' && hasKey(location, { viewColumn: true }) && location.viewColumn === ACTIVE_GROUP)) ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
    if (location === TerminalLocation.Editor) {
        location = { viewColumn: ACTIVE_GROUP };
    }
    dropdownActions.push(disposableStore.add(new Action("workbench.action.terminal.new" /* TerminalCommandId.New */, terminalStrings.new, undefined, true, () => terminalService.createAndFocusTerminal())));
    dropdownActions.push(disposableStore.add(new Action("workbench.action.terminal.newInNewWindow" /* TerminalCommandId.NewInNewWindow */, terminalStrings.newInNewWindow.value, undefined, true, () => terminalService.createAndFocusTerminal({
        location: {
            viewColumn: AUX_WINDOW_GROUP,
            auxiliary: { compact: true },
        }
    }))));
    dropdownActions.push(disposableStore.add(new Action("workbench.action.terminal.split" /* TerminalCommandId.Split */, terminalStrings.split.value, undefined, true, () => terminalService.createAndFocusTerminal({
        location: splitLocation
    }))));
    dropdownActions.push(new Separator());
    for (const p of aiProfiles) {
        addProfileActions(p, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
    }
    for (const contributed of aiContributedProfiles) {
        addContributedProfileActions(contributed, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
    }
    if ((aiProfiles.length > 0 || aiContributedProfiles.length > 0) && (otherProfiles.length > 0 || otherContributedProfiles.length > 0)) {
        dropdownActions.push(new Separator());
    }
    for (const p of otherProfiles) {
        addProfileActions(p, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
    }
    for (const contributed of otherContributedProfiles) {
        addContributedProfileActions(contributed, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
    }
    if (dropdownActions.length > 0) {
        dropdownActions.push(new SubmenuAction('split.profile', localize('split.profile', 'Split Terminal with Profile'), submenuActions));
        dropdownActions.push(new Separator());
    }
    const actions = dropdownMenu.getActions();
    dropdownActions.push(...Separator.join(...actions.map(a => a[1])));
    const dropdownAction = disposableStore.add(new Action('refresh profiles', localize('launchProfile', 'Launch Profile...'), 'codicon-chevron-down', true));
    return { dropdownAction, dropdownMenuActions: dropdownActions, className: `terminal-tab-actions-${terminalService.resolveLocation(location)}` };
}
function splitProfiles(profiles) {
    const aiProfiles = [];
    const otherProfiles = [];
    for (const profile of profiles) {
        if (isAiProfileName(profile.profileName)) {
            aiProfiles.push(profile);
        }
        else {
            otherProfiles.push(profile);
        }
    }
    return [aiProfiles, otherProfiles];
}
function splitContributedProfiles(contributedProfiles) {
    const aiContributedProfiles = [];
    const otherContributedProfiles = [];
    for (const profile of contributedProfiles) {
        if (isAiContributedProfile(profile)) {
            aiContributedProfiles.push(profile);
        }
        else {
            otherContributedProfiles.push(profile);
        }
    }
    return [aiContributedProfiles, otherContributedProfiles];
}
function isAiContributedProfile(profile) {
    const extensionIdentifier = profile.extensionIdentifier.toLowerCase();
    if (extensionIdentifier === 'github.copilot-chat' || extensionIdentifier === 'anthropic.claude-code') {
        return true;
    }
    return isAiProfileName(profile.title);
}
function isAiProfileName(name) {
    const lowerCaseName = name.toLowerCase();
    return lowerCaseName.includes('copilot') || lowerCaseName.includes('claude');
}
function addProfileActions(profile, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore) {
    const isDefault = profile.profileName === defaultProfileName;
    const options = { config: profile, location };
    const splitOptions = { config: profile, location: splitLocation };
    const sanitizedProfileName = profile.profileName.replace(/[\n\r\t]/g, '');
    dropdownActions.push(disposableStore.add(new Action("workbench.action.terminal.newWithProfile" /* TerminalCommandId.NewWithProfile */, isDefault ? localize('defaultTerminalProfile', "{0} (Default)", sanitizedProfileName) : sanitizedProfileName, undefined, true, async () => {
        await terminalService.createAndFocusTerminal(options);
    })));
    submenuActions.push(disposableStore.add(new Action("workbench.action.terminal.split" /* TerminalCommandId.Split */, isDefault ? localize('defaultTerminalProfile', "{0} (Default)", sanitizedProfileName) : sanitizedProfileName, undefined, true, async () => {
        await terminalService.createAndFocusTerminal(splitOptions);
    })));
}
function addContributedProfileActions(contributed, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore) {
    const isDefault = contributed.title === defaultProfileName;
    const title = isDefault ? localize('defaultTerminalProfile', "{0} (Default)", contributed.title.replace(/[\n\r\t]/g, '')) : contributed.title.replace(/[\n\r\t]/g, '');
    dropdownActions.push(disposableStore.add(new Action('contributed', title, undefined, true, () => terminalService.createAndFocusTerminal({
        config: {
            extensionIdentifier: contributed.extensionIdentifier,
            id: contributed.id,
            title
        },
        location
    }))));
    submenuActions.push(disposableStore.add(new Action('contributed-split', title, undefined, true, () => terminalService.createAndFocusTerminal({
        config: {
            extensionIdentifier: contributed.extensionIdentifier,
            id: contributed.id,
            title
        },
        location: splitLocation
    }))));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxNZW51cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxNZW51cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFXLFNBQVMsRUFBRSxhQUFhLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFTLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUErQyxnQkFBZ0IsRUFBcUIsTUFBTSxrREFBa0QsQ0FBQztBQUNwSixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVsRixPQUFPLEVBQXFCLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUUsT0FBTyxFQUFFLG1CQUFtQixFQUE2QixNQUFNLGlDQUFpQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLFVBQVUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRTlHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxNQUFN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