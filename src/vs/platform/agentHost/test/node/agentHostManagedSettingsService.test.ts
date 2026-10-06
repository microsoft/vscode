/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';

suite('AgentHostManagedSettingsService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('intersects client boundaries and restores surviving restrictions after removal', () => {
		const service = store.add(new AgentHostManagedSettingsService());
		service.setClientPermissions('broad', { limitTo: ['Domain(*.example.com)'], ask: ['Shell'] });
		service.setClientPermissions('narrow', { limitTo: ['Domain(api.example.com)'] });
		assert.deepStrictEqual(service.permissions, { ask: ['Shell'], limitTo: ['Domain(api.example.com)'] });
		service.setClientPermissions('disjoint', { limitTo: ['Domain(other.example)'] });
		assert.deepStrictEqual(service.permissions, { ask: ['Shell'], limitTo: [] });
		service.removeClient('disjoint');
		assert.deepStrictEqual(service.permissions, { ask: ['Shell'], limitTo: ['Domain(api.example.com)'] });
		service.setClientPermissions('narrow', {});
		assert.deepStrictEqual(service.permissions, { ask: ['Shell'], limitTo: ['Domain(*.example.com)'] });
		service.removeClient('broad');
		assert.deepStrictEqual(service.permissions, {});
	});

	test('keeps explicit deny-all and does not notify for rule reordering', () => {
		const service = store.add(new AgentHostManagedSettingsService());
		let changes = 0;
		store.add(service.onDidChange(() => changes++));
		service.setClientPermissions('owner', { limitTo: ['Domain(b.example)', 'Domain(a.example)'] });
		service.setClientPermissions('owner', { limitTo: ['Domain(a.example)', 'Domain(b.example)', 'Domain(a.example)'] });
		assert.strictEqual(changes, 1);
		service.setClientPermissions('owner', { limitTo: [] });
		assert.deepStrictEqual(service.permissions, { limitTo: [] });
		assert.strictEqual(changes, 2);
	});

	test('aggregates restrictive client contributions and removes them by owner', () => {
		const service = store.add(new AgentHostManagedSettingsService());

		service.setClientPermissions('client-1', { disableBypassPermissionsMode: 'disable' });
		service.setClientPermissions('client-2', { ask: ['Shell'], deny: ['Write(**)'] });
		const combined = service.permissions;
		service.removeClient('client-1');
		const afterFirstRemoval = service.permissions;
		service.removeClient('client-2');

		assert.deepStrictEqual({
			combined,
			afterFirstRemoval,
			afterAllRemoved: service.permissions,
		}, {
			combined: {
				disableBypassPermissionsMode: 'disable',
				ask: ['Shell'],
				deny: ['Write(**)'],
			},
			afterFirstRemoval: {
				ask: ['Shell'],
				deny: ['Write(**)'],
			},
			afterAllRemoved: {},
		});
	});

	test('only fires when the effective aggregate changes', () => {
		const service = store.add(new AgentHostManagedSettingsService());
		let changes = 0;
		store.add(service.onDidChange(() => changes++));

		service.setClientPermissions('client-1', { ask: ['Shell'] });
		service.setClientPermissions('client-2', { ask: ['Shell'] });
		service.removeClient('client-1');
		service.removeClient('client-2');

		assert.strictEqual(changes, 2);
	});

});
