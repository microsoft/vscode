/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ChatHistoryNavigator, ChatInputHistoryMaxEntries, ChatWidgetHistoryService, IChatWidgetHistoryService } from '../../../common/widget/chatWidgetHistoryService.js';
import { Memento } from '../../../../../common/memento.js';
suite('ChatWidgetHistoryService', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        // Clear memento cache before each test to prevent state leakage
        Memento.clear(-1 /* StorageScope.APPLICATION */);
        Memento.clear(0 /* StorageScope.PROFILE */);
        Memento.clear(1 /* StorageScope.WORKSPACE */);
    });
    function createHistoryService() {
        // Create fresh instances for each test to avoid state leakage
        const instantiationService = testDisposables.add(new TestInstantiationService());
        const storageService = testDisposables.add(new TestStorageService());
        instantiationService.stub(IStorageService, storageService);
        return testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    }
    function createInputState(text, modeKind = ChatModeKind.Ask) {
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
        let firedEntry;
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
        Memento.clear(-1 /* StorageScope.APPLICATION */);
        Memento.clear(0 /* StorageScope.PROFILE */);
        Memento.clear(1 /* StorageScope.WORKSPACE */);
    });
    function createNavigator() {
        // Create fresh instances for each test to avoid state leakage
        const instantiationService = testDisposables.add(new TestInstantiationService());
        const storageService = testDisposables.add(new TestStorageService());
        instantiationService.stub(IStorageService, storageService);
        const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
        instantiationService.stub(IChatWidgetHistoryService, historyService);
        return testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    }
    function createInputState(text) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3dpZGdldC9jaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLGVBQWUsRUFBZ0IsTUFBTSxzREFBc0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUV6RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0UsT0FBTyxFQUFFLG9CQUFvQixFQUFFLDBCQUEwQixFQUFFLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDM0ssT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTNELEtBQUssQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUU7SUFDdEMsTUFBTSxlQUFlLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUVsRSxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsZ0VBQWdFO1FBQ2hFLE9BQU8sQ0FBQyxLQUFLLG1DQUEwQixDQUFDO1FBQ3hDLE9BQU8sQ0FBQyxLQUFLLDhCQUFzQixDQUFDO1FBQ3BDLE9BQU8sQ0FBQyxLQUFLLGdDQUF3QixDQUFDO0lBQ3ZDLENBQUMsQ0FBQyxDQUFDO0lBRUgsU0FBUyxvQkFBb0I7UUFDNUIsOERBQThEO1FBQzlELE1B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