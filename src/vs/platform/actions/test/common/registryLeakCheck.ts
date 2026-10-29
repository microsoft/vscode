/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommand, CommandsRegistry } from '../../../commands/common/commands.js';
import { IKeybindingItem, KeybindingsRegistry } from '../../../keybinding/common/keybindingsRegistry.js';
import { ICommandAction } from '../../../action/common/action.js';
import { IMenuItem, isIMenuItem, ISubmenuItem, MenuId, MenuRegistry } from '../../common/actions.js';

export interface IRegistrySnapshot {
	readonly commands: ReadonlyMap<string, ICommand>;
	readonly menuCommands: ReadonlyMap<string, ICommandAction>;
	readonly menuItems: ReadonlyMap<MenuId, ReadonlySet<IMenuItem | ISubmenuItem>>;
	readonly keybindings: ReadonlySet<IKeybindingItem>;
}

function getMenuIds(): Iterable<MenuId> {
	// Menus are created on demand by contributions, so only MenuId knows all of them.
	return (MenuId as unknown as { readonly _instances: ReadonlyMap<string, MenuId> })._instances.values();
}

export function takeRegistrySnapshot(): IRegistrySnapshot {
	const menuItems = new Map<MenuId, ReadonlySet<IMenuItem | ISubmenuItem>>();
	for (const id of getMenuIds()) {
		let items = MenuRegistry.getMenuItems(id);
		if (id === MenuId.CommandPalette) {
			// The command palette adds a new item for every command without an explicit one on each call.
			// Keep only the registered items, which are the same on every call: menuCommands covers the others.
			const registered = new Set(MenuRegistry.getMenuItems(id));
			items = items.filter(item => registered.has(item));
		}
		if (items.length) {
			menuItems.set(id, new Set(items));
		}
	}
	return {
		commands: CommandsRegistry.getCommands(),
		menuCommands: new Map(MenuRegistry.getCommands()),
		menuItems,
		keybindings: new Set(KeybindingsRegistry.getDefaultKeybindings()),
	};
}

function diffMaps<V>(kind: string, before: ReadonlyMap<string, V>, after: ReadonlyMap<string, V>, changes: string[]): void {
	for (const [id, value] of after) {
		const previous = before.get(id);
		if (previous === undefined) {
			changes.push(`registered ${kind} '${id}'`);
		} else if (previous !== value) {
			changes.push(`replaced ${kind} '${id}'`);
		}
	}
	for (const id of before.keys()) {
		if (!after.has(id)) {
			changes.push(`unregistered ${kind} '${id}'`);
		}
	}
}

function describeMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): string {
	return `menu item '${isIMenuItem(item) ? item.command.id : `submenu ${item.submenu.id}`}' in '${menu.id}'`;
}

export function diffRegistrySnapshots(before: IRegistrySnapshot, after: IRegistrySnapshot): string[] {
	const changes: string[] = [];
	diffMaps('command', before.commands, after.commands, changes);
	diffMaps('menu command', before.menuCommands, after.menuCommands, changes);
	for (const [menu, items] of after.menuItems) {
		const previous = before.menuItems.get(menu);
		for (const item of items) {
			if (!previous?.has(item)) {
				changes.push(`registered ${describeMenuItem(menu, item)}`);
			}
		}
	}
	for (const [menu, items] of before.menuItems) {
		const current = after.menuItems.get(menu);
		for (const item of items) {
			if (!current?.has(item)) {
				changes.push(`unregistered ${describeMenuItem(menu, item)}`);
			}
		}
	}
	for (const item of after.keybindings) {
		if (!before.keybindings.has(item)) {
			changes.push(`registered keybinding for '${item.command ?? '<none>'}'`);
		}
	}
	for (const item of before.keybindings) {
		if (!after.keybindings.has(item)) {
			changes.push(`unregistered keybinding for '${item.command ?? '<none>'}'`);
		}
	}
	return changes;
}

const maxReportedChanges = 20;

/**
 * Suites that changed the registries before this check existed. Do not add to this list: dispose what
 * a suite registers instead, and remove a suite from it once it is fixed.
 */
const knownLeakingSuites: ReadonlySet<string> = new Set([
	'AgentSessionsActions',
	'Chat code-block action telemetry',
	'ChatMcpAuthenticationContentPart',
	'Edit session sync',
	'ExtHostLanguageFeatureCommands',
	'Inline chat zone widget — menu contributions',
	'RetryChatAction',
	'Sessions - Layout Actions',
]);

/**
 * Fails every top-level suite that leaves a different set of commands, menu items or keybindings
 * registered than it started with.
 *
 * All test files of a run share one page, so a registration that a suite does not dispose changes the
 * behavior of every suite that runs after it, depending on which files a run includes and their order.
 */
export function installRegistryLeakCheck(root: Mocha.Suite): void {
	const snapshots = new WeakMap<Mocha.Suite, IRegistrySnapshot>();
	const checked = new WeakSet<Mocha.Suite>();

	// Mocha emits 'suite' when a suite is added, before its definition runs, so this hook runs before the suite's own hooks.
	root.on('suite', (suite: Mocha.Suite) => {
		if (knownLeakingSuites.has(suite.title)) {
			return;
		}
		suite.beforeAll('Registry leak check: snapshot', () => {
			snapshots.set(suite, takeRegistrySnapshot());
		});
	});

	// Once a test file is loaded, its suites have registered their own hooks, so this hook runs after their cleanup.
	root.on('post-require', () => {
		for (const suite of root.suites) {
			if (checked.has(suite)) {
				continue;
			}
			checked.add(suite);
			if (knownLeakingSuites.has(suite.title)) {
				continue;
			}
			suite.afterAll('Registry leak check', () => {
				const before = snapshots.get(suite);
				snapshots.delete(suite);
				if (!before) {
					return;
				}
				const changes = diffRegistrySnapshots(before, takeRegistrySnapshot());
				if (changes.length) {
					const reported = changes.slice(0, maxReportedChanges);
					if (changes.length > reported.length) {
						reported.push(`... and ${changes.length - reported.length} more`);
					}
					throw new Error([
						`Suite '${suite.title}' changed global registries that other test files share. Dispose what the suite registers, for example in suiteTeardown:`,
						...reported.map(change => `  - ${change}`),
					].join('\n'));
				}
			});
		}
	});
}
