/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../commands/common/commands.js';
import { IKeybindingRule, KeybindingsRegistry, KeybindingWeight } from '../../../keybinding/common/keybindingsRegistry.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../common/actions.js';
import { diffRegistrySnapshots, takeRegistrySnapshot } from './registryLeakCheck.js';

suite('Registry leak check', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports no changes for an unchanged command palette command without an explicit menu item', () => {
		const registrations = store.add(new DisposableStore());
		registrations.add(MenuRegistry.addCommand({ id: 'registryLeakCheck.test.implicit', title: 'Implicit' }));
		const before = takeRegistrySnapshot();
		assert.ok(MenuRegistry.getMenuItems(MenuId.CommandPalette).some(item => isIMenuItem(item) && item.command.id === 'registryLeakCheck.test.implicit'));
		assert.deepStrictEqual(diffRegistrySnapshots(before, takeRegistrySnapshot()), []);
		registrations.dispose();
	});

	test('reports a keybinding rule that only binds on another platform', () => {
		const registrations = store.add(new DisposableStore());
		const before = takeRegistrySnapshot();
		const otherPlatform: IKeybindingRule = OS === OperatingSystem.Macintosh
			? { id: 'registryLeakCheck.test.keybinding', weight: KeybindingWeight.WorkbenchContrib, primary: 0, win: { primary: KeyMod.CtrlCmd | KeyCode.KeyJ } }
			: { id: 'registryLeakCheck.test.keybinding', weight: KeybindingWeight.WorkbenchContrib, primary: 0, mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyJ } };
		registrations.add(KeybindingsRegistry.registerKeybindingRule(otherPlatform));
		const changes = diffRegistrySnapshots(before, takeRegistrySnapshot());
		registrations.dispose();
		assert.deepStrictEqual({
			changes,
			restored: diffRegistrySnapshots(before, takeRegistrySnapshot()),
		}, {
			changes: [`registered keybinding rule for 'registryLeakCheck.test.keybinding'`],
			restored: [],
		});
	});

	test('reports a command object that is registered again', () => {
		const registrations = store.add(new DisposableStore());
		const command = { id: 'registryLeakCheck.test.duplicateCommand', handler: () => { } };
		registrations.add(CommandsRegistry.registerCommand(command));
		const before = takeRegistrySnapshot();
		registrations.add(CommandsRegistry.registerCommand(command));
		const changes = diffRegistrySnapshots(before, takeRegistrySnapshot());
		registrations.dispose();
		assert.deepStrictEqual(changes, [`registered command 'registryLeakCheck.test.duplicateCommand'`]);
	});

	test('reports a command whose registrations change order', () => {
		const registrations = store.add(new DisposableStore());
		const a = { id: 'registryLeakCheck.test.order', handler: () => { } };
		const b = { id: 'registryLeakCheck.test.order', handler: () => { } };
		const first = registrations.add(CommandsRegistry.registerCommand(a));
		registrations.add(CommandsRegistry.registerCommand(b));
		const before = takeRegistrySnapshot();
		first.dispose();
		registrations.add(CommandsRegistry.registerCommand(a));
		const changes = diffRegistrySnapshots(before, takeRegistrySnapshot());
		registrations.dispose();
		assert.deepStrictEqual(changes, [`replaced command 'registryLeakCheck.test.order'`]);
	});

	test('reports a menu item object that is registered again', () => {
		const registrations = store.add(new DisposableStore());
		const item = { command: { id: 'registryLeakCheck.test.duplicate', title: 'Duplicate' } };
		registrations.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, item));
		const before = takeRegistrySnapshot();
		registrations.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, item));
		const changes = diffRegistrySnapshots(before, takeRegistrySnapshot());
		registrations.dispose();
		assert.deepStrictEqual(changes, [`registered menu item 'registryLeakCheck.test.duplicate' in 'CommandPalette'`]);
	});

	test('reports what was registered and unregistered between snapshots', () => {
		const registrations = store.add(new DisposableStore());
		const before = takeRegistrySnapshot();
		registrations.add(CommandsRegistry.registerCommand('registryLeakCheck.test.command', () => { }));
		registrations.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: 'registryLeakCheck.test.command', title: 'Command' } }));
		const registered = diffRegistrySnapshots(before, takeRegistrySnapshot());
		const after = takeRegistrySnapshot();
		registrations.dispose();
		assert.deepStrictEqual({
			registered,
			unregistered: diffRegistrySnapshots(after, takeRegistrySnapshot()),
			restored: diffRegistrySnapshots(before, takeRegistrySnapshot()),
		}, {
			registered: [
				`registered command 'registryLeakCheck.test.command'`,
				`registered menu item 'registryLeakCheck.test.command' in 'CommandPalette'`,
			],
			unregistered: [
				`unregistered command 'registryLeakCheck.test.command'`,
				`unregistered menu item 'registryLeakCheck.test.command' in 'CommandPalette'`,
			],
			restored: [],
		});
	});
});
