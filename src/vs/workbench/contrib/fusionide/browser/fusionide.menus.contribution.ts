/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FusionClaw. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// --- Start FusionIDE ---

import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';

/**
 * Menubar entries for the FusionClaw commands.
 *
 * These live in core because extensions cannot reach the menubar:
 * `contributes.menus` exposes context menus, editor titles, and view titles,
 * but has no slot for the File or Help menus and no way to declare a new
 * top-level submenu. The commands themselves are registered by the
 * `fusionclaw.fusionide-bridge` extension; this file only says where they
 * appear, so a menu change never requires rebuilding the workbench.
 *
 * Command ids are intentionally referenced as string literals: core must not
 * import from an extension, and a missing command simply renders a disabled
 * entry rather than breaking the menu.
 */

const FUSIONCLAW_TOOLS_MENU = new MenuId('FusionclawToolsMenu');

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '1_new',
	command: {
		id: 'fusionclaw.backToStart',
		title: localize({ key: 'miFusionclawNewProject', comment: ['&& denotes a mnemonic'] }, "New &&Project...")
	},
	order: 5
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: 'fusionclaw.signOut',
		title: localize({ key: 'miFusionclawSignOut', comment: ['&& denotes a mnemonic'] }, "Sign &&Out")
	},
	order: 10
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '1_welcome',
	command: {
		id: 'fusionclaw.openConfigurations',
		title: localize({ key: 'miFusionclawConfigurations', comment: ['&& denotes a mnemonic'] }, "FusionClaw &&Configurations")
	},
	order: 5
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '4_update',
	command: {
		id: 'fusionclaw.checkForUpdates',
		title: localize({ key: 'miFusionclawCheckForUpdates', comment: ['&& denotes a mnemonic'] }, "Check for &&Updates...")
	},
	order: 1
});

/**
 * The Tools menu is a top-level submenu, which no extension point can create.
 * Its entries are the tool surfaces the desktop owns; each command is a single
 * hand-off over the loopback bridge.
 */
MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: FUSIONCLAW_TOOLS_MENU,
	title: localize({ key: 'miFusionclawTools', comment: ['&& denotes a mnemonic'] }, "&&Tools"),
	order: 6
});

const TOOL_ENTRIES: ReadonlyArray<{ id: string; title: string; group: string; order: number }> = [
	{ id: 'fusionclaw.skills.open', title: localize('miFusionclawSkillManager', "Skill Manager"), group: '1_agents', order: 1 },
	{ id: 'fusionclaw.openInTerminal', title: localize('miFusionclawTerminal', "Open in FusionClaw Terminal"), group: '1_agents', order: 2 },
	{ id: 'fusionclaw.openAgenticDevelopmentEnvironment', title: localize('miFusionclawAde', "Agentic Development Environment"), group: '2_surfaces', order: 1 },
	{ id: 'fusionclaw.wiring.open', title: localize('miFusionclawWiring', "Connect to an ADE Workspace"), group: '2_surfaces', order: 2 },
	{ id: 'fusionclaw.openBilling', title: localize('miFusionclawBilling', "Credits and Billing"), group: '3_account', order: 1 },
];

for (const entry of TOOL_ENTRIES) {
	MenuRegistry.appendMenuItem(FUSIONCLAW_TOOLS_MENU, {
		group: entry.group,
		command: { id: entry.id, title: entry.title },
		order: entry.order
	});
}

// --- End FusionIDE ---
