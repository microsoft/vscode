/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { SandboxProfilesInput } from '../../browser/sandboxProfilesInput.js';

suite('Sandbox profiles editor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const domains = AgentNetworkDomainSettingId.AllowedNetworkDomains;
	function setup() {
		const storage = disposables.add(new InMemoryStorageService());
		const config = new TestConfigurationService({ [domains]: ['original.example'] });
		const open = () => disposables.add(new SandboxProfilesInput(storage, config));
		return { config, open };
	}

	test('copies current settings and persists only explicit saves', async () => {
		const { config, open } = setup();
		const input = open();
		input.draft.name = ' Remote ';
		const list = input.draft.settings[domains];
		assert.ok(Array.isArray(list));
		list.push('new.example');
		await input.save();
		input.draft.name = 'Unsaved';
		await input.revert();
		const restored = open();
		assert.deepStrictEqual([input.draft.name, restored.draft.name, restored.draft.settings[domains], config.getValue(domains)], [
			'Remote', 'Remote', ['original.example', 'new.example'], ['original.example'],
		]);
	});

	test('opens new profiles with a unique default name and saved profiles read-only', async () => {
		const { open } = setup();
		const input = open();
		const first = { name: input.draft.name, editing: input.editing };
		await input.save();
		const saved = { name: input.draft.name, editing: input.editing };
		input.edit();
		const editing = input.editing;
		input.select();
		assert.deepStrictEqual({ first, saved, editing, next: input.draft.name }, {
			first: { name: 'sandbox_profile_1', editing: true },
			saved: { name: 'sandbox_profile_1', editing: false },
			editing: true,
			next: 'sandbox_profile_2',
		});
	});

	test('rejects duplicate names and updates and deletes by stable ID', async () => {
		const { open } = setup();
		const input = open();
		input.draft.name = 'Local';
		await input.save();
		const originalId = input.draft.id;
		input.select();
		input.draft.name = ' local ';
		await assert.rejects(input.save());
		input.draft.name = 'Remote';
		await input.save();
		input.draft.name = 'Build';
		await input.save();
		input.deleteSelected();
		assert.deepStrictEqual(open().profiles.map(p => [p.id, p.name]), [[originalId, 'Local']]);
	});
});
