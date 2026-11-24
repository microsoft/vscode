/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostConnectionInfo } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { assignHostSandboxProfile, readHostSandboxProfile, readSandboxProfileAssignments, rememberSandboxProfileAssignment } from '../../../../../../platform/agentHost/common/sandboxProfiles.js';
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

	/** Selects New Profile, then renames the profile and saves it. */
	async function create(input: SandboxProfilesInput, name: string) {
		input.createProfile();
		draft(input).name = name;
		await input.save();
		return input.profiles.find(profile => profile.name === name.trim())!;
	}

	function draft(input: SandboxProfilesInput) {
		assert.ok(input.draft);
		return input.draft;
	}

	test('starts empty; New Profile saves a profile from current settings to this machine only', async () => {
		const { storage, config, open } = setup();
		const input = open();
		const initial = { selected: input.draft, profiles: input.profiles.length };
		input.createProfile();
		const created = { name: draft(input).name, saved: input.profiles.map(p => p.name), dirty: input.isDirty() };
		// Editing a profile changes only the profile, not the user's settings.
		const list = draft(input).settings[domains];
		assert.ok(Array.isArray(list));
		list.push('new.example');
		draft(input).name = ' Remote ';
		await input.save();
		input.createProfile();
		const otherWindow = open();
		otherWindow.select(otherWindow.profiles.find(p => p.name === 'Remote'));
		assert.deepStrictEqual({
			initial,
			created,
			next: draft(input).name,
			otherWindow: [draft(otherWindow).name, draft(otherWindow).settings[domains]],
			machineScoped: storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE).includes('chat.sandboxProfiles.v1'),
			synced: storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.USER).length + storage.keys(StorageScope.PROFILE, StorageTarget.USER).length,
			settings: config.getValue(domains),
		}, {
			initial: { selected: undefined, profiles: 0 },
			created: { name: 'sandbox_profile_1', saved: ['sandbox_profile_1'], dirty: false },
			next: 'sandbox_profile_1',
			otherWindow: ['Remote', ['original.example', 'new.example']],
			machineScoped: true,
			synced: 0,
			settings: ['original.example'],
		});
	});

	test('saves valid changes automatically and updates the profile\'s hosts; invalid changes stay unsaved', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const build = host();
		const { storage, open } = setup({ build });
		const input = open();
		const strict = await create(input, 'Strict');
		assignHostSandboxProfile(build, strict);
		draft(input).settings[domains] = ['edited.example'];
		input.changed();
		const library = () => readSandboxProfiles(storage).find(p => p.id === strict.id)?.settings[domains];
		const pending = { dirty: input.isDirty(), library: library() };
		await timeout(500);
		const saved = { dirty: input.isDirty(), library: library(), host: readHostSandboxProfile(build)?.sandbox.allowedNetworkDomains };
		draft(input).name = '';
		input.changed();
		await timeout(500);
		assert.deepStrictEqual({ pending, saved, invalid: { dirty: input.isDirty(), library: readSandboxProfiles(storage).map(p => p.name) } }, {
			pending: { dirty: false, library: ['original.example'] },
			saved: { dirty: false, library: ['edited.example'], host: ['edited.example'] },
			invalid: { dirty: true, library: ['Strict'] },
		});
	}));

	test('rejects duplicate names and updates by stable ID', async () => {
		const { open } = setup();
		const input = open();
		const local = await create(input, 'Local');
		input.createProfile();
		draft(input).name = ' local ';
		await assert.rejects(input.save());
		await input.revert();
		input.select(local);
		draft(input).name = 'Renamed';
		await input.save();
		assert.deepStrictEqual(open().profiles.map(p => [p.id, p.name]), [[local.id, 'Renamed'], [input.profiles[1].id, 'sandbox_profile_1']]);
	});

	test('saving pushes the edit to connected hosts using the profile, not to other or disconnected hosts', async () => {
		const [build, other, unassigned] = [host(), host(), host()];
		const hosts: Record<string, TestSandboxProfilesHost | undefined> = { build, other, unassigned, offline: undefined };
		const { open } = setup(hosts);
		const input = open();
		const strict = await create(input, 'Strict');
		const openProfile = await create(input, 'Open');
		const offline = host();
		for (const [connection, profile] of [[build, strict], [other, openProfile], [offline, strict]] as const) {
			assignHostSandboxProfile(connection, profile);
		}
		input.select(strict);
		draft(input).name = 'Strict v2';
		draft(input).settings[domains] = ['edited.example'];
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

	test('a profile assigned to a remote environment cannot be deleted, including after the host disconnects, until it is unassigned', async () => {
		const build = host();
		const hosts: Record<string, TestSandboxProfilesHost | undefined> = { build, other: host() };
		const { storage, open } = setup(hosts);
		const input = open();
		const strict = await create(input, 'Strict');
		assignHostSandboxProfile(build, strict);
		const connected = { hosts: input.hostsUsingProfile(strict.id), deleted: input.deleteProfile(strict.id) };
		hosts.build = undefined;
		input.dispose();
		const reopened = open();
		const disconnected = { hosts: reopened.hostsUsingProfile(strict.id), deleted: reopened.deleteProfile(strict.id) };
		// Another device clears the assignment while this machine is offline: the last-known assignment still blocks deletion.
		assignHostSandboxProfile(build, undefined);
		const changedWhileOffline = reopened.deleteProfile(strict.id);
		hosts.build = build;
		const reconnected = { deleted: reopened.deleteProfile(strict.id), library: readSandboxProfiles(storage), selected: reopened.draft?.name };
		assert.deepStrictEqual({ connected, disconnected, changedWhileOffline, reconnected }, {
			connected: { hosts: ['build'], deleted: false },
			disconnected: { hosts: ['build'], deleted: false },
			changedWhileOffline: false,
			reconnected: { deleted: true, library: [], selected: undefined },
		});
	});

	test('unavailable host state keeps the last-known assignment; only Default clears it', () => {
		const { storage } = setup();
		rememberSandboxProfileAssignment(storage, 'ssh:build', 'Build', { id: 'strict', name: 'Strict', sandbox: {} });
		rememberSandboxProfileAssignment(storage, 'ssh:build', 'Build', undefined);
		const unavailable = readSandboxProfileAssignments(storage).map(assignment => assignment.profile.id);
		rememberSandboxProfileAssignment(storage, 'ssh:build', 'Build', null);
		assert.deepStrictEqual({ unavailable, cleared: readSandboxProfileAssignments(storage) }, { unavailable: ['strict'], cleared: [] });
	});

	test('edits of a profile deleted in another window are not saved and do not bring it back', async () => {
		const build = host();
		const { storage, open } = setup({ build });
		const editor = open();
		const strict = await create(editor, 'Strict');
		assignHostSandboxProfile(build, strict);
		draft(editor).name = 'Strict v2';
		editor.changed();
		const otherWindow = open();
		otherWindow.deleteProfile(strict.id); // blocked: build uses it
		assignHostSandboxProfile(build, undefined);
		otherWindow.deleteProfile(strict.id);
		editor.flush();
		assert.deepStrictEqual({ library: readSandboxProfiles(storage).map(p => p.name), host: readHostSandboxProfile(build), selected: editor.draft?.name }, { library: [], host: null, selected: undefined });
	});

	test('invalid JSON text is an unsaved change that blocks saving until fixed or discarded', async () => {
		const { storage, open } = setup();
		const input = open();
		await create(input, 'Strict');
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
		const shared = await create(input, 'Shared');
		const viewer = open();
		const editor = open();
		viewer.select(shared);
		editor.select(shared);
		draft(editor).name = 'Local edit';
		draft(input).name = 'Renamed';
		await input.save();
		assert.deepStrictEqual([draft(viewer).name, draft(editor).name], ['Renamed', 'Local edit']);
	});

	test('a name taken or freed in another window updates whether a kept edit is saved', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { storage, open } = setup();
		const other = open();
		const edited = await create(other, 'Edited');
		const conflicting = await create(other, 'Other');
		const editor = open();
		editor.select(edited);
		draft(editor).name = 'Strict';
		editor.changed();
		other.select(conflicting);
		draft(other).name = 'Strict';
		await other.save();
		const taken = { dirty: editor.isDirty(), error: editor.saveError };
		draft(other).name = 'Other';
		await other.save();
		const freed = editor.isDirty();
		await timeout(500);
		assert.deepStrictEqual({ taken, freed, library: readSandboxProfiles(storage).map(p => p.name) }, {
			taken: { dirty: true, error: 'A profile with that name already exists.' },
			freed: false,
			library: ['Strict', 'Other'],
		});
	}));
});