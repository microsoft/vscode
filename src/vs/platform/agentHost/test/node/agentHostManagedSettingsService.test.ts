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
		service.removeClientPermissions('client-1');
		const afterFirstRemoval = service.permissions;
		service.removeClientPermissions('client-2');

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
		service.removeClientPermissions('client-1');
		service.removeClientPermissions('client-2');

		assert.strictEqual(changes, 2);
	});
});
