/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../commands/common/commands.js';
import { MenuId, MenuRegistry } from '../../common/actions.js';
import { diffRegistrySnapshots, takeRegistrySnapshot } from './registryLeakCheck.js';

suite('Registry leak check', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports no changes for an unchanged command palette command without an explicit menu item', () => {
		const registrations = store.add(new DisposableStore());
		registrations.add(MenuRegistry.addCommand({ id: 'registryLeakCheck.test.implicit', title: 'Implicit' }));
		const before = takeRegistrySnapshot();
		assert.ok(MenuRegistry.getMenuItems(MenuId.CommandPalette).some(item => 'command' in item && item.command.id === 'registryLeakCheck.test.implicit'));
		assert.deepStrictEqual(diffRegistrySnapshots(before, takeRegistrySnapshot()), []);
		registrations.dispose();
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
