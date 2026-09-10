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

	test('round-trips summaries without URI revival', () => {
		const { cache } = createCache();
		const summary = { files: 2, insertions: 8, deletions: 3 };
		cache.saveCachedSessions([createSession(summary)]);

		const [loaded] = cache.loadCachedSessions();
		assert.deepStrictEqual(loaded.changes, summary);
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
});
