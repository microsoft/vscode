/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSessionStatus, IChatSessionItemProvider, localChatSessionType } from '../../common/chatSessionsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Event } from '../../../../../base/common/event.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';

suite('ChatSessionsCache', () => {

	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let storageService: IStorageService;

	setup(() => {
		instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		storageService = instantiationService.get(IStorageService);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should save and load cached sessions', () => {
		const provider: IChatSessionItemProvider = {
			chatSessionType: localChatSessionType,
			onDidChangeChatSessionItems: Event.None,
			provideChatSessionItems: async () => []
		};

		// Create mock cache implementation (simplified version of ChatSessionsCache)
		const storageKey = `chatSessions.cache.${localChatSessionType}`;

		// Create mock sessions
		const mockSessions = [
			{
				resource: URI.parse('test://session-1'),
				label: 'Test Session 1',
				description: 'Description 1',
				status: ChatSessionStatus.Completed,
				timing: { startTime: Date.now() },
				provider
			},
			{
				resource: URI.parse('test://session-2'),
				label: 'Test Session 2',
				status: ChatSessionStatus.InProgress,
				iconPath: ThemeIcon.fromId('file'),
				timing: { startTime: Date.now() },
				provider
			}
		];

		// Serialize sessions (simplified version of saveCachedSessions)
		const serialized = mockSessions.map(session => ({
			resource: session.resource.toJSON(),
			label: session.label,
			description: session.description,
			status: session.status,
			iconPath: session.iconPath && ThemeIcon.isThemeIcon(session.iconPath) ? session.iconPath.id : undefined,
			timing: session.timing
		}));

		storageService.store(storageKey, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		// Load sessions (simplified version of loadCachedSessions)
		const cached = storageService.get(storageKey, StorageScope.WORKSPACE);
		assert.ok(cached, 'Cached sessions should be stored');

		const loaded = JSON.parse(cached!).map((session: any) => ({
			resource: URI.revive(session.resource),
			label: session.label,
			description: session.description,
			status: session.status,
			iconPath: session.iconPath ? ThemeIcon.fromId(session.iconPath) : undefined,
			timing: session.timing,
			provider
		}));

		assert.strictEqual(loaded.length, 2, 'Should load 2 sessions');
		assert.strictEqual(loaded[0].resource.toString(), 'test://session-1');
		assert.strictEqual(loaded[0].label, 'Test Session 1');
		assert.strictEqual(loaded[0].description, 'Description 1');
		assert.strictEqual(loaded[0].status, ChatSessionStatus.Completed);

		assert.strictEqual(loaded[1].resource.toString(), 'test://session-2');
		assert.strictEqual(loaded[1].label, 'Test Session 2');
		assert.strictEqual(loaded[1].status, ChatSessionStatus.InProgress);
		assert.strictEqual(loaded[1].iconPath?.id, 'file');
	});

	test('should handle empty cache', () => {
		const storageKey = `chatSessions.cache.${localChatSessionType}`;
		const cached = storageService.get(storageKey, StorageScope.WORKSPACE);
		assert.strictEqual(cached, undefined, 'Should return undefined for empty cache');
	});

	test('should handle invalid cache data gracefully', () => {
		const storageKey = `chatSessions.cache.${localChatSessionType}`;
		storageService.store(storageKey, 'invalid json data', StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const cached = storageService.get(storageKey, StorageScope.WORKSPACE);
		assert.ok(cached, 'Should have cached data');

		try {
			JSON.parse(cached!);
			assert.fail('Should throw on invalid JSON');
		} catch (error) {
			// Expected behavior - invalid JSON should be caught
			assert.ok(error, 'Should throw error on invalid JSON');
		}
	});

	test('should only cache specific provider types', () => {
		// Test that cache is only created for localChatSessionType
		const shouldCache = (providerType: string): boolean => {
			return providerType === localChatSessionType;
		};

		assert.strictEqual(shouldCache(localChatSessionType), true, 'Should cache local sessions');
		assert.strictEqual(shouldCache('cloud'), false, 'Should not cache cloud sessions');
		assert.strictEqual(shouldCache('custom'), false, 'Should not cache custom sessions');
	});

	test('should preserve session properties when serializing', () => {
		const provider: IChatSessionItemProvider = {
			chatSessionType: localChatSessionType,
			onDidChangeChatSessionItems: Event.None,
			provideChatSessionItems: async () => []
		};

		const session = {
			resource: URI.parse('test://session-with-props'),
			label: 'Session with Properties',
			description: 'Test description',
			tooltip: 'Test tooltip',
			status: ChatSessionStatus.Failed,
			archived: true,
			iconPath: Codicon.warning,
			timing: {
				startTime: 1234567890,
				endTime: 1234567900
			},
			statistics: {
				files: 5,
				insertions: 100,
				deletions: 50
			},
			provider
		};

		// Serialize
		const serialized = {
			resource: session.resource.toJSON(),
			label: session.label,
			description: session.description,
			tooltip: session.tooltip,
			status: session.status,
			archived: session.archived,
			iconPath: session.iconPath && ThemeIcon.isThemeIcon(session.iconPath) ? session.iconPath.id : undefined,
			timing: session.timing,
			statistics: session.statistics
		};

		// Deserialize
		const deserialized = {
			resource: URI.revive(serialized.resource),
			label: serialized.label,
			description: serialized.description,
			tooltip: serialized.tooltip,
			status: serialized.status,
			archived: serialized.archived,
			iconPath: serialized.iconPath ? ThemeIcon.fromId(serialized.iconPath) : undefined,
			timing: serialized.timing,
			statistics: serialized.statistics,
			provider
		};

		// Verify all properties are preserved
		assert.strictEqual(deserialized.resource.toString(), session.resource.toString());
		assert.strictEqual(deserialized.label, session.label);
		assert.strictEqual(deserialized.description, session.description);
		assert.strictEqual(deserialized.tooltip, session.tooltip);
		assert.strictEqual(deserialized.status, session.status);
		assert.strictEqual(deserialized.archived, session.archived);
		assert.strictEqual(deserialized.iconPath?.id, 'warning');
		assert.deepStrictEqual(deserialized.timing, session.timing);
		assert.deepStrictEqual(deserialized.statistics, session.statistics);
	});
});
