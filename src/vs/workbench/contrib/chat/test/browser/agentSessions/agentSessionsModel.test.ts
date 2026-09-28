/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { AgentSessionStatus, AgentSessionsCache } from '../../../browser/agentSessions/agentSessionsModel.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';

suite('AgentSessionsCache', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const storageKey = 'agentSessions.model.cache';

	function createCache(): { cache: AgentSessionsCache; storageService: InMemoryStorageService } {
		const storageService = store.add(new InMemoryStorageService());
		return { cache: new AgentSessionsCache(storageService), storageService };
	}

	function createSession(changes: Parameters<AgentSessionsCache['saveCachedSessions']>[0][number]['changes']): Parameters<AgentSessionsCache['saveCachedSessions']>[0][number] {
		return {
			providerType: 'test',
			providerLabel: 'Test',
			resource: URI.parse('test:/session'),
			status: AgentSessionStatus.Completed,
			label: 'Session',
			icon: Codicon.chatSparkle,
			timing: { created: 1, lastRequestStarted: undefined, lastRequestEnded: undefined },
			changes,
			archived: false,
			providerIsRead: true,
		};
	}

	test('persists file change arrays as summaries', () => {
		const { cache, storageService } = createCache();
		cache.saveCachedSessions([createSession([
			{ modifiedUri: URI.file('/first'), insertions: 3, deletions: 1 },
			{ modifiedUri: URI.file('/second'), originalUri: URI.file('/old-second'), insertions: 5, deletions: 2 },
		])]);

		const serialized = JSON.parse(storageService.get(storageKey, StorageScope.WORKSPACE) ?? '[]');
		assert.deepStrictEqual(serialized[0].changes, { files: 2, insertions: 8, deletions: 3 });
	});

	test('does not persist profile-owned local rows in the workspace cache', () => {
		const { cache } = createCache();
		const externalSession = createSession(undefined);
		cache.saveCachedSessions([
			{ ...externalSession, providerType: AgentSessionProviders.Local, resource: LocalChatSessionUri.forSession('local-session') },
			externalSession,
		]);

		assert.deepStrictEqual(cache.loadCachedSessions().map(session => session.resource.toString()), [externalSession.resource.toString()]);
	});

	test('ignores local rows in an older workspace cache', () => {
		const { cache, storageService } = createCache();
		const externalSession = createSession(undefined);
		cache.saveCachedSessions([externalSession]);
		const [serializedExternal] = JSON.parse(storageService.get(storageKey, StorageScope.WORKSPACE)!);
		storageService.store(storageKey, JSON.stringify([
			{ ...serializedExternal, providerType: AgentSessionProviders.Local, resource: LocalChatSessionUri.forSession('previous-profile-session').toString() },
			serializedExternal,
		]), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		assert.deepStrictEqual(cache.loadCachedSessions().map(session => session.resource.toString()), [externalSession.resource.toString()]);
	});

	test('round-trips summaries without URI revival', () => {
		const { cache } = createCache();
		const summary = { files: 2, insertions: 8, deletions: 3 };
		cache.saveCachedSessions([createSession(summary)]);

		const [loaded] = cache.loadCachedSessions();
		assert.deepStrictEqual(loaded.changes, summary);
	});

	test('round-trips session chat children', () => {
		const { cache } = createCache();
		const session = createSession(undefined);
		const child = {
			...createSession(undefined),
			resource: URI.parse('test:/session#peer'),
			label: 'Peer chat',
			statusKnown: false,
			parentSession: { resource: session.resource, label: session.label },
		};
		cache.saveCachedSessions([{ ...session, children: [child] }]);

		const [loaded] = cache.loadCachedSessions();
		assert.deepStrictEqual({
			children: loaded.children?.map(item => ({
				resource: item.resource.toString(),
				label: item.label,
				parentResource: item.parentSession?.resource.toString(),
				parentLabel: item.parentSession?.label,
				statusKnown: item.statusKnown,
			})),
		}, {
			children: [{
				resource: 'test:/session#peer',
				label: 'Peer chat',
				parentResource: 'test:/session',
				parentLabel: 'Session',
				statusKnown: false,
			}],
		});
	});

	test('loads legacy arrays as summaries and revives session resources', () => {
		const { cache, storageService } = createCache();
		storageService.store(storageKey, JSON.stringify([{
			providerType: 'test',
			providerLabel: 'Test',
			resource: { scheme: 'test', path: '/session' },
			legacyResource: 'test:/legacy',
			status: AgentSessionStatus.Completed,
			label: 'Session',
			icon: Codicon.chatSparkle.id,
			timing: { created: 1 },
			changes: [{
				modifiedUri: { scheme: 'file', path: '/first' },
				originalUri: { scheme: 'file', path: '/old-first' },
				insertions: 3,
				deletions: 1,
			}],
			archived: false,
			isRead: true,
		}]), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const [loaded] = cache.loadCachedSessions();
		assert.deepStrictEqual({
			resource: loaded.resource,
			legacyResource: loaded.legacyResource,
			changes: loaded.changes,
		}, {
			resource: URI.parse('test:/session'),
			legacyResource: URI.parse('test:/legacy'),
			changes: { files: 1, insertions: 3, deletions: 1 },
		});

		cache.saveCachedSessions([loaded]);
		const serialized = JSON.parse(storageService.get(storageKey, StorageScope.WORKSPACE) ?? '[]');
		assert.deepStrictEqual(serialized[0].changes, { files: 1, insertions: 3, deletions: 1 });
	});

	test('merges state updates from different windows', () => {
		const storageService = store.add(new InMemoryStorageService());
		const firstCache = new AgentSessionsCache(storageService);
		const secondCache = new AgentSessionsCache(storageService);
		const firstStates = firstCache.loadSessionStates();
		const secondStates = secondCache.loadSessionStates();
		const firstResource = URI.parse('test:/first');
		const secondResource = URI.parse('test:/second');

		firstStates.set(firstResource, { pinned: true });
		firstCache.saveSessionStates(firstStates);
		secondStates.set(secondResource, { archived: true });
		secondCache.saveSessionStates(secondStates);

		const mergedStates = new AgentSessionsCache(storageService).loadSessionStates();
		assert.deepStrictEqual({
			first: mergedStates.get(firstResource),
			second: mergedStates.get(secondResource),
			aggregate: storageService.get('agentSessions.state.cache', StorageScope.PROFILE),
		}, {
			first: { pinned: true },
			second: { archived: true },
			aggregate: undefined,
		});
	});

	test('merges different field updates to the same session from different windows', () => {
		const storageService = store.add(new InMemoryStorageService());
		const firstCache = new AgentSessionsCache(storageService);
		const secondCache = new AgentSessionsCache(storageService);
		const firstStates = firstCache.loadSessionStates();
		const secondStates = secondCache.loadSessionStates();
		const resource = URI.parse('test:/session');

		firstStates.set(resource, { pinned: true });
		firstCache.saveSessionStates(firstStates);
		secondStates.set(resource, { archived: true });
		secondCache.saveSessionStates(secondStates);

		assert.deepStrictEqual(new AgentSessionsCache(storageService).loadSessionStates().get(resource), {
			archived: true,
			pinned: true,
		});
	});

	test('merges external updates without discarding unsaved local fields', () => {
		const storageService = store.add(new InMemoryStorageService());
		const resource = URI.parse('test:/session');
		const initialCache = new AgentSessionsCache(storageService);
		const initialStates = initialCache.loadSessionStates();
		initialStates.set(resource, { pinned: false, archived: false });
		initialCache.saveSessionStates(initialStates);

		const localCache = new AgentSessionsCache(storageService);
		const externalCache = new AgentSessionsCache(storageService);
		const localStates = localCache.loadSessionStates();
		const externalStates = externalCache.loadSessionStates();
		localStates.set(resource, { ...localStates.get(resource), pinned: true });
		externalStates.set(resource, { ...externalStates.get(resource), archived: true });
		externalCache.saveSessionStates(externalStates);

		localCache.mergeSessionStates(localStates);
		assert.deepStrictEqual(localStates.get(resource), { archived: true, pinned: true });
		localCache.saveSessionStates(localStates);
		assert.deepStrictEqual(new AgentSessionsCache(storageService).loadSessionStates().get(resource), { archived: true, pinned: true });
	});

	test('does not restore state deleted by another window', () => {
		const storageService = store.add(new InMemoryStorageService());
		const firstResource = URI.parse('test:/first');
		const secondResource = URI.parse('test:/second');
		const initialCache = new AgentSessionsCache(storageService);
		const initialStates = initialCache.loadSessionStates();
		initialStates.set(firstResource, { pinned: true });
		initialStates.set(secondResource, { archived: true });
		initialCache.saveSessionStates(initialStates);

		const deletingCache = new AgentSessionsCache(storageService);
		const staleCache = new AgentSessionsCache(storageService);
		const deletingStates = deletingCache.loadSessionStates();
		const staleStates = staleCache.loadSessionStates();
		deletingStates.delete(firstResource);
		deletingCache.saveSessionStates(deletingStates);
		staleStates.set(secondResource, { archived: false });
		staleCache.saveSessionStates(staleStates);

		const reloaded = new AgentSessionsCache(storageService).loadSessionStates();
		assert.strictEqual(reloaded.has(firstResource), false);
		assert.deepStrictEqual(reloaded.get(secondResource), { archived: false });
	});

	test('migrates workspace state even when profile state already exists', () => {
		const storageService = store.add(new InMemoryStorageService());
		const workspaceResource = URI.parse('test:/workspace');
		const profileResource = URI.parse('test:/profile');
		storageService.store('agentSessions.state.cache', JSON.stringify([
			{ resource: workspaceResource.toString(), pinned: true },
		]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storageService.store('agentSessions.state.cache', JSON.stringify([
			{ resource: profileResource.toString(), archived: true },
		]), StorageScope.PROFILE, StorageTarget.MACHINE);

		const cache = new AgentSessionsCache(storageService);
		const states = cache.loadSessionStates();
		cache.saveSessionStates(states);

		const reloaded = new AgentSessionsCache(storageService).loadSessionStates();
		assert.deepStrictEqual({
			workspace: reloaded.get(workspaceResource),
			profile: reloaded.get(profileResource),
			workspaceLegacy: storageService.get('agentSessions.state.cache', StorageScope.WORKSPACE),
			profileLegacy: storageService.get('agentSessions.state.cache', StorageScope.PROFILE),
		}, {
			workspace: { pinned: true },
			profile: { archived: true },
			workspaceLegacy: undefined,
			profileLegacy: undefined,
		});
	});

	test('merges fields from legacy sources for the same session', () => {
		const storageService = store.add(new InMemoryStorageService());
		const resource = URI.parse('test:/shared');
		storageService.store('agentSessions.state.cache', JSON.stringify([
			{ resource: resource.toString(), pinned: true },
		]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storageService.store('agentSessions.state.cache', JSON.stringify([
			{ resource: resource.toString(), archived: true },
		]), StorageScope.PROFILE, StorageTarget.MACHINE);

		assert.deepStrictEqual(new AgentSessionsCache(storageService).loadSessionStates().get(resource), {
			archived: true,
			pinned: true,
		});
	});

	test('does not overwrite a newer field while migrating legacy state', () => {
		const storageService = store.add(new InMemoryStorageService());
		const resource = URI.parse('test:/session');
		storageService.store('agentSessions.state.cache', JSON.stringify([
			{ resource: resource.toString(), pinned: false },
		]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storageService.store(
			`agentSessions.state.cache.field.pinned.${encodeURIComponent(resource.toString())}`,
			JSON.stringify(true),
			StorageScope.PROFILE,
			StorageTarget.MACHINE,
		);

		const cache = new AgentSessionsCache(storageService);
		const states = cache.loadSessionStates();
		cache.saveSessionStates(states);

		assert.deepStrictEqual(new AgentSessionsCache(storageService).loadSessionStates().get(resource), { pinned: true });
	});
});
