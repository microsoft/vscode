/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action, IAction, Separator, SubmenuAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { localize, localize2 } from '../../../../nls.js';
import { IMenu, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionTerminalProfile, ITerminalProfile, TerminalLocation, TerminalSettingId } from '../../../../platform/terminal/common/terminal.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { TaskExecutionSupportedContext } from '../../tasks/common/taskService.js';
import { ICreateTerminalOptions, ITerminalLocationOptions, ITerminalService } from './terminal.js';
import { TerminalCommandId, TERMINAL_VIEW_ID } from '../common/terminal.js';
import { TerminalContextKeys, TerminalContextKeyStrings } from '../common/terminalContextKey.js';
import { terminalStrings } from '../common/terminalStrings.js';
import { ACTIVE_GROUP, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';

const enum ContextMenuGroup {
	Create = '1_create',
	Edit = '3_edit',
	Clear = '5_clear',
	Kill = '7_kill',
	Config = '9_config'
}

export const enum TerminalMenuBarGroup {
	Create = '1_create',
	Run = '3_run',
	Manage = '5_manage',
	Configure = '7_configure'
}

export function setupTerminalMenus(): void {
	MenuRegistry.appendMenuItems(
		[
			{
				id: MenuId.MenubarTerminalMenu,
				item: {
					group: TerminalMenuBarGroup.Create,
					command: {
						id: TerminalCommandId.New,
						title: localize({ key: 'miNewTerminal', comment: ['&& denotes a mnemonic'] }, "&&New Terminal")
					},
					order: 1
				}
			},
			{
				id: MenuId.MenubarTerminalMenu,
				item: {
					group: TerminalMenuBarGroup.Create,
					command: {
						id: TerminalCommandId.Split,
						title: localize({ key: 'miSplitTerminal', comment: ['&& denotes a mnemonic'] }, "&&Split Terminal"),
						precondition: ContextKeyExpr.has(TerminalContextKeyStrings.IsOpen)
					},
					order: 2,
					when: TerminalContextKeys.processSupported
				}
			},
			{
				id: MenuId.MenubarTerminalMenu,
				item: {
					group: TerminalMenuBarGroup.Run,
					command: {
						id: TerminalCommandId.RunActiveFile,
						title: localize({ key: 'miRunActiveFile', comment: ['&& denotes a mnemonic'] }, "Run &&Active File")
					},
					order: 3,
					when: TerminalContextKeys.processSupported
				}
			},
			{
				id: MenuId.MenubarTerminalMenu,
				item: {
					group: TerminalMenuBarGroup.Run,
					command: {
						id: TerminalCommandId.RunSelectedText,
						title: localize({ key: 'miRunSelectedText', comment: ['&& denotes a mnemonic'] }, "Run &&Selected Text")
					},
					order: 4,
					when: TerminalContextKeys.processSupported
				}
			}
		]
	);

	MenuRegistry.appendMenuItems(
		[
			{
				id: MenuId.TerminalInstanceContext,
				item: {
					group: ContextMenuGroup.Create,
					command: {
						id: TerminalCommandId.Split,
						title: terminalStrings.split.value
					}
				}
			},
			{
				id: MenuId.TerminalInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.New,
						title: terminalStrings.new
					},
					group: ContextMenuGroup.Create
				}
			},
			{
				id: MenuId.TerminalInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.KillViewOrEditor,
						title: terminalStrings.kill.value,
					},
					group: ContextMenuGroup.Kill
				}
			},
			{
				id: MenuId.TerminalInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.CopySelection,
						title: localize('workbench.action.terminal.copySelection.short', "Copy")
					},
					group: ContextMenuGroup.Edit,
					order: 1
				}
			},
			{
				id: MenuId.TerminalInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.CopySelectionAsHtml,
						title: localize('workbench.action.terminal.copySelectionAsHtml', "Copy as HTML")
					},
					group: ContextMenuGroup.Edit,
					order: 2
				}
			},
			{
				id: MenuId.TerminalInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.Paste,
						title: localize('workbench.action.terminal.paste.short', "Paste")
					},
					group: ContextMenuGroup.Edit,
					order: 3
				}
			},
			{
				id: MenuId.TerminalInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.Clear,
						title: localize('workbench.action.terminal.clear', "Clear")
					},
					group: ContextMenuGroup.Clear,
				}
			},
			{
				id: MenuId.TerminalInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.SizeToContentWidth,
						title: terminalStrings.toggleSizeToContentWidth
					},
					group: ContextMenuGroup.Config
				}
			},

			{
				id: MenuId.TerminalInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.SelectAll,
						title: localize('workbench.action.terminal.selectAll', "Select All"),
					},
					group: ContextMenuGroup.Edit,
					order: 3
				}
			},
		]
	);

	MenuRegistry.appendMenuItems(
		[
			{
				id: MenuId.TerminalEditorInstanceContext,
				item: {
					group: ContextMenuGroup.Create,
					command: {
						id: TerminalCommandId.Split,
						title: terminalStrings.split.value
					}
				}
			},
			{
				id: MenuId.TerminalEditorInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.New,
						title: terminalStrings.new
					},
					group: ContextMenuGroup.Create
				}
			},
			{
				id: MenuId.TerminalEditorInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.KillEditor,
						title: terminalStrings.kill.value
					},
					group: ContextMenuGroup.Kill
				}
			},
			{
				id: MenuId.TerminalEditorInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.CopySelection,
						title: localize('workbench.action.terminal.copySelection.short', "Copy")
					},
					group: ContextMenuGroup.Edit,
					order: 1
				}
			},
			{
				id: MenuId.TerminalEditorInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.CopySelectionAsHtml,
						title: localize('workbench.action.terminal.copySelectionAsHtml', "Copy as HTML")
					},
					group: ContextMenuGroup.Edit,
					order: 2
				}
			},
			{
				id: MenuId.TerminalEditorInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.Paste,
						title: localize('workbench.action.terminal.paste.short', "Paste")
					},
					group: ContextMenuGroup.Edit,
					order: 3
				}
			},
			{
				id: MenuId.TerminalEditorInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.Clear,
						title: localize('workbench.action.terminal.clear', "Clear")
					},
					group: ContextMenuGroup.Clear,
				}
			},
			{
				id: MenuId.TerminalEditorInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.SelectAll,
						title: localize('workbench.action.terminal.selectAll', "Select All"),
					},
					group: ContextMenuGroup.Edit,
					order: 3
				}
			},
			{
				id: MenuId.TerminalEditorInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.SizeToContentWidth,
						title: terminalStrings.toggleSizeToContentWidth
					},
					group: ContextMenuGroup.Config
				}
			}
		]
	);

	MenuRegistry.appendMenuItems(
		[
			{
				id: MenuId.TerminalTabEmptyAreaContext,
				item: {
					command: {
						id: TerminalCommandId.NewWithProfile,
						title: localize('workbench.action.terminal.newWithProfile.short', "New Terminal With Profile...")
					},
					group: ContextMenuGroup.Create
				}
			},
			{
				id: MenuId.TerminalTabEmptyAreaContext,
				item: {
					command: {
						id: TerminalCommandId.New,
						title: terminalStrings.new
					},
					group: ContextMenuGroup.Create
				}
			}
		]
	);

	MenuRegistry.appendMenuItems(
		[
			{
				id: MenuId.TerminalNewDropdownContext,
				item: {
					command: {
						id: TerminalCommandId.SelectDefaultProfile,
						title: localize2('workbench.action.terminal.selectDefaultProfile', 'Select Default Profile'),
					},
					group: '3_configure'
				}
			},
			{
				id: MenuId.TerminalNewDropdownContext,
				item: {
					command: {
						id: TerminalCommandId.ConfigureTerminalSettings,
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
		]
	);

	MenuRegistry.appendMenuItems(
		[
			{
				id: MenuId.ViewTitle,
				item: {
					command: {
						id: TerminalCommandId.SwitchTerminal,
						title: localize2('workbench.action.terminal.switchTerminal', 'Switch Terminal')
					},
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
						ContextKeyExpr.not(`config.${TerminalSettingId.TabsEnabled}`)
					),
				}
			},
			{
				// This is used to show instead of tabs when there is only a single terminal
				id: MenuId.ViewTitle,
				item: {
					command: {
						id: TerminalCommandId.Focus,
						title: terminalStrings.focus
					},
					alt: {
						id: TerminalCommandId.Split,
						title: terminalStrings.split.value,
						icon: Codicon.splitHorizontal
					},
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
						ContextKeyExpr.has(`config.${TerminalSettingId.TabsEnabled}`),
						ContextKeyExpr.or(
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, 'singleTerminal'),
								ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1)
							),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, 'singleTerminalOrNarrow'),
								ContextKeyExpr.or(
									ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1),
									ContextKeyExpr.has(TerminalContextKeyStrings.TabsNarrow)
								)
							),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, 'singleGroup'),
								ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1)
							),
							ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, 'always')
						)
					),
				}
			},
			{
				id: MenuId.ViewTitle,
				item: {
					command: {
						id: TerminalCommandId.Split,
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
						id: TerminalCommandId.Kill,
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
						id: TerminalCommandId.New,
						title: terminalStrings.new,
						icon: Codicon.plus
					},
					alt: {
						id: TerminalCommandId.Split,
						title: terminalStrings.split.value,
						icon: Codicon.splitHorizontal
					},
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
						ContextKeyExpr.or(TerminalContextKeys.webExtensionContributedProfile, TerminalContextKeys.processSupported)
					)
				}
			},
			{
				id: MenuId.ViewTitle,
				item: {
					command: {
						id: TerminalCommandId.Clear,
						title: localize('workbench.action.terminal.clearLong', "Clear Terminal"),
						icon: Codicon.clearAll
					},
					group: 'navigation',
					order: 4,
					when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
					isHiddenByDefault: true
				}
			},
			{
				id: MenuId.ViewTitle,
				item: {
					command: {
						id: TerminalCommandId.RunActiveFile,
						title: localize('workbench.action.terminal.runActiveFile', "Run Active File"),
						icon: Codicon.run
					},
					group: 'navigation',
					order: 5,
					when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
					isHiddenByDefault: true
				}
			},
			{
				id: MenuId.ViewTitle,
				item: {
					command: {
						id: TerminalCommandId.RunSelectedText,
						title: localize('workbench.action.terminal.runSelectedText', "Run Selected Text"),
						icon: Codicon.selection
					},
					group: 'navigation',
					order: 6,
					when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
					isHiddenByDefault: true
				}
			},
		]
	);

	MenuRegistry.appendMenuItems(
		[
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.SplitActiveTab,
						title: terminalStrings.split.value,
					},
					group: ContextMenuGroup.Create,
					order: 1
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.MoveToEditor,
						title: terminalStrings.moveToEditor.value
					},
					group: ContextMenuGroup.Create,
					order: 2
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.MoveIntoNewWindow,
						title: terminalStrings.moveIntoNewWindow.value
					},
					group: ContextMenuGroup.Create,
					order: 2
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.RenameActiveTab,
						title: localize('workbench.action.terminal.renameInstance', "Rename...")
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.ChangeIconActiveTab,
						title: localize('workbench.action.terminal.changeIcon', "Change Icon...")
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.ChangeColorActiveTab,
						title: localize('workbench.action.terminal.changeColor', "Change Color...")
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.SizeToContentWidth,
						title: terminalStrings.toggleSizeToContentWidth
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.JoinActiveTab,
						title: localize('workbench.action.terminal.joinInstance', "Join Terminals")
					},
					when: TerminalContextKeys.tabsSingularSelection.toNegated(),
					group: ContextMenuGroup.Config
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.Unsplit,
						title: terminalStrings.unsplit.value
					},
					when: ContextKeyExpr.and(TerminalContextKeys.tabsSingularSelection, TerminalContextKeys.splitTerminal),
					group: ContextMenuGroup.Config
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.KillActiveTab,
						title: terminalStrings.kill.value
					},
					group: ContextMenuGroup.Kill,
				}
			}
		]
	);

	MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
		command: {
			id: TerminalCommandId.MoveToTerminalPanel,
			title: terminalStrings.moveToTerminalPanel
		},
		when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
		group: '2_files'
	});

	MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
		command: {
			id: TerminalCommandId.Rename,
			title: terminalStrings.rename
		},
		when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
		group: '2_files'
	});

	MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
		command: {
			id: TerminalCommandId.ChangeColor,
			title: terminalStrings.changeColor
		},
		when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
		group: '2_files'
	});

	MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
		command: {
			id: TerminalCommandId.ChangeIcon,
			title: terminalStrings.changeIcon
		},
		when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
		group: '2_files'
	});
	MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
		command: {
			id: TerminalCommandId.SizeToContentWidth,
			title: terminalStrings.toggleSizeToContentWidth
		},
		when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
		group: '2_files'
	});

	MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
		command: {
			id: TerminalCommandId.CreateTerminalEditorSameGroup,
			title: terminalStrings.new,
			icon: Codicon.plus
		},
		alt: {
			id: TerminalCommandId.Split,
			title: terminalStrings.split.value,
			icon: Codicon.splitHorizontal
		},
		group: 'navigation',
		order: 0,
		when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal)
	});
}

export function getTerminalActionBarArgs(location: ITerminalLocationOptions, profiles: ITerminalProfile[], defaultProfileName: string, contributedProfiles: readonly IExtensionTerminalProfile[], terminalService: ITerminalService, dropdownMenu: IMenu, disposableStore: DisposableStore): {
	dropdownAction: IAction;
	dropdownMenuActions: IAction[];
	className: string;
	dropdownIcon?: string;
} {
	let dropdownActions: IAction[] = [];
	let submenuActions: IAction[] = [];
	profiles = profiles.filter(e => !e.isAutoDetected);
	const splitLocation = (location === TerminalLocation.Editor || (typeof location === 'object' && 'viewColumn' in location && location.viewColumn === ACTIVE_GROUP)) ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
	for (const p of profiles) {
		const isDefault = p.profileName === defaultProfileName;
		const options: ICreateTerminalOptions = { config: p, location };
		const splitOptions: ICreateTerminalOptions = { config: p, location: splitLocation };
		const sanitizedProfileName = p.profileName.replace(/[\n\r\t]/g, '');
		dropdownActions.push(disposableStore.add(new Action(TerminalCommandId.NewWithProfile, isDefault ? localize('defaultTerminalProfile', "{0} (Default)", sanitizedProfileName) : sanitizedProfileName, undefined, true, async () => {
			const instance = await terminalService.createTerminal(options);
			terminalService.setActiveInstance(instance);
			await terminalService.focusActiveInstance();
		})));
		submenuActions.push(disposableStore.add(new Action(TerminalCommandId.Split, isDefault ? localize('defaultTerminalProfile', "{0} (Default)", sanitizedProfileName) : sanitizedProfileName, undefined, true, async () => {
			const instance = await terminalService.createTerminal(splitOptions);
			terminalService.setActiveInstance(instance);
			await terminalService.focusActiveInstance();
		})));
	}

	for (const contributed of contributedProfiles) {
		const isDefault = contributed.title === defaultProfileName;
		const title = isDefault ? localize('defaultTerminalProfile', "{0} (Default)", contributed.title.replace(/[\n\r\t]/g, '')) : contributed.title.replace(/[\n\r\t]/g, '');
		dropdownActions.push(disposableStore.add(new Action('contributed', title, undefined, true, () => terminalService.createTerminal({
			config: {
				extensionIdentifier: contributed.extensionIdentifier,
				id: contributed.id,
				title
			},
			location
		}))));
		submenuActions.push(disposableStore.add(new Action('contributed-split', title, undefined, true, () => terminalService.createTerminal({
			config: {
				extensionIdentifier: contributed.extensionIdentifier,
				id: contributed.id,
				title
			},
			location: splitLocation
		}))));
	}

	const defaultProfileAction = dropdownActions.find(d => d.label.endsWith('(Default)'));
	if (defaultProfileAction) {
		dropdownActions = dropdownActions.filter(d => d !== defaultProfileAction).sort((a, b) => a.label.localeCompare(b.label));
		dropdownActions.unshift(defaultProfileAction);
	}

	if (dropdownActions.length > 0) {
		dropdownActions.push(new SubmenuAction('split.profile', localize('splitTerminal', 'Split Terminal'), submenuActions));
		dropdownActions.push(new Separator());
	}
	const actions = dropdownMenu.getActions();
	dropdownActions.push(...Separator.join(...actions.map(a => a[1])));

	const defaultSubmenuProfileAction = submenuActions.find(d => d.label.endsWith('(Default)'));
	if (defaultSubmenuProfileAction) {
		submenuActions = submenuActions.filter(d => d !== defaultSubmenuProfileAction).sort((a, b) => a.label.localeCompare(b.label));
		submenuActions.unshift(defaultSubmenuProfileAction);
	}

	const dropdownAction = disposableStore.add(new Action('refresh profiles', localize('launchProfile', 'Launch Profile...'), 'codicon-chevron-down', true));
	return { dropdownAction, dropdownMenuActions: dropdownActions, className: `terminal-tab-actions-${terminalService.resolveLocation(location)}` };
}
