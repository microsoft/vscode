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

		service.setClientContribution('client-1', {
			permissions: { disableBypassPermissionsMode: 'disable' },
			enabledPlugins: { 'required@marketplace': true },
		});
		service.setClientContribution('client-2', {
			permissions: { ask: ['Shell'], deny: ['Write(**)'] },
			enabledPlugins: { 'required@marketplace': false, 'other@marketplace': true },
		});
		const combined = service.permissions;
		const combinedPlugins = service.enabledPlugins;
		service.removeClientContribution('client-1');
		const afterFirstRemoval = service.permissions;
		const pluginsAfterFirstRemoval = service.enabledPlugins;
		service.removeClientContribution('client-2');

		assert.deepStrictEqual({
			combined,
			combinedPlugins,
			afterFirstRemoval,
			pluginsAfterFirstRemoval,
			afterAllRemoved: service.permissions,
			pluginsAfterAllRemoved: service.enabledPlugins,
		}, {
			combined: {
				disableBypassPermissionsMode: 'disable',
				ask: ['Shell'],
				deny: ['Write(**)'],
			},
			combinedPlugins: {
				'required@marketplace': false,
				'other@marketplace': true,
			},
			afterFirstRemoval: {
				ask: ['Shell'],
				deny: ['Write(**)'],
			},
			pluginsAfterFirstRemoval: {
				'required@marketplace': false,
				'other@marketplace': true,
			},
			afterAllRemoved: {},
			pluginsAfterAllRemoved: {},
		});
	});

	test('only fires when the effective aggregate changes', () => {
		const service = store.add(new AgentHostManagedSettingsService());
		let changes = 0;
		store.add(service.onDidChange(() => changes++));

		service.setClientContribution('client-1', { permissions: { ask: ['Shell'] }, enabledPlugins: {} });
		service.setClientContribution('client-2', { permissions: { ask: ['Shell'] }, enabledPlugins: {} });
		service.removeClientContribution('client-1');
		service.removeClientContribution('client-2');

		assert.strictEqual(changes, 2);
	});
});
