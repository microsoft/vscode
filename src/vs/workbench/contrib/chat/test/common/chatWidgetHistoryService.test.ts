/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IChatModelInputState } from '../../common/chatModel.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { ChatHistoryNavigator, ChatInputHistoryMaxEntries, ChatWidgetHistoryService, IChatWidgetHistoryService } from '../../common/chatWidgetHistoryService.js';
import { Memento } from '../../../../common/memento.js';

suite('ChatWidgetHistoryService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		// Clear memento cache before each test to prevent state leakage
		Memento.clear(StorageScope.APPLICATION);
		Memento.clear(StorageScope.PROFILE);
		Memento.clear(StorageScope.WORKSPACE);
	});

	function createHistoryService(): ChatWidgetHistoryService {
		// Create fresh instances for each test to avoid state leakage
		const instantiationService = testDisposables.add(new TestInstantiationService());
		const storageService = testDisposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);
		return testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
	}

	function createInputState(text: string, modeKind = ChatModeKind.Ask): IChatModelInputState {
		return {
			inputText: text,
			attachments: [],
			mode: { id: modeKind, kind: modeKind },
			selectedModel: undefined,
			selections: [],
			contrib: {}
		};
	}

	test('should start with empty history', () => {
		const historyService = createHistoryService();
		const history = historyService.getHistory(ChatAgentLocation.Chat);
		assert.strictEqual(history.length, 0);
	});

	test('should append and retrieve history entries', () => {
		const historyService = createHistoryService();
		const entry = createInputState('test query');
		historyService.append(ChatAgentLocation.Chat, entry);

		const history = historyService.getHistory(ChatAgentLocation.Chat);
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].inputText, 'test query');
	});

	test('should maintain separate history per location', () => {
		const historyService = createHistoryService();
		historyService.append(ChatAgentLocation.Chat, createInputState('chat query'));
		historyService.append(ChatAgentLocation.Terminal, createInputState('terminal query'));

		const chatHistory = historyService.getHistory(ChatAgentLocation.Chat);
		const terminalHistory = historyService.getHistory(ChatAgentLocation.Terminal);

		assert.strictEqual(chatHistory.length, 1);
		assert.strictEqual(terminalHistory.length, 1);
		assert.strictEqual(chatHistory[0].inputText, 'chat query');
		assert.strictEqual(terminalHistory[0].inputText, 'terminal query');
	});

	test('should limit history to max entries', () => {
		const historyService = createHistoryService();
		for (let i = 0; i < ChatInputHistoryMaxEntries + 10; i++) {
			historyService.append(ChatAgentLocation.Chat, createInputState(`query ${i}`));
		}

		const history = historyService.getHistory(ChatAgentLocation.Chat);
		assert.strictEqual(history.length, ChatInputHistoryMaxEntries);
		assert.strictEqual(history[0].inputText, 'query 10'); // First 10 should be dropped
		assert.strictEqual(history[history.length - 1].inputText, `query ${ChatInputHistoryMaxEntries + 9}`);
	});

	test('should fire append event when history is added', () => {
		const historyService = createHistoryService();
		let eventFired = false;
		let firedEntry: IChatModelInputState | undefined;

		testDisposables.add(historyService.onDidChangeHistory(e => {
			if (e.kind === 'append') {
				eventFired = true;
				firedEntry = e.entry;
			}
		}));

		const entry = createInputState('test');
		historyService.append(ChatAgentLocation.Chat, entry);

		assert.ok(eventFired);
		assert.strictEqual(firedEntry?.inputText, 'test');
	});

	test('should clear all history', () => {
		const historyService = createHistoryService();
		historyService.append(ChatAgentLocation.Chat, createInputState('query 1'));
		historyService.append(ChatAgentLocation.Terminal, createInputState('query 2'));

		historyService.clearHistory();

		assert.strictEqual(historyService.getHistory(ChatAgentLocation.Chat).length, 0);
		assert.strictEqual(historyService.getHistory(ChatAgentLocation.Terminal).length, 0);
	});

	test('should fire clear event when history is cleared', () => {
		const historyService = createHistoryService();
		let clearEventFired = false;

		testDisposables.add(historyService.onDidChangeHistory(e => {
			if (e.kind === 'clear') {
				clearEventFired = true;
			}
		}));

		historyService.clearHistory();
		assert.ok(clearEventFired);
	});
});

suite('ChatHistoryNavigator', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		// Clear memento cache before each test to prevent state leakage
		Memento.clear(StorageScope.APPLICATION);
		Memento.clear(StorageScope.PROFILE);
		Memento.clear(StorageScope.WORKSPACE);
	});

	function createNavigator(): ChatHistoryNavigator {
		// Create fresh instances for each test to avoid state leakage
		const instantiationService = testDisposables.add(new TestInstantiationService());
		const storageService = testDisposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);

		const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
		instantiationService.stub(IChatWidgetHistoryService, historyService);

		return testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
	}

	function createInputState(text: string): IChatModelInputState {
		return {
			inputText: text,
			attachments: [],
			mode: { id: ChatModeKind.Ask, kind: ChatModeKind.Ask },
			selectedModel: undefined,
			selections: [],
			contrib: {}
		};
	}

	test('should start at end of empty history', () => {
		const nav = createNavigator();
		assert.ok(nav.isAtEnd());
		assert.ok(nav.isAtStart());
	});

	test('should navigate backwards through history', () => {
		const nav = createNavigator();
		nav.append(createInputState('first'));
		nav.append(createInputState('second'));
		nav.append(createInputState('third'));

		assert.ok(nav.isAtEnd());

		const prev1 = nav.previous();
		assert.strictEqual(prev1?.inputText, 'third');

		const prev2 = nav.previous();
		assert.strictEqual(prev2?.inputText, 'second');

		const prev3 = nav.previous();
		assert.strictEqual(prev3?.inputText, 'first');
		assert.ok(nav.isAtStart());
	});

	test('should navigate forwards through history', () => {
		const nav = createNavigator();
		nav.append(createInputState('first'));
		nav.append(createInputState('second'));

		nav.previous();
		nav.previous();
		assert.ok(nav.isAtStart());

		const next1 = nav.next();
		assert.strictEqual(next1?.inputText, 'second');

		const next2 = nav.next();
		assert.strictEqual(next2, undefined);
		assert.ok(nav.isAtEnd());
	});

	test('should reset cursor to end', () => {
		const nav = createNavigator();
		nav.append(createInputState('first'));
		nav.append(createInputState('second'));

		nav.previous();
		assert.ok(!nav.isAtEnd());

		nav.resetCursor();
		assert.ok(nav.isAtEnd());
	});

	test('should overlay edited entries', () => {
		const nav = createNavigator();
		nav.append(createInputState('first'));
		nav.append(createInputState('second'));

		nav.previous();
		const edited = createInputState('second edited');
		nav.overlay(edited);

		const current = nav.current();
		assert.strictEqual(current?.inputText, 'second edited');

		// Original history should be unchanged
		assert.strictEqual(nav.values[1].inputText, 'second');
	});

	test('should clear overlay on append', () => {
		const nav = createNavigator();
		nav.append(createInputState('first'));

		nav.previous();
		nav.overlay(createInputState('first edited'));

		const currentBefore = nav.current();
		assert.strictEqual(currentBefore?.inputText, 'first edited');

		nav.append(createInputState('second'));

		// After append, cursor should be at end and overlay cleared
		assert.ok(nav.isAtEnd());
		nav.previous();
		assert.strictEqual(nav.current()?.inputText, 'second');
	});

	test('should stop at start when navigating backwards', () => {
		const nav = createNavigator();
		nav.append(createInputState('only'));

		nav.previous();
		assert.ok(nav.isAtStart());

		const prev = nav.previous();
		assert.strictEqual(prev?.inputText, 'only'); // Should stay at first
		assert.ok(nav.isAtStart());
	});

	test('should stop at end when navigating forwards', () => {
		const nav = createNavigator();
		nav.append(createInputState('only'));

		const next1 = nav.next();
		assert.strictEqual(next1, undefined);
		assert.ok(nav.isAtEnd());

		const next2 = nav.next();
		assert.strictEqual(next2, undefined);
		assert.ok(nav.isAtEnd());
	});

	test('should update when history service appends entries', () => {
		const instantiationService = testDisposables.add(new TestInstantiationService());
		const storageService = testDisposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);

		const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
		instantiationService.stub(IChatWidgetHistoryService, historyService);

		const nav = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));

		historyService.append(ChatAgentLocation.Chat, createInputState('from service'));

		const history = nav.values;
		assert.strictEqual(history.length, 1);
		assert.strictEqual(history[0].inputText, 'from service');
	});

	test('should adjust cursor when history is cleared', () => {
		const instantiationService = testDisposables.add(new TestInstantiationService());
		const storageService = testDisposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);

		const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
		instantiationService.stub(IChatWidgetHistoryService, historyService);

		const nav = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));

		nav.append(createInputState('first'));
		nav.append(createInputState('second'));

		nav.previous();
		assert.ok(!nav.isAtEnd());

		historyService.clearHistory();

		assert.ok(nav.isAtEnd());
		assert.ok(nav.isAtStart());
		assert.strictEqual(nav.values.length, 0);
	});

	test('should handle cursor adjustment when max entries reached', () => {
		const nav = createNavigator();
		// Add entries up to the max
		for (let i = 0; i < ChatInputHistoryMaxEntries; i++) {
			nav.append(createInputState(`entry ${i}`));
		}

		// Navigate to middle of history
		for (let i = 0; i < 20; i++) {
			nav.previous();
		}

		// Add one more entry (should drop oldest)
		nav.append(createInputState('new entry'));

		// Cursor should be at end after append
		assert.ok(nav.isAtEnd());
	});

	test('should support concurrent navigators', () => {
		const instantiationService = testDisposables.add(new TestInstantiationService());
		const storageService = testDisposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);

		const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
		instantiationService.stub(IChatWidgetHistoryService, historyService);

		const nav1 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
		const nav2 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));

		nav1.append(createInputState('query 1'));

		assert.strictEqual(nav1.values.length, 1);
		assert.strictEqual(nav2.values.length, 1);
		assert.strictEqual(nav1.values[0].inputText, 'query 1');
		assert.strictEqual(nav2.values[0].inputText, 'query 1');

		nav1.previous();
		assert.ok(!nav1.isAtEnd());
		assert.ok(nav2.isAtEnd());

		nav2.append(createInputState('query 2'));

		assert.strictEqual(nav1.values.length, 2);
		assert.strictEqual(nav2.values.length, 2);

		// nav1 should stay at same position (pointing to query 1)
		assert.strictEqual(nav1.current()?.inputText, 'query 1');

		// nav2 should be at end
		assert.ok(nav2.isAtEnd());
	});

	test('should support concurrent navigators with mixed positions', () => {
		const instantiationService = testDisposables.add(new TestInstantiationService());
		const storageService = testDisposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);

		const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
		instantiationService.stub(IChatWidgetHistoryService, historyService);

		const nav1 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
		const nav2 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));

		nav1.append(createInputState('query 1'));
		nav1.append(createInputState('query 2'));
		nav1.append(createInputState('query 3'));

		// Both at end
		assert.ok(nav1.isAtEnd());
		assert.ok(nav2.isAtEnd());

		// Move nav1 back to 'query 2'
		nav1.previous();
		assert.strictEqual(nav1.current()?.inputText, 'query 3');
		nav1.previous();
		assert.strictEqual(nav1.current()?.inputText, 'query 2');

		// Move nav2 back to 'query 1'
		nav2.previous();
		nav2.previous();
		nav2.previous();
		assert.strictEqual(nav2.current()?.inputText, 'query 1');

		// Append new query
		nav1.append(createInputState('query 4'));

		// nav1 should be at end (because it appended)
		assert.ok(nav1.isAtEnd());
		assert.strictEqual(nav1.values.length, 4);

		// nav2 should stay at 'query 1'
		assert.strictEqual(nav2.current()?.inputText, 'query 1');
		assert.strictEqual(nav2.values.length, 4);
	});
});
