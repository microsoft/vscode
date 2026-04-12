/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { GetHandoffsActionId, ExecuteHandoffActionId, registerChatExecuteActions } from '../../../browser/actions/chatExecuteActions.js';
import { IChatModeService } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';
import { MockChatModeService } from '../../common/mockChatModeService.js';
// CommandsRegistry types all handlers as returning void, but our commands
// return real values. This helper performs the double cast safely.
function runCommand(handler, ...args) {
    return handler(...args);
}
async function runCommandAsync(handler, ...args) {
    return await handler(...args);
}
function createMockMode(overrides) {
    return {
        name: constObservable(overrides.id),
        label: constObservable(overrides.id),
        icon: constObservable(undefined),
        description: constObservable(undefined),
        isBuiltin: overrides.isBuiltin ?? false,
        target: constObservable(Target.Undefined),
        ...overrides,
    };
}
// Register once at module level so disposables are created before suite tracking begins
registerChatExecuteActions();
suite('GetHandoffsAction', () => {
    const store = new DisposableStore();
    let instantiationService;
    setup(() => {
        instantiationService = store.add(new TestInstantiationService());
    });
    teardown(() => {
        store.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should return all modes when no sourceCustomAgent is specified', () => {
        const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
        const planMode = createMockMode({
            id: 'plan',
            kind: ChatModeKind.Agent,
            handOffs: observableValue('handOffs', [
                { agent: 'implement', label: 'Start', prompt: 'go' },
            ]),
        });
        instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));
        const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
        assert.ok(handler);
        const result = runCommand(handler, instantiationService);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].name, 'ask');
        assert.strictEqual(result[0].handoffs.length, 0);
        assert.strictEqual(result[1].name, 'plan');
        assert.strictEqual(result[1].handoffs.length, 1);
    });
    test('should filter by sourceCustomAgent (case-insensitive)', () => {
        const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
        const planMode = createMockMode({
            id: 'plan',
            kind: ChatModeKind.Agent,
            handOffs: observableValue('handOffs', [
                { agent: 'implement', label: 'Start', prompt: 'go' },
            ]),
        });
        instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));
        const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
        assert.ok(handler);
        const result = runCommand(handler, instantiationService, { sourceCustomAgent: 'Plan' });
        assert.deepStrictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'plan');
        assert.strictEqual(result[0].handoffs.length, 1);
    });
    test('should return empty array for non-matching sourceCustomAgent', () => {
        const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
        instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [] }));
        const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
        assert.ok(handler);
        const result = runCommand(handler, instantiationService, { sourceCustomAgent: 'nonexistent' });
        assert.deepStrictEqual(result, []);
    });
});
suite('ExecuteHandoffAction', () => {
    const store = new DisposableStore();
    let instantiationService;
    setup(() => {
        instantiationService = store.add(new TestInstantiationService());
    });
    teardown(() => {
        store.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    const testHandoffs = [
        { agent: 'implement', label: 'Start Implementation', prompt: 'Implement the plan', send: true },
        { agent: 'agent', label: 'Open in Editor', prompt: 'Open it' },
    ];
    const planMode = createMockMode({
        id: 'plan',
        kind: ChatModeKind.Agent,
        handOffs: observableValue('handOffs', testHandoffs),
    });
    function createMockWidget(currentMode) {
        const executeHandoffCalls = [];
        const widget = {
            input: {
                currentModeObs: constObservable(currentMode),
            },
            executeHandoff: async (handoff) => {
                executeHandoffCalls.push(handoff);
            },
        };
        return { widget, executeHandoffCalls };
    }
    test('should return error when neither id nor label is provided', async () => {
        const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
        assert.ok(handler);
        const result = await runCommandAsync(handler, instantiationService, {});
        assert.deepStrictEqual(result, { success: false, error: 'Either id or label is required' });
    });
    test('should return error when no widget is found', async () => {
        instantiationService.set(IChatWidgetService, new MockChatWidgetService());
        instantiationService.set(IChatModeService, new MockChatModeService());
        const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
        assert.ok(handler);
        const result = await runCommandAsync(handler, instantiationService, { id: 'implement:start-implementation' });
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('No chat widget found'));
    });
    test('should fall back to lastFocusedWidget when sessionResource is omitted', async () => {
        const { widget, executeHandoffCalls } = createMockWidget(planMode);
        const mockWidgetService = new class extends MockChatWidgetService {
            constructor() {
                super(...arguments);
                this.lastFocusedWidget = widget;
            }
        };
        instantiationService.set(IChatWidgetService, mockWidgetService);
        instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [], custom: [planMode] }));
        const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
        assert.ok(handler);
        const result = await runCommandAsync(handler, instantiationService, { id: 'implement:start-implementation' });
        assert.deepStrictEqual(result, { success: true, targetMode: 'implement' });
        assert.strictEqual(executeHandoffCalls.length, 1);
        assert.strictEqual(executeHandoffCalls[0].label, 'Start Implementation');
    });
    test('should resolve widget by sessionResource', async () => {
        const { widget, executeHandoffCalls } = createMockWidget(planMode);
        const sessionUri = URI.parse('test://session/1');
        const mockWidgetService = new class extends MockChatWidgetService {
            getWidgetBySessionResource(resource) {
                return resource.toString() === sessionUri.toString() ? widget : undefined;
            }
        };
        instantiationService.set(IChatWidgetService, mockWidgetService);
        instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [], custom: [planMode] }));
        const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
        assert.ok(handler);
        const result = await runCommandAsync(handler, instantiationService, {
            id: 'implement:start-implementation',
            sessionResource: sessionUri.toString(),
        });
        assert.deepStrictEqual(result, { success: true, targetMode: 'implement' });
        assert.strictEqual(executeHandoffCalls.length, 1);
    });
    test('should match by id (primary)', async () => {
        const { widget, executeHandoffCalls } = createMockWidget(planMode);
        const mockWidgetService = new class extends MockChatWidgetService {
            constructor() {
                super(...arguments);
                this.lastFocusedWidget = widget;
            }
        };
        instantiationService.set(IChatWidgetService, mockWidgetService);
        instantiationService.set(IChatModeService, new MockChatModeService());
        const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
        assert.ok(handler);
        const result = await runCommandAsync(handler, instantiationService, { id: 'agent:open-in-editor' });
        assert.deepStrictEqual(result, { success: true, targetMode: 'agent' });
        assert.strictEqual(executeHandoffCalls[0].label, 'Open in Editor');
    });
    test('should fall back to label match when id is not provided', async () => {
        const { widget, executeHandoffCalls } = createMockWidget(planMode);
        const mockWidgetService = new class extends MockChatWidgetService {
            constructor() {
                super(...arguments);
                this.lastFocusedWidget = widget;
            }
        };
        instantiationService.set(IChatWidgetService, mockWidgetService);
        instantiationService.set(IChatModeService, new MockChatModeService());
        const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
        assert.ok(handler);
        const result = await runCommandAsync(handler, instantiationService, { label: 'start implementation' });
        assert.deepStrictEqual(result, { success: true, targetMode: 'implement' });
        assert.strictEqual(executeHandoffCalls[0].prompt, 'Implement the plan');
    });
    test('should return error for non-matching identifier', async () => {
        const { widget } = createMockWidget(planMode);
        const mockWidgetService = new class extends MockChatWidgetService {
            constructor() {
                super(...arguments);
                this.lastFocusedWidget = widget;
            }
        };
        instantiationService.set(IChatWidgetService, mockWidgetService);
        instantiationService.set(IChatModeService, new MockChatModeService());
        const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
        assert.ok(handler);
        const result = await runCommandAsync(handler, instantiationService, { id: 'nonexistent:thing' });
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('nonexistent:thing'));
    });
    test('should resolve sourceCustomAgent to look up handoffs from a different mode', async () => {
        const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
        const { widget, executeHandoffCalls } = createMockWidget(askMode); // widget is in "ask" mode (no handoffs)
        const mockWidgetService = new class extends MockChatWidgetService {
            constructor() {
                super(...arguments);
                this.lastFocusedWidget = widget;
            }
        };
        // The plan mode has handoffs; sourceCustomAgent overrides the widget's current mode
        instantiationService.set(IChatWidgetService, mockWidgetService);
        instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));
        const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
        assert.ok(handler);
        const result = await runCommandAsync(handler, instantiationService, {
            id: 'implement:start-implementation',
            sourceCustomAgent: 'plan',
        });
        assert.deepStrictEqual(result, { success: true, targetMode: 'implement' });
        assert.strictEqual(executeHandoffCalls.length, 1);
    });
    test('should return error when source mode has no handoffs', async () => {
        const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
        const { widget } = createMockWidget(askMode);
        const mockWidgetService = new class extends MockChatWidgetService {
            constructor() {
                super(...arguments);
                this.lastFocusedWidget = widget;
            }
        };
        instantiationService.set(IChatWidgetService, mockWidgetService);
        instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [] }));
        const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
        assert.ok(handler);
        const result = await runCommandAsync(handler, instantiationService, { id: 'implement:start-implementation' });
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('No handoffs available'));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEV4ZWN1dGVBY3Rpb25zLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9hY3Rpb25zL2NoYXRFeGVjdXRlQWN0aW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDN0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMvRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDMUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDM0UsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHNCQUFzQixFQUFFLDBCQUEwQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekksT0FBTyxFQUFhLGdCQUFnQixFQUFvQixNQUFNLDhCQUE4QixDQUFDO0FBQzdGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDckUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDcEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFRMUUsMEVBQTBFO0FBQzFFLG1FQUFtRTtBQUNu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