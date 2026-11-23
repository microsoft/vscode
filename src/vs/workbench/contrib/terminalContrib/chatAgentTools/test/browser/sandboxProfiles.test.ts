/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostConnectionInfo } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { assignHostSandboxProfile, readHostSandboxProfile } from '../../../../../../platform/agentHost/common/sandboxProfiles.js';
import { TestSandboxProfilesHost } from '../../../../../../platform/agentHost/test/common/sandboxProfilesTestUtils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { readSandboxProfiles } from '../../../../../../platform/sandbox/common/sandboxProfiles.js';
import { AgentSandboxSettingId as Sandbox } from '../../../../../../platform/sandbox/common/settings.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { SandboxProfilesInput } from '../../browser/sandboxProfilesInput.js';

suite('Sandbox profiles editor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const domains = AgentNetworkDomainSettingId.AllowedNetworkDomains;

	/** One machine: its library storage and the remote hosts it can reach (`undefined` = disconnected). */
	function setup(hosts: Record<string, TestSandboxProfilesHost | undefined> = {}) {
		const storage = disposables.add(new InMemoryStorageService());
		const config = new TestConfigurationService({ [domains]: ['original.example'] });
		const changes = disposables.add(new Emitter<void>());
		const connections = new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeConnections = changes.event;
			override get connections(): IAgentHostConnectionInfo[] {
				return Object.entries(hosts).map(([address, connection]) => ({ authority: address, address, name: address, isAmbient: false, connection }));
			}
		};
		const open = () => disposables.add(new SandboxProfilesInput(storage, config, connections));
		return { storage, config, open, connections, fireConnectionsChanged: () => changes.fire() };
	}

	function host() {
		return disposables.add(new TestSandboxProfilesHost());
	}

	test('saves new profiles from current settings to this machine only, shared by every window', async () => {
		const { storage, config, open } = setup();
		const input = open();
		input.draft.name = ' Remote ';
		const list = input.draft.settings[domains];
		assert.ok(Array.isArray(list));
		list.push('new.example');
		await input.save();
		input.draft.name = 'Unsaved';
		await input.revert();
		const otherWindow = open();
		assert.deepStrictEqual({
			name: input.draft.name,
			otherWindow: [otherWindow.draft.name, otherWindow.draft.settings[domains]],
			machineScoped: storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE).includes('chat.sandboxProfiles.v1'),
			synced: storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.USER).length + storage.keys(StorageScope.PROFILE, StorageTarget.USER).length,
			settings: config.getValue(domains),
		}, {
			name: 'Remote',
			otherWindow: ['Remote', ['original.example', 'new.example']],
			machineScoped: true,
			synced: 0,
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

	test('rejects duplicate names and updates by stable ID', async () => {
		const { open } = setup();
		const input = open();
		input.draft.name = 'Local';
		await input.save();
		const id = input.draft.id;
		input.select();
		input.draft.name = ' local ';
		await assert.rejects(input.save());
		input.select(input.profiles[0]);
		input.edit();
		input.draft.name = 'Renamed';
		await input.save();
		assert.deepStrictEqual(open().profiles.map(p => [p.id, p.name]), [[id, 'Renamed']]);
	});

	test('saving pushes the edit to connected hosts using the profile, not to other or disconnected hosts', async () => {
		const [build, other, unassigned] = [host(), host(), host()];
		const hosts: Record<string, TestSandboxProfilesHost | undefined> = { build, other, unassigned, offline: undefined };
		const { open } = setup(hosts);
		const input = open();
		input.draft.name = 'Strict';
		await input.save();
		const strict = input.profiles[0];
		input.select();
		input.draft.name = 'Open';
		await input.save();
		const openProfile = input.profiles[1];
		const offline = host();
		for (const [connection, profile] of [[build, strict], [other, openProfile], [offline, strict]] as const) {
			assignHostSandboxProfile(connection, profile);
		}
		input.select(strict);
		input.edit();
		input.draft.name = 'Strict v2';
		input.draft.settings[domains] = ['edited.example'];
		await input.save();
		hosts.offline = offline;
		const read = (connection: TestSandboxProfilesHost) => {
			const assigned = readHostSandboxProfile(connection);
			return assigned && [assigned.name, assigned.sandbox.allowedNetworkDomains];
		};
		assert.deepStrictEqual({ build: read(build), other: read(other), unassigned: read(unassigned), offline: read(offline) }, {
			build: ['Strict v2', ['edited.example']],
			other: ['Open', ['original.example']],
			unassigned: null,
			// Disconnected while saving: keeps its copy until the profile is assigned again.
			offline: ['Strict', ['original.example']],
		});
	});

	test('a profile in use by a connected remote environment cannot be deleted; disconnected hosts keep their copy', async () => {
		const build = host();
		const offline = host();
		const hosts: Record<string, TestSandboxProfilesHost | undefined> = { build, other: host(), offline: undefined };
		const { storage, open } = setup(hosts);
		const input = open();
		input.draft.name = 'Strict';
		await input.save();
		const strict = input.profiles[0];
		assignHostSandboxProfile(build, strict);
		assignHostSandboxProfile(offline, strict);
		const inUse = { hosts: input.hostsUsingProfile(strict.id), deleted: input.deleteProfile(strict.id), library: readSandboxProfiles(storage).map(p => p.name) };
		assignHostSandboxProfile(build, undefined);
		const unassigned = { deleted: input.deleteProfile(strict.id), library: readSandboxProfiles(storage) };
		hosts.offline = offline;
		assert.deepStrictEqual({ inUse, unassigned, offlineCopy: readHostSandboxProfile(offline)?.name }, {
			inUse: { hosts: ['build'], deleted: false, library: ['Strict'] },
			unassigned: { deleted: true, library: [] },
			// Only connected hosts are checked; a host that was disconnected keeps using its own copy.
			offlineCopy: 'Strict',
		});
	});
	test('a draft of a profile deleted in another window cannot be saved and does not bring it back', async () => {
		const build = host();
		const { storage, open } = setup({ build });
		const editor = open();
		editor.draft.name = 'Strict';
		await editor.save();
		const strict = editor.profiles[0];
		assignHostSandboxProfile(build, strict);
		editor.edit();
		editor.draft.name = 'Strict v2';
		editor.changed();
		const otherWindow = open();
		otherWindow.deleteProfile(strict.id); // blocked: build uses it
		assignHostSandboxProfile(build, undefined);
		otherWindow.deleteProfile(strict.id);
		await assert.rejects(editor.save());
		assert.deepStrictEqual({ library: readSandboxProfiles(storage), host: readHostSandboxProfile(build), error: !!editor.saveError }, { library: [], host: null, error: true });
	});

	test('invalid JSON text is an unsaved change that blocks saving until fixed or discarded', async () => {
		const { storage, open } = setup();
		const input = open();
		input.draft.name = 'Strict';
		await input.save();
		input.edit();
		const key = Sandbox.AgentSandboxUserConfiguredPaths;
		input.setInvalidText(key, '{ "readwritePaths": [');
		const invalid = { dirty: input.isDirty(), text: input.invalidText(key), error: !!input.saveError };
		await assert.rejects(input.save());
		await input.revert();
		assert.deepStrictEqual({ invalid, reverted: { dirty: input.isDirty(), text: input.invalidText(key), error: input.saveError }, library: readSandboxProfiles(storage).map(p => p.name) }, {
			invalid: { dirty: true, text: '{ "readwritePaths": [', error: true },
			reverted: { dirty: false, text: undefined, error: undefined },
			library: ['Strict'],
		});
	});
	test('shows library changes from another window without discarding an edit in progress', async () => {
		const { open } = setup();
		const input = open();
		input.draft.name = 'Shared';
		await input.save();
		const viewer = open();
		const editor = open();
		editor.edit();
		editor.draft.name = 'Local edit';
		input.edit();
		input.draft.name = 'Renamed';
		await input.save();
		assert.deepStrictEqual([viewer.draft.name, editor.draft.name, editor.editing], ['Renamed', 'Local edit', true]);
	});
});
