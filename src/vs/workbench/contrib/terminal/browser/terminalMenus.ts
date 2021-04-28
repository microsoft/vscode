/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyAndExpr, ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { TERMINAL_COMMAND_ID, TERMINAL_VIEW_ID } from 'vs/workbench/contrib/terminal/common/terminal';

const enum ContextMenuGroup {
	Create = '1_create',
	Edit = '2_edit',
	Clear = '3_clear',
	Kill = '4_kill',
	Config = '5_config'
}

export const enum ContextMenuTabsGroup {
	Default = '1_create_default',
	Profile = '2_create_profile',
	Configure = '3_configure'
}

MenuRegistry.appendMenuItems(
	[
		{
			id: MenuId.TerminalContainerContext, item: {
				group: ContextMenuGroup.Create,
				command: {
					id: TERMINAL_COMMAND_ID.SPLIT,
					title: localize('workbench.action.terminal.split', "Split Terminal")
				}
			}
		},
		{
			id: MenuId.TerminalContainerContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.NEW,
					title: localize('workbench.action.terminal.new.short', "New Terminal")
				},
				group: ContextMenuGroup.Create
			}
		},
		{
			id: MenuId.TerminalContainerContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.KILL,
					title: localize('workbench.action.terminal.kill.short', "Kill Terminal")
				},
				group: ContextMenuGroup.Kill
			}
		},
		{
			id: MenuId.TerminalContainerContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.COPY_SELECTION,
					title: localize('workbench.action.terminal.copySelection.short', "Copy")
				},
				group: ContextMenuGroup.Edit,
				order: 1
			}
		},
		{
			id: MenuId.TerminalContainerContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.PASTE,
					title: localize('workbench.action.terminal.paste.short', "Paste")
				},
				group: ContextMenuGroup.Edit,
				order: 2
			}
		},
		{
			id: MenuId.TerminalContainerContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.CLEAR,
					title: localize('workbench.action.terminal.clear', "Clear")
				},
				group: ContextMenuGroup.Clear,
			}
		},
		{
			id: MenuId.TerminalContainerContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.SHOW_TABS,
					title: localize('workbench.action.terminal.showsTabs', "Show Tabs")
				},
				when: ContextKeyExpr.not('config.terminal.integrated.tabs.enabled'),
				group: ContextMenuGroup.Config
			}
		},
		{
			id: MenuId.TerminalContainerContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.SELECT_ALL,
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
			id: MenuId.TerminalTabsWidgetEmptyContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.NEW_WITH_PROFILE,
					title: localize('workbench.action.terminal.newWithProfile.short', "New Terminal With Profile")
				},
				group: ContextMenuGroup.Create
			}
		},
		{
			id: MenuId.TerminalTabsWidgetEmptyContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.NEW,
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
			id: MenuId.TerminalToolbarContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.SELECT_DEFAULT_PROFILE,
					title: { value: localize('workbench.action.terminal.selectDefaultProfile', "Select Default Profile"), original: 'Select Default Profile' }
				},
				group: ContextMenuTabsGroup.Configure
			}
		},
		{
			id: MenuId.TerminalToolbarContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.CONFIGURE_TERMINAL_SETTINGS,
					title: localize('workbench.action.terminal.openSettings', "Configure Terminal Settings")
				},
				group: ContextMenuTabsGroup.Configure
			}
		}
	]
);

MenuRegistry.appendMenuItems(
	[
		{
			id: MenuId.TerminalTabInlineActions, item: {
				command: {
					id: TERMINAL_COMMAND_ID.SPLIT_INSTANCE,
					title: localize('workbench.action.terminal.splitInstance', "Split Terminal"),
				},
				group: ContextMenuGroup.Create
			}
		},
		{
			id: MenuId.TerminalTabInlineActions, item: {
				command: {
					id: TERMINAL_COMMAND_ID.KILL_INSTANCE,
					title: localize('workbench.action.terminal.killInstance', "Kill Terminal")
				},
				group: ContextMenuGroup.Kill
			}
		}
	]
);

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	group: 'navigation',
	command: {
		id: TERMINAL_COMMAND_ID.SPLIT,
		title: localize('workbench.action.terminal.split', "Split Terminal")
	},
	order: 2,
	when: ContextKeyAndExpr.create([
		ContextKeyEqualsExpr.create('view', TERMINAL_VIEW_ID),
		ContextKeyExpr.not('config.terminal.integrated.tabs.enabled')
	])
});
MenuRegistry.appendMenuItems(
	[
		{
			id: MenuId.TerminalSingleTabContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.CHANGE_ICON,
					title: localize('workbench.action.terminal.changeIcon', "Change Icon...")
				},
				group: ContextMenuGroup.Edit,
				order: 3
			}
		},
		{
			id: MenuId.TerminalSingleTabContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.RENAME,
					title: localize('workbench.action.terminal.rename', "Rename...")
				}
			}
		},
		{
			id: MenuId.TerminalSingleTabContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.RENAME_INSTANCE,
					title: localize('workbench.action.terminal.renameInstance', "Rename...")
				},
				group: ContextMenuGroup.Edit
			}
		},
		{
			id: MenuId.TerminalSingleTabContext, item: {
				group: ContextMenuGroup.Create,
				command: {
					id: TERMINAL_COMMAND_ID.SPLIT,
					title: localize('workbench.action.terminal.split', "Split Terminal")
				}
			}
		},
		{
			id: MenuId.TerminalSingleTabContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.KILL,
					title: localize('workbench.action.terminal.kill.short', "Kill Terminal")
				},
				group: ContextMenuGroup.Kill
			}
		}
	]
);

MenuRegistry.appendMenuItems(
	[
		{
			id: MenuId.TerminalTabsWidgetContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.RENAME_INSTANCE,
					title: localize('workbench.action.terminal.renameInstance', "Rename...")
				},
				group: ContextMenuGroup.Edit
			}
		},
		{
			id: MenuId.TerminalTabsWidgetContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.CHANGE_ICON_INSTANCE,
					title: localize('workbench.action.terminal.changeIcon', "Change Icon...")
				},
				group: ContextMenuGroup.Edit
			}
		},
		{
			id: MenuId.TerminalTabsWidgetContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.SPLIT_INSTANCE,
					title: localize('workbench.action.terminal.splitInstance', "Split Terminal"),
				},
				group: ContextMenuGroup.Create
			}
		},
		{
			id: MenuId.TerminalTabsWidgetContext, item: {
				command: {
					id: TERMINAL_COMMAND_ID.KILL_INSTANCE,
					title: localize('workbench.action.terminal.killInstance', "Kill Terminal")
				},
				group: ContextMenuGroup.Kill,
			}
		}
	]
);
