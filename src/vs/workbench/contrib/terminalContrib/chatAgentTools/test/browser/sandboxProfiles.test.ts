/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostConnectionInfo } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostSandboxConfigKey } from '../../../../../../platform/agentHost/common/sandboxConfigSchema.js';
import { TestSandboxProfilesHost as TestHost } from '../../../../../../platform/agentHost/test/common/sandboxProfilesTestUtils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { SandboxProfilesInput } from '../../browser/sandboxProfilesInput.js';

suite('Sandbox profiles editor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const domains = AgentNetworkDomainSettingId.AllowedNetworkDomains;

	function setup(host: TestHost | null = new TestHost()) {
		if (host) {
			disposables.add(host);
		}
		const connection = host ?? undefined;
		const onDidChangeConnections = disposables.add(new Emitter<void>());
		const connections = new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeConnections = onDidChangeConnections.event;
			override get connections(): IAgentHostConnectionInfo[] { return [{ authority: 'build', address: 'ssh:build', name: 'Build', isAmbient: false, connection }]; }
			override getConnectionByAuthority(authority: string) { return authority === 'build' ? connection : undefined; }
		};
		const config = new TestConfigurationService({ [domains]: ['original.example'] });
		// Each input is a separate client connected to the same host.
		const open = () => disposables.add(new SandboxProfilesInput('build', connections, config));
		return { host, config, open };
	}

	test('saves new profiles from current settings on the host, where other clients see them', async () => {
		const { host, config, open } = setup();
		const input = open();
		input.draft.name = ' Remote ';
		const list = input.draft.settings[domains];
		assert.ok(Array.isArray(list));
		list.push('new.example');
		await input.save();
		input.draft.name = 'Unsaved';
		await input.revert();
		const otherClient = open();
		assert.deepStrictEqual({
			name: input.draft.name,
			other: [otherClient.draft.name, otherClient.draft.settings[domains]],
			stored: Object.values(host!.values[AgentHostSandboxConfigKey.SandboxProfiles] as object).map(profile => [profile.name, profile.sandbox.allowedNetworkDomains]),
			settings: config.getValue(domains),
		}, {
			name: 'Remote',
			other: ['Remote', ['original.example', 'new.example']],
			stored: [['Remote', ['original.example', 'new.example']]],
			settings: ['original.example'],
		});
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

	test('rejects duplicate names, and deleting the active profile clears it for new sessions', async () => {
		const { host, open } = setup();
		const input = open();
		input.draft.name = 'Local';
		await input.save();
		const localId = input.draft.id;
		input.select();
		input.draft.name = ' local ';
		await assert.rejects(input.save());
		input.draft.name = 'Remote';
		await input.save();
		input.setActive(input.draft.id);
		const active = open().active === input.draft.id;
		input.deleteProfile(input.draft.id);
		assert.deepStrictEqual({ active, profiles: open().profiles.map(p => [p.id, p.name]), stored: host!.values[AgentHostSandboxConfigKey.ActiveSandboxProfile], after: input.active }, {
			active: true, profiles: [[localId, 'Local']], stored: '', after: undefined,
		});
	});

	test('shows changes from other clients without discarding an edit in progress', async () => {
		const { open } = setup();
		const input = open();
		input.draft.name = 'Shared';
		await input.save();
		const viewer = open();
		const editor = open();
		editor.edit();
		editor.draft.name = 'Local edit';
		input.draft = { ...input.draft, name: 'Renamed' };
		input.edit();
		await input.save();
		assert.deepStrictEqual([viewer.draft.name, editor.draft.name, editor.editing], ['Renamed', 'Local edit', true]);
	});

	test('cannot save to a host that is disconnected or does not support sandbox profiles', async () => {
		for (const host of [null, new TestHost(false)]) {
			const input = setup(host).open();
			await assert.rejects(input.save());
			assert.deepStrictEqual([input.available, input.profiles], [false, []]);
		}
	});
});
