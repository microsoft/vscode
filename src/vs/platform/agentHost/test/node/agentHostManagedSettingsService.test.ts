/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';

suite('AgentHostManagedSettingsService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('intersects domain boundaries without enabling sandboxing and removes each owner independently', () => {
		const service = store.add(new AgentHostManagedSettingsService());
		service.setClientPermissions('a', { limitTo: ['Domain(*.example.com)'] });
		service.setClientPermissions('b', { limitTo: ['Domain(api.example.com)', 'Domain(other.example)'] });
		const overlapping = service.permissions;
		service.setClientPermissions('b', { limitTo: ['Domain(other.example)'] });
		const disjoint = service.permissions;
		service.removeClient('b');
		const remaining = service.permissions;
		service.setClientPermissions('a', { limitTo: [] });
		const empty = service.permissions;
		service.removeClient('a');
		assert.deepStrictEqual({ overlapping, disjoint, remaining, empty, removed: service.permissions }, {
			overlapping: { limitTo: ['Domain(api.example.com)'] },
			disjoint: { limitTo: [] },
			remaining: { limitTo: ['Domain(*.example.com)'] },
			empty: { limitTo: [] },
			removed: {},
		});
	});

});
