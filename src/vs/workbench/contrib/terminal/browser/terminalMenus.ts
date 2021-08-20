/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Action, SubmenuAction, Separator } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Schemas } from 'vs/base/common/network';
import { localize } from 'vs/nls';
import { MenuRegistry, MenuId, IMenuActionOptions, MenuItemAction, IMenu } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyAndExpr, ContextKeyEqualsExpr, ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionTerminalProfile, ITerminalProfile, TerminalLocation, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { ICreateTerminalOptions, ITerminalLocationOptions, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId, TERMINAL_VIEW_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys, TerminalContextKeyStrings } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';

const enum ContextMenuGroup {
	Create = '1_create',
	Edit = '2_edit',
	Clear = '3_clear',
	Kill = '4_kill',
	Config = '5_config'
}

export const enum TerminalTabContextMenuGroup {
	Default = '1_create_default',
	Profile = '2_create_profile',
	Configure = '3_configure'
}

export const enum TerminalMenuBarGroup {
	Create = '1_create',
	Run = '2_run',
	Manage = '3_manage',
	Configure = '4_configure'
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
						title: localize('workbench.action.terminal.new.short', "New Terminal")
					},
					group: ContextMenuGroup.Create
				}
			},
			{
				id: MenuId.TerminalInstanceContext,
				item: {
					command: {
						id: TerminalCommandId.Kill,
						title: terminalStrings.kill.value
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
						id: TerminalCommandId.Paste,
						title: localize('workbench.action.terminal.paste.short', "Paste")
					},
					group: ContextMenuGroup.Edit,
					order: 2
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
						id: TerminalCommandId.ShowTabs,
						title: localize('workbench.action.terminal.showsTabs', "Show Tabs")
					},
					when: ContextKeyExpr.not(`config.${TerminalSettingId.TabsEnabled}`),
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
				id: MenuId.TerminalTabEmptyAreaContext,
				item: {
					command: {
						id: TerminalCommandId.NewWithProfile,
						title: localize('workbench.action.terminal.newWithProfile.short', "New Terminal With Profile")
					},
					group: ContextMenuGroup.Create
				}
			},
			{
				id: MenuId.TerminalTabEmptyAreaContext,
				item: {
					command: {
						id: TerminalCommandId.New,
						title: localize('workbench.action.terminal.new.short', "New Terminal")
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
						title: { value: localize('workbench.action.terminal.selectDefaultProfile', "Select Default Profile"), original: 'Select Default Profile' }
					},
					group: TerminalTabContextMenuGroup.Configure
				}
			},
			{
				id: MenuId.TerminalNewDropdownContext,
				item: {
					command: {
						id: TerminalCommandId.ConfigureTerminalSettings,
						title: localize('workbench.action.terminal.openSettings', "Configure Terminal Settings")
					},
					group: TerminalTabContextMenuGroup.Configure
				}
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
						title: { value: localize('workbench.action.terminal.switchTerminal', "Switch Terminal"), original: 'Switch Terminal' }
					},
					group: 'navigation',
					order: 0,
					when: ContextKeyAndExpr.create([
						ContextKeyEqualsExpr.create('view', TERMINAL_VIEW_ID),
						ContextKeyExpr.not(`config.${TerminalSettingId.TabsEnabled}`)
					]),
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
					group: 'navigation',
					order: 0,
					when: ContextKeyAndExpr.create([
						ContextKeyEqualsExpr.create('view', TERMINAL_VIEW_ID),
						ContextKeyExpr.has(`config.${TerminalSettingId.TabsEnabled}`),
						ContextKeyExpr.or(
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, 'singleTerminal'),
								ContextKeyExpr.equals(TerminalContextKeyStrings.Count, 1)
							),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, 'singleTerminalOrNarrow'),
								ContextKeyExpr.or(
									ContextKeyExpr.equals(TerminalContextKeyStrings.Count, 1),
									ContextKeyExpr.has(TerminalContextKeyStrings.TabsNarrow)
								)
							),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, 'singleGroup'),
								ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1)
							),
							ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, 'always')
						)
					]),
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
					when: ContextKeyAndExpr.create([
						ContextKeyEqualsExpr.create('view', TERMINAL_VIEW_ID),
						ContextKeyExpr.or(
							ContextKeyExpr.not(`config.${TerminalSettingId.TabsEnabled}`),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActions}`, 'singleTerminal'),
								ContextKeyExpr.equals(TerminalContextKeyStrings.Count, 1)
							),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActions}`, 'singleTerminalOrNarrow'),
								ContextKeyExpr.or(
									ContextKeyExpr.equals(TerminalContextKeyStrings.Count, 1),
									ContextKeyExpr.has(TerminalContextKeyStrings.TabsNarrow)
								)
							),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActions}`, 'singleGroup'),
								ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1)
							),
							ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActions}`, 'always')
						)
					])
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
					when: ContextKeyAndExpr.create([
						ContextKeyEqualsExpr.create('view', TERMINAL_VIEW_ID),
						ContextKeyExpr.or(
							ContextKeyExpr.not(`config.${TerminalSettingId.TabsEnabled}`),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActions}`, 'singleTerminal'),
								ContextKeyExpr.equals(TerminalContextKeyStrings.Count, 1)
							),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActions}`, 'singleTerminalOrNarrow'),
								ContextKeyExpr.or(
									ContextKeyExpr.equals(TerminalContextKeyStrings.Count, 1),
									ContextKeyExpr.has(TerminalContextKeyStrings.TabsNarrow)
								)
							),
							ContextKeyExpr.and(
								ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActions}`, 'singleGroup'),
								ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1)
							),
							ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActions}`, 'always')
						)
					])
				}
			},
			{
				id: MenuId.ViewTitle,
				item: {
					command: {
						id: TerminalCommandId.CreateWithProfileButton,
						title: TerminalCommandId.CreateWithProfileButton
					},
					group: 'navigation',
					order: 0,
					when: ContextKeyAndExpr.create([
						ContextKeyEqualsExpr.create('view', TERMINAL_VIEW_ID)
					])
				}
			}
		]
	);

	MenuRegistry.appendMenuItems(
		[
			{
				id: MenuId.TerminalInlineTabContext,
				item: {
					command: {
						id: TerminalCommandId.Split,
						title: terminalStrings.split.value
					},
					group: ContextMenuGroup.Create,
					order: 1
				}
			},
			{
				id: MenuId.TerminalInlineTabContext,
				item: {
					command: {
						id: TerminalCommandId.MoveToEditor,
						title: terminalStrings.moveToEditor.short
					},
					group: ContextMenuGroup.Create,
					order: 2
				}
			},
			{
				id: MenuId.TerminalInlineTabContext,
				item: {
					command: {
						id: TerminalCommandId.ChangeIconPanel,
						title: terminalStrings.changeIcon.value
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalInlineTabContext,
				item: {
					command: {
						id: TerminalCommandId.ChangeColorPanel,
						title: terminalStrings.changeColor.value
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalInlineTabContext,
				item: {
					command: {
						id: TerminalCommandId.RenamePanel,
						title: terminalStrings.rename.value
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalInlineTabContext,
				item: {
					command: {
						id: TerminalCommandId.Kill,
						title: terminalStrings.kill.value
					},
					group: ContextMenuGroup.Kill
				}
			}
		]
	);

	MenuRegistry.appendMenuItems(
		[
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.SplitInstance,
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
						id: TerminalCommandId.MoveToEditorInstance,
						title: terminalStrings.moveToEditor.short
					},
					group: ContextMenuGroup.Create,
					order: 2
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.RenameInstance,
						title: localize('workbench.action.terminal.renameInstance', "Rename...")
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.ChangeIconInstance,
						title: localize('workbench.action.terminal.changeIcon', "Change Icon...")
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.ChangeColorInstance,
						title: localize('workbench.action.terminal.changeColor', "Change Color...")
					},
					group: ContextMenuGroup.Edit
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					group: ContextMenuGroup.Config,
					command: {
						id: TerminalCommandId.JoinInstance,
						title: localize('workbench.action.terminal.joinInstance', "Join Terminals")
					},
					when: TerminalContextKeys.tabsSingularSelection.toNegated()
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					group: ContextMenuGroup.Config,
					command: {
						id: TerminalCommandId.UnsplitInstance,
						title: terminalStrings.unsplit.value
					},
					when: ContextKeyExpr.and(TerminalContextKeys.tabsSingularSelection, TerminalContextKeys.splitTerminal)
				}
			},
			{
				id: MenuId.TerminalTabContext,
				item: {
					command: {
						id: TerminalCommandId.KillInstance,
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
		group: '3_files'
	});

	MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
		command: {
			id: TerminalCommandId.ChangeColor,
			title: terminalStrings.changeColor
		},
		when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
		group: '3_files'
	});

	MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
		command: {
			id: TerminalCommandId.ChangeIcon,
			title: terminalStrings.changeIcon
		},
		when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
		group: '3_files'
	});

	MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
		command: {
			id: TerminalCommandId.CreateWithProfileButton,
			title: TerminalCommandId.CreateWithProfileButton
		},
		group: 'navigation',
		order: 0,
		when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal)
	});
}

export function getTerminalActionBarArgs(location: ITerminalLocationOptions, profiles: ITerminalProfile[], defaultProfileName: string, contributedProfiles: readonly IExtensionTerminalProfile[], instantiationService: IInstantiationService, terminalService: ITerminalService, contextKeyService: IContextKeyService, commandService: ICommandService, dropdownMenu: IMenu): {
	primaryAction: MenuItemAction,
	dropdownAction: IAction,
	dropdownMenuActions: IAction[],
	className: string,
	dropdownIcon?: string
} {
	let dropdownActions: IAction[] = [];
	let submenuActions: IAction[] = [];

	for (const p of profiles) {
		const isDefault = p.profileName === defaultProfileName;
		const options: IMenuActionOptions = {
			arg: {
				config: p,
				location
			} as ICreateTerminalOptions,
			shouldForwardArgs: true
		};
		if (isDefault) {
			dropdownActions.unshift(new MenuItemAction({ id: TerminalCommandId.NewWithProfile, title: localize('defaultTerminalProfile', "{0} (Default)", p.profileName), category: TerminalTabContextMenuGroup.Profile }, undefined, options, contextKeyService, commandService));
			submenuActions.unshift(new MenuItemAction({ id: TerminalCommandId.Split, title: localize('defaultTerminalProfile', "{0} (Default)", p.profileName), category: TerminalTabContextMenuGroup.Profile }, undefined, options, contextKeyService, commandService));
		} else {
			dropdownActions.push(new MenuItemAction({ id: TerminalCommandId.NewWithProfile, title: p.profileName.replace(/[\n\r\t]/g, ''), category: TerminalTabContextMenuGroup.Profile }, undefined, options, contextKeyService, commandService));
			submenuActions.push(new MenuItemAction({ id: TerminalCommandId.Split, title: p.profileName.replace(/[\n\r\t]/g, ''), category: TerminalTabContextMenuGroup.Profile }, undefined, options, contextKeyService, commandService));
		}
	}

	for (const contributed of contributedProfiles) {
		const isDefault = contributed.title === defaultProfileName;
		const title = isDefault ? localize('defaultTerminalProfile', "{0} (Default)", contributed.title.replace(/[\n\r\t]/g, '')) : contributed.title.replace(/[\n\r\t]/g, '');
		dropdownActions.push(new Action(TerminalCommandId.NewWithProfile, title, undefined, true, () => terminalService.createTerminal({
			config: {
				extensionIdentifier: contributed.extensionIdentifier,
				id: contributed.id,
				title
			},
			location
		})));
		const splitLocation = (location === TerminalLocation.Editor || typeof location === 'object' && 'viewColumn' in location) ? { viewColumn: SIDE_GROUP } : location;
		submenuActions.push(new Action(TerminalCommandId.NewWithProfile, title, undefined, true, () => terminalService.createTerminal({
			config: {
				extensionIdentifier: contributed.extensionIdentifier,
				id: contributed.id,
				title
			},
			location: splitLocation
		})));
	}

	if (dropdownActions.length > 0) {
		dropdownActions.push(new SubmenuAction('split.profile', 'Split...', submenuActions));
		dropdownActions.push(new Separator());
	}

	for (const [, configureActions] of dropdownMenu.getActions()) {
		for (const action of configureActions) {
			// make sure the action is a MenuItemAction
			if ('alt' in action) {
				dropdownActions.push(action);
			}
		}
	}

	const defaultProfileAction = dropdownActions.find(d => d.label.endsWith('(Default)'));
	if (defaultProfileAction) {
		dropdownActions = dropdownActions.filter(d => d !== defaultProfileAction);
		dropdownActions.unshift(defaultProfileAction);
	}

	const defaultSubmenuProfileAction = submenuActions.find(d => d.label.endsWith('(Default)'));
	if (defaultSubmenuProfileAction) {
		submenuActions = submenuActions.filter(d => d !== defaultSubmenuProfileAction);
		submenuActions.unshift(defaultSubmenuProfileAction);
	}

	const primaryAction = instantiationService.createInstance(
		MenuItemAction,
		{
			id: location === TerminalLocation.Panel ? TerminalCommandId.New : TerminalCommandId.CreateTerminalEditor,
			title: localize('terminal.new', "New Terminal"),
			icon: Codicon.plus
		},
		{
			id: TerminalCommandId.Split,
			title: terminalStrings.split.value,
			icon: Codicon.splitHorizontal
		},
		{
			shouldForwardArgs: true,
			arg: { location } as ICreateTerminalOptions,
		});

	const dropdownAction = new Action('refresh profiles', 'Launch Profile...', 'codicon-chevron-down', true);
	return { primaryAction, dropdownAction, dropdownMenuActions: dropdownActions, className: 'terminal-tab-actions' };
}
