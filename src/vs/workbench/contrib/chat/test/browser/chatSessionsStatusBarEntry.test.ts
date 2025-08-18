/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatSessionsStatusBarEntry } from '../../browser/chatSessionsStatusBarEntry.js';
import { IChatSessionsService, ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider } from '../../common/chatSessionsService.js';
import { IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { timeout } from '../../../../../base/common/async.js';

class MockChatSessionsService implements IChatSessionsService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeItemsProviders = new Emitter<IChatSessionItemProvider>();
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider> = this._onDidChangeItemsProviders.event;

	private readonly _onDidChangeSessionItems = new Emitter<string>();
	readonly onDidChangeSessionItems: Event<string> = this._onDidChangeSessionItems.event;

	private readonly _onDidChangeAvailability = new Emitter<void>();
	readonly onDidChangeAvailability: Event<void> = this._onDidChangeAvailability.event;

	private mockProviders: IChatSessionItemProvider[] = [];
	private mockSessions: { [providerType: string]: IChatSessionItem[] } = {};

	// Test helper methods
	addMockProvider(provider: IChatSessionItemProvider): void {
		this.mockProviders.push(provider);
		this._onDidChangeItemsProviders.fire(provider);
	}

	setMockSessions(providerType: string, sessions: IChatSessionItem[]): void {
		this.mockSessions[providerType] = sessions;
		this._onDidChangeSessionItems.fire(providerType);
	}

	// IChatSessionsService implementation
	registerChatSessionItemProvider(provider: IChatSessionItemProvider) {
		return { dispose: () => { } };
	}

	getAllChatSessionContributions() {
		return [];
	}

	canResolveItemProvider(chatSessionType: string) {
		return Promise.resolve(true);
	}

	getAllChatSessionItemProviders() {
		return this.mockProviders;
	}

	async provideChatSessionItems(chatSessionType: string, token: CancellationToken) {
		return this.mockSessions[chatSessionType] || [];
	}

	registerChatSessionContentProvider(chatSessionType: string, provider: any) {
		return { dispose: () => { } };
	}

	canResolveContentProvider(chatSessionType: string) {
		return Promise.resolve(false);
	}

	provideChatSessionContent(chatSessionType: string, id: string, token: CancellationToken) {
		throw new Error('Not implemented for tests');
	}

	setEditableSession(sessionId: string, data: any) {
		return Promise.resolve();
	}

	getEditableData(sessionId: string) {
		return undefined;
	}

	isEditable(sessionId: string) {
		return false;
	}
}

class MockStatusbarService implements Partial<IStatusbarService> {
	private entries: { id: string; entry: any }[] = [];

	addEntry(entry: any, id: string, alignment: any, options?: any) {
		this.entries.push({ id, entry });
		return {
			update: (newEntry: any) => {
				const existing = this.entries.find(e => e.id === id);
				if (existing) {
					existing.entry = newEntry;
				}
			},
			dispose: () => {
				const index = this.entries.findIndex(e => e.id === id);
				if (index !== -1) {
					this.entries.splice(index, 1);
				}
			}
		};
	}

	// Test helper
	getEntries() {
		return this.entries;
	}
}

suite('ChatSessionsStatusBarEntry', () => {

	let store: DisposableStore;
	let mockChatSessionsService: MockChatSessionsService;
	let mockStatusbarService: MockStatusbarService;
	let statusBarEntry: ChatSessionsStatusBarEntry;

	setup(() => {
		store = new DisposableStore();

		mockChatSessionsService = new MockChatSessionsService();
		mockStatusbarService = new MockStatusbarService();

		const instaService = workbenchInstantiationService({
			configurationService: () => store.add(new TestConfigurationService()),
		}, store);

		instaService.stub(IChatSessionsService, mockChatSessionsService);
		instaService.stub(IStatusbarService, mockStatusbarService as any);
		instaService.stub(ICommandService, {
			executeCommand: () => Promise.resolve()
		});

		store.add(instaService);
		statusBarEntry = store.add(instaService.createInstance(ChatSessionsStatusBarEntry));
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should not show status bar entry when no sessions are in progress', async () => {
		// Initially no providers or sessions
		await timeout(10); // Let async operations complete

		assert.strictEqual(mockStatusbarService.getEntries().length, 0, 'Should not show status bar entry when no sessions');
	});

	test('should show status bar entry when sessions are in progress', async () => {
		// Add a mock provider
		const mockProvider: IChatSessionItemProvider = {
			chatSessionType: 'test',
			onDidChangeChatSessionItems: Event.None,
			provideChatSessionItems: (token: CancellationToken) => Promise.resolve([
				{
					id: 'session1',
					label: 'Test Session 1',
					status: ChatSessionStatus.InProgress
				}
			])
		};

		mockChatSessionsService.addMockProvider(mockProvider);
		mockChatSessionsService.setMockSessions('test', [
			{
				id: 'session1',
				label: 'Test Session 1',
				status: ChatSessionStatus.InProgress
			}
		]);

		await timeout(10); // Let async operations complete

		assert.strictEqual(mockStatusbarService.getEntries().length, 1, 'Should show status bar entry for in-progress sessions');
		
		const entry = mockStatusbarService.getEntries()[0];
		assert.ok(entry.entry.text.includes('1'), 'Should show count of 1 in-progress session');
		assert.ok(entry.entry.text.includes('$(loading~spin)'), 'Should show loading spinner icon');
	});

	test('should hide status bar entry when sessions complete', async () => {
		// First add an in-progress session
		const mockProvider: IChatSessionItemProvider = {
			chatSessionType: 'test',
			onDidChangeChatSessionItems: Event.None,
			provideChatSessionItems: (token: CancellationToken) => Promise.resolve([])
		};

		mockChatSessionsService.addMockProvider(mockProvider);
		mockChatSessionsService.setMockSessions('test', [
			{
				id: 'session1',
				label: 'Test Session 1',
				status: ChatSessionStatus.InProgress
			}
		]);

		await timeout(10);
		assert.strictEqual(mockStatusbarService.getEntries().length, 1, 'Should show entry for in-progress session');

		// Now complete the session
		mockChatSessionsService.setMockSessions('test', [
			{
				id: 'session1',
				label: 'Test Session 1',
				status: ChatSessionStatus.Completed
			}
		]);

		await timeout(10);
		assert.strictEqual(mockStatusbarService.getEntries().length, 0, 'Should hide entry when no sessions are in progress');
	});

	test('should update count when multiple sessions are in progress', async () => {
		const mockProvider: IChatSessionItemProvider = {
			chatSessionType: 'test',
			onDidChangeChatSessionItems: Event.None,
			provideChatSessionItems: (token: CancellationToken) => Promise.resolve([])
		};

		mockChatSessionsService.addMockProvider(mockProvider);
		mockChatSessionsService.setMockSessions('test', [
			{
				id: 'session1',
				label: 'Test Session 1',
				status: ChatSessionStatus.InProgress
			},
			{
				id: 'session2',
				label: 'Test Session 2',
				status: ChatSessionStatus.InProgress
			},
			{
				id: 'session3',
				label: 'Test Session 3',
				status: ChatSessionStatus.Completed
			}
		]);

		await timeout(10);

		assert.strictEqual(mockStatusbarService.getEntries().length, 1, 'Should show status bar entry');
		
		const entry = mockStatusbarService.getEntries()[0];
		assert.ok(entry.entry.text.includes('2'), 'Should show count of 2 in-progress sessions');
	});
});