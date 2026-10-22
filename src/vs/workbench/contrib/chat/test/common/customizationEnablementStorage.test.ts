/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { AGENT_HOST_TOOL_SET_ENABLEMENT_STORAGE_KEY, AGENT_PLUGIN_ENABLEMENT_IDENTITIES_STORAGE_KEY, AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY, CUSTOMIZATION_ENABLEMENT_MIGRATED_PROFILES_KEY, MCP_ENABLEMENT_STORAGE_KEY, migrateCustomizationEnablementToApplicationStorage } from '../../common/customizationEnablementStorage.js';
import { ContributionEnablementState, EnablementModel } from '../../common/enablement.js';
import { AgentPluginEnablementService } from '../../common/plugins/agentPluginEnablement.js';
import { createTestProfile, createTestProfileService, SharedApplicationStorageDatabase, TestWindowStorageService } from './testSharedApplicationStorage.js';

suite('Customization enablement storage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const defaultProfile = createTestProfile('__default__profile__', { isDefault: true });
	const agentsProfile = createTestProfile('agents');

	const ALL_KEYS = [MCP_ENABLEMENT_STORAGE_KEY, AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY, AGENT_PLUGIN_ENABLEMENT_IDENTITIES_STORAGE_KEY, AGENT_HOST_TOOL_SET_ENABLEMENT_STORAGE_KEY, CUSTOMIZATION_ENABLEMENT_MIGRATED_PROFILES_KEY];

	function readScope(storage: IStorageService, scope: StorageScope): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const key of ALL_KEYS) {
			const value = storage.get(key, scope);
			if (value !== undefined) {
				result[key] = JSON.parse(value);
			}
		}
		return result;
	}

	function storeAll(storage: IStorageService, scope: StorageScope, values: Record<string, unknown>): void {
		for (const [key, value] of Object.entries(values)) {
			storage.store(key, JSON.stringify(value), scope, StorageTarget.MACHINE);
		}
	}

	async function createWindow(shared: SharedApplicationStorageDatabase): Promise<TestWindowStorageService> {
		return store.add(new TestWindowStorageService(shared)).init();
	}

	test('EnablementModel stores global decisions in application storage', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store(MCP_ENABLEMENT_STORAGE_KEY, JSON.stringify([['existing', false]]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		const model = store.add(new EnablementModel(MCP_ENABLEMENT_STORAGE_KEY, storage));

		model.setEnabled('global', ContributionEnablementState.DisabledProfile);
		model.setEnabled('workspace', ContributionEnablementState.DisabledWorkspace);

		assert.deepStrictEqual({
			existing: model.readEnabled('existing'),
			application: storage.get(MCP_ENABLEMENT_STORAGE_KEY, StorageScope.APPLICATION),
			profile: storage.get(MCP_ENABLEMENT_STORAGE_KEY, StorageScope.PROFILE),
			workspace: storage.get(MCP_ENABLEMENT_STORAGE_KEY, StorageScope.WORKSPACE),
		}, {
			existing: ContributionEnablementState.DisabledProfile,
			application: JSON.stringify([['existing', false], ['global', false]]),
			profile: undefined,
			workspace: JSON.stringify([['workspace', false]]),
		});
	});

	test('windows with different profiles see each other\'s MCP and plugin switches', async () => {
		const shared = new SharedApplicationStorageDatabase();
		const editorStorage = await createWindow(shared);
		const agentsStorage = await createWindow(shared);
		const editorMcp = store.add(new EnablementModel(MCP_ENABLEMENT_STORAGE_KEY, editorStorage));
		const agentsMcp = store.add(new EnablementModel(MCP_ENABLEMENT_STORAGE_KEY, agentsStorage));
		const editorPlugins = store.add(new AgentPluginEnablementService(editorStorage, createTestProfileService(defaultProfile)));
		const agentsPlugins = store.add(new AgentPluginEnablementService(agentsStorage, createTestProfileService(agentsProfile)));
		const original = URI.file('/plugins/original');
		const moved = URI.file('/plugins/moved');

		const seenInAgentsWindow: ContributionEnablementState[] = [];
		store.add(autorun(reader => seenInAgentsWindow.push(agentsMcp.readEnabled('server', reader))));

		editorMcp.setEnabled('server', ContributionEnablementState.DisabledProfile);
		agentsPlugins.setEnabled(original.toString(), ContributionEnablementState.DisabledProfile);
		agentsPlugins.copyEnablement(original, moved);

		assert.deepStrictEqual({
			seenInAgentsWindow,
			editorPluginMoved: editorPlugins.readEnabled(moved.toString()),
			editorProfileStorage: editorStorage.get(AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY, StorageScope.PROFILE),
			agentsProfileStorage: agentsStorage.get(AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY, StorageScope.PROFILE),
		}, {
			seenInAgentsWindow: [ContributionEnablementState.EnabledProfile, ContributionEnablementState.DisabledProfile],
			editorPluginMoved: ContributionEnablementState.DisabledProfile,
			editorProfileStorage: undefined,
			agentsProfileStorage: undefined,
		});
	});

	suite('migration', () => {
		const applicationValues = {
			[MCP_ENABLEMENT_STORAGE_KEY]: [['both-on', true], ['app-off', false], ['app-only', true]],
			[AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY]: [['plugin-a', true]],
			[AGENT_PLUGIN_ENABLEMENT_IDENTITIES_STORAGE_KEY]: [['uri-shared', 'identity-app']],
			[AGENT_HOST_TOOL_SET_ENABLEMENT_STORAGE_KEY]: { cli: { toolSets: { appSet: false }, tools: { tool: true } } },
		};
		const profileValues = {
			[MCP_ENABLEMENT_STORAGE_KEY]: [['both-on', true], ['app-off', true], ['profile-off', false]],
			[AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY]: [['plugin-a', false], ['plugin-b', true]],
			[AGENT_PLUGIN_ENABLEMENT_IDENTITIES_STORAGE_KEY]: [['uri-shared', 'identity-profile'], ['uri-profile', 'identity-profile']],
			[AGENT_HOST_TOOL_SET_ENABLEMENT_STORAGE_KEY]: { cli: { toolSets: { profileSet: false }, tools: { tool: false, other: true } }, claude: { toolSets: { s: false } } },
		};
		const mergedValues = {
			[MCP_ENABLEMENT_STORAGE_KEY]: [['both-on', true], ['app-off', false], ['app-only', true], ['profile-off', false]],
			[AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY]: [['plugin-a', false], ['plugin-b', true]],
			[AGENT_PLUGIN_ENABLEMENT_IDENTITIES_STORAGE_KEY]: [['uri-shared', 'identity-app'], ['uri-profile', 'identity-profile']],
			[AGENT_HOST_TOOL_SET_ENABLEMENT_STORAGE_KEY]: {
				cli: { toolSets: { appSet: false, profileSet: false }, tools: { tool: false, other: true } },
				claude: { toolSets: { s: false }, tools: {} },
			},
			[CUSTOMIZATION_ENABLEMENT_MIGRATED_PROFILES_KEY]: ['agents'],
		};

		function createStorage(): InMemoryStorageService {
			const storage = store.add(new InMemoryStorageService());
			storeAll(storage, StorageScope.APPLICATION, applicationValues);
			storeAll(storage, StorageScope.PROFILE, profileValues);
			return storage;
		}

		test('merges each key shape into application storage with off wins and keeps profile values', () => {
			const storage = createStorage();

			migrateCustomizationEnablementToApplicationStorage(storage, agentsProfile);

			assert.deepStrictEqual({
				application: readScope(storage, StorageScope.APPLICATION),
				profile: readScope(storage, StorageScope.PROFILE),
			}, {
				application: mergedValues,
				profile: profileValues,
			});
		});

		test('runs once per profile', () => {
			const storage = createStorage();
			migrateCustomizationEnablementToApplicationStorage(storage, agentsProfile);
			// A later re-enable in shared storage must not be overridden by the stale profile value.
			storage.store(MCP_ENABLEMENT_STORAGE_KEY, JSON.stringify([]), StorageScope.APPLICATION, StorageTarget.MACHINE);

			migrateCustomizationEnablementToApplicationStorage(storage, agentsProfile);
			const afterRerun = readScope(storage, StorageScope.APPLICATION);
			migrateCustomizationEnablementToApplicationStorage(storage, createTestProfile('work'));

			assert.deepStrictEqual({
				afterRerun,
				migratedProfiles: readScope(storage, StorageScope.APPLICATION)[CUSTOMIZATION_ENABLEMENT_MIGRATED_PROFILES_KEY],
			}, {
				afterRerun: { ...mergedValues, [MCP_ENABLEMENT_STORAGE_KEY]: [] },
				migratedProfiles: ['agents', 'work'],
			});
		});

		test('ignores unreadable profile values and still marks the profile migrated', () => {
			const storage = store.add(new InMemoryStorageService());
			storeAll(storage, StorageScope.APPLICATION, applicationValues);
			for (const key of Object.keys(profileValues)) {
				storage.store(key, '{not json', StorageScope.PROFILE, StorageTarget.MACHINE);
			}

			migrateCustomizationEnablementToApplicationStorage(storage, agentsProfile);

			assert.deepStrictEqual(readScope(storage, StorageScope.APPLICATION), {
				...applicationValues,
				[CUSTOMIZATION_ENABLEMENT_MIGRATED_PROFILES_KEY]: ['agents'],
			});
		});

		for (const [name, profile] of [
			['default profile', defaultProfile],
			['profile using default global state', createTestProfile('shared-state', { useDefaultGlobalState: true })],
		] as [string, IUserDataProfile][]) {
			test(`skips ${name}`, () => {
				const storage = createStorage();

				migrateCustomizationEnablementToApplicationStorage(storage, profile);

				assert.deepStrictEqual(readScope(storage, StorageScope.APPLICATION), applicationValues);
			});
		}

		test('runs before an owner first reads, so another window sees migrated values', async () => {
			const shared = new SharedApplicationStorageDatabase();
			const editorStorage = await createWindow(shared);
			const agentsStorage = await createWindow(shared);
			const editorPlugins = store.add(new AgentPluginEnablementService(editorStorage, createTestProfileService(defaultProfile)));
			agentsStorage.store(AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY, JSON.stringify([['plugin', false]]), StorageScope.PROFILE, StorageTarget.MACHINE);

			const agentsPlugins = store.add(new AgentPluginEnablementService(agentsStorage, createTestProfileService(agentsProfile)));

			assert.deepStrictEqual({
				agentsWindow: agentsPlugins.readEnabled('plugin'),
				editorWindow: editorPlugins.readEnabled('plugin'),
			}, {
				agentsWindow: ContributionEnablementState.DisabledProfile,
				editorWindow: ContributionEnablementState.DisabledProfile,
			});
		});
	});
});
