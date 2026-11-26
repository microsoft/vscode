/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommand, CommandsRegistry } from '../../../commands/common/commands.js';
import { IKeybindingItem, IKeybindingRule, KeybindingsRegistry } from '../../../keybinding/common/keybindingsRegistry.js';
import { ICommandAction } from '../../../action/common/action.js';
import { IMenuItem, isIMenuItem, ISubmenuItem, MenuId, MenuRegistry } from '../../common/actions.js';

export interface IRegistrySnapshot {
	readonly commands: ReadonlyMap<string, ReadonlyMap<ICommand, number>>;
	readonly activeCommands: ReadonlyMap<string, ICommand>;
	readonly menuCommands: ReadonlyMap<string, ICommandAction>;
	readonly menuItems: ReadonlyMap<MenuId, ReadonlyMap<IMenuItem | ISubmenuItem, number>>;
	readonly keybindings: ReadonlyMap<IKeybindingItem, number>;
	readonly keybindingRules: ReadonlyMap<IKeybindingRule, number>;
}

/**
 * Counts how often each object is registered: the registries keep a list, so the same object can be registered more than once.
 */
function countRegistrations<T>(items: Iterable<T>): ReadonlyMap<T, number> {
	const counts = new Map<T, number>();
	for (const item of items) {
		counts.set(item, (counts.get(item) ?? 0) + 1);
	}
	return counts;
}

function getMenuIds(): Iterable<MenuId> {
	// Menus are created on demand by contributions, so only MenuId knows all of them.
	return (MenuId as unknown as { readonly _instances: ReadonlyMap<string, MenuId> })._instances.values();
}

function getCommandRegistrations(): ReadonlyMap<string, Iterable<ICommand>> {
	// Each id keeps a stack of registrations, while getCommands() only has the one on top.
	return (CommandsRegistry as unknown as { readonly _commands: ReadonlyMap<string, Iterable<ICommand>> })._commands;
}

function getKeybindingRules(): Iterable<IKeybindingRule> {
	// Rules keep the keybindings of every platform, while getDefaultKeybindings() only has those of the current one.
	return (KeybindingsRegistry as unknown as { readonly _coreKeybindingRules: Iterable<IKeybindingRule> })._coreKeybindingRules;
}

export function takeRegistrySnapshot(): IRegistrySnapshot {
	const menuItems = new Map<MenuId, ReadonlyMap<IMenuItem | ISubmenuItem, number>>();
	for (const id of getMenuIds()) {
		let items = MenuRegistry.getMenuItems(id);
		if (id === MenuId.CommandPalette) {
			// The command palette adds a new item for every command without an explicit one on each call.
			// Keep only the registered items, which are the same on every call: menuCommands covers the others.
			const registered = new Set(MenuRegistry.getMenuItems(id));
			items = items.filter(item => registered.has(item));
		}
		if (items.length) {
			menuItems.set(id, countRegistrations(items));
		}
	}
	return {
		commands: new Map(Array.from(getCommandRegistrations(), ([id, registrations]) => [id, countRegistrations(registrations)])),
		activeCommands: CommandsRegistry.getCommands(),
		menuCommands: new Map(MenuRegistry.getCommands()),
		menuItems,
		keybindings: countRegistrations(KeybindingsRegistry.getDefaultKeybindings()),
		keybindingRules: countRegistrations(getKeybindingRules()),
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

function diffCounts<T>(before: ReadonlyMap<T, number> | undefined, after: ReadonlyMap<T, number> | undefined, describe: (item: T) => string, changes: string[]): void {
	for (const item of new Set([...before?.keys() ?? [], ...after?.keys() ?? []])) {
		const delta = (after?.get(item) ?? 0) - (before?.get(item) ?? 0);
		for (let i = 0; i < Math.abs(delta); i++) {
			changes.push(`${delta > 0 ? 'registered' : 'unregistered'} ${describe(item)}`);
		}
	}
}

function describeMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): string {
	return `menu item '${isIMenuItem(item) ? item.command.id : `submenu ${item.submenu.id}`}' in '${menu.id}'`;
}

export function diffRegistrySnapshots(before: IRegistrySnapshot, after: IRegistrySnapshot): string[] {
	const changes: string[] = [];
	for (const id of new Set([...before.commands.keys(), ...after.commands.keys()])) {
		diffCounts(before.commands.get(id), after.commands.get(id), () => `command '${id}'`, changes);
	}
	for (const [id, command] of after.activeCommands) {
		const previous = before.activeCommands.get(id);
		if (previous && previous !== command && changes.every(change => !change.endsWith(` command '${id}'`))) {
			changes.push(`replaced command '${id}'`);
		}
	}
	diffMaps('menu command', before.menuCommands, after.menuCommands, changes);
	const menus = new Set([...before.menuItems.keys(), ...after.menuItems.keys()]);
	for (const menu of menus) {
		diffCounts(before.menuItems.get(menu), after.menuItems.get(menu), item => describeMenuItem(menu, item), changes);
	}
	diffCounts(before.keybindings, after.keybindings, item => `keybinding for '${item.command ?? '<none>'}'`, changes);
	diffCounts(before.keybindingRules, after.keybindingRules, rule => `keybinding rule for '${rule.id}'`, changes);
	return changes;
}

const maxReportedChanges = 20;

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
