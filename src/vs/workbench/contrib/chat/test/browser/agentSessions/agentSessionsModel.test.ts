/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { AgentSessionStatus, AgentSessionsCache, createAgentSessionChangesEditorInput } from '../../../browser/agentSessions/agentSessionsModel.js';

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

suite('Agent session changes editor input', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('includes changes with both diff sides', () => {
		const sessionResource = URI.parse('test-session://provider/1');
		const original = URI.file('/workspace/original.ts');
		const modified = URI.file('/workspace/modified.ts');

		const input = createAgentSessionChangesEditorInput({
			providerType: 'test-session',
			resource: sessionResource,
			label: 'Fix issue',
			changes: [
				{ modifiedUri: modified, originalUri: original, insertions: 4, deletions: 2 },
				{ modifiedUri: URI.file('/workspace/skipped.ts'), insertions: 1, deletions: 0 },
			],
		});

		assert.deepStrictEqual(input, {
			multiDiffSource: URI.from({
				scheme: 'agent-session-changes',
				path: '/',
				query: encodeURIComponent(sessionResource.toString()),
			}),
			label: 'Fix issue - All Changes',
		});
	});

	test('opens aggregate-only agent host changes through the shared source resolver', () => {
		const resource = URI.parse('agent-host-copilotcli:/1');
		assert.deepStrictEqual(createAgentSessionChangesEditorInput({
			providerType: 'agent-host-copilotcli',
			resource,
			label: 'Fix issue',
			changes: { files: 2, insertions: 4, deletions: 2 },
		}), {
			multiDiffSource: URI.from({
				scheme: 'agent-session-changes',
				path: '/',
				query: encodeURIComponent(resource.toString()),
			}),
			label: 'Fix issue - All Changes',
		});
	});

	test('returns undefined for aggregate-only non-agent-host changes', () => {
		assert.strictEqual(createAgentSessionChangesEditorInput({
			providerType: 'test-session',
			resource: URI.parse('test-session:/1'),
			label: 'Fix issue',
			changes: { files: 2, insertions: 4, deletions: 2 },
		}), undefined);
	});
});
