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
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { GetHandoffsActionId, ExecuteHandoffActionId, registerChatExecuteActions } from '../../../browser/actions/chatExecuteActions.js';
import { IChatMode, IChatModeService, ICustomAgentInfo } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import { IHandOff } from '../../../common/promptSyntax/promptFileParser.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';
import { MockChatModeService } from '../../common/mockChatModeService.js';

interface IExecuteHandoffResult {
	success: boolean;
	targetMode?: string;
	error?: string;
}

// CommandsRegistry types all handlers as returning void, but our commands
// return real values. This helper performs the double cast safely.
function runCommand<T>(handler: Function, ...args: unknown[]): T {
	return handler(...args) as unknown as T;
}

async function runCommandAsync<T>(handler: Function, ...args: unknown[]): Promise<T> {
	return await handler(...args) as unknown as T;
}

function createMockMode(overrides: Partial<IChatMode> & { id: string; kind: ChatModeKind }): IChatMode {
	return {
		name: constObservable(overrides.id),
		label: constObservable(overrides.id),
		icon: constObservable(undefined),
		description: constObservable(undefined),
		isBuiltin: overrides.isBuiltin ?? false,
		target: constObservable(Target.Undefined),
		...overrides,
	} as IChatMode;
}

// Register once at module level so disposables are created before suite tracking begins
registerChatExecuteActions();

suite('GetHandoffsAction', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;

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
				{ agent: 'implement', label: 'Start', prompt: 'go' } satisfies IHandOff,
			]),
		});

		instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));

		const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
		assert.ok(handler);

		const result = runCommand<ICustomAgentInfo[]>(handler, instantiationService);
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
				{ agent: 'implement', label: 'Start', prompt: 'go' } satisfies IHandOff,
			]),
		});

		instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));

		const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
		assert.ok(handler);

		const result = runCommand<ICustomAgentInfo[]>(handler, instantiationService, { sourceCustomAgent: 'Plan' });
		assert.deepStrictEqual(result.length, 1);
		assert.strictEqual(result[0].name, 'plan');
		assert.strictEqual(result[0].handoffs.length, 1);
	});

	test('should return empty array for non-matching sourceCustomAgent', () => {
		const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });

		instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [] }));

		const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
		assert.ok(handler);

		const result = runCommand<ICustomAgentInfo[]>(handler, instantiationService, { sourceCustomAgent: 'nonexistent' });
		assert.deepStrictEqual(result, []);
	});
});

suite('ExecuteHandoffAction', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	const testHandoffs: IHandOff[] = [
		{ agent: 'implement', label: 'Start Implementation', prompt: 'Implement the plan', send: true },
		{ agent: 'agent', label: 'Open in Editor', prompt: 'Open it' },
	];

	const planMode = createMockMode({
		id: 'plan',
		kind: ChatModeKind.Agent,
		handOffs: observableValue('handOffs', testHandoffs),
	});

	function createMockWidget(currentMode: IChatMode): { widget: Partial<IChatWidget>; executeHandoffCalls: IHandOff[] } {
		const executeHandoffCalls: IHandOff[] = [];
		const widget: Partial<IChatWidget> = {
			input: {
				currentModeObs: constObservable(currentMode),
			} as IChatWidget['input'],
			executeHandoff: async (handoff: IHandOff) => {
				executeHandoffCalls.push(handoff);
			},
		};
		return { widget, executeHandoffCalls };
	}

	test('should return error when neither id nor label is provided', async () => {
		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, {});
		assert.deepStrictEqual(result, { success: false, error: 'Either id or label is required' });
	});

	test('should return error when no widget is found', async () => {
		instantiationService.set(IChatWidgetService, new MockChatWidgetService());
		instantiationService.set(IChatModeService, new MockChatModeService());

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { id: 'implement:start-implementation' });
		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes('No chat widget found'));
	});

	test('should fall back to lastFocusedWidget when sessionResource is omitted', async () => {
		const { widget, executeHandoffCalls } = createMockWidget(planMode);

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [], custom: [planMode] }));

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { id: 'implement:start-implementation' });
		assert.deepStrictEqual(result, { success: true, targetMode: 'implement' });
		assert.strictEqual(executeHandoffCalls.length, 1);
		assert.strictEqual(executeHandoffCalls[0].label, 'Start Implementation');
	});

	test('should resolve widget by sessionResource', async () => {
		const { widget, executeHandoffCalls } = createMockWidget(planMode);
		const sessionUri = URI.parse('test://session/1');

		const mockWidgetService = new class extends MockChatWidgetService {
			override getWidgetBySessionResource(resource: URI) {
				return resource.toString() === sessionUri.toString() ? widget as IChatWidget : undefined;
			}
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [], custom: [planMode] }));

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, {
			id: 'implement:start-implementation',
			sessionResource: sessionUri.toString(),
		});
		assert.deepStrictEqual(result, { success: true, targetMode: 'implement' });
		assert.strictEqual(executeHandoffCalls.length, 1);
	});

	test('should match by id (primary)', async () => {
		const { widget, executeHandoffCalls } = createMockWidget(planMode);

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, new MockChatModeService());

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { id: 'agent:open-in-editor' });
		assert.deepStrictEqual(result, { success: true, targetMode: 'agent' });
		assert.strictEqual(executeHandoffCalls[0].label, 'Open in Editor');
	});

	test('should fall back to label match when id is not provided', async () => {
		const { widget, executeHandoffCalls } = createMockWidget(planMode);

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, new MockChatModeService());

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { label: 'start implementation' });
		assert.deepStrictEqual(result, { success: true, targetMode: 'implement' });
		assert.strictEqual(executeHandoffCalls[0].prompt, 'Implement the plan');
	});

	test('should return error for non-matching identifier', async () => {
		const { widget } = createMockWidget(planMode);

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, new MockChatModeService());

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { id: 'nonexistent:thing' });
		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes('nonexistent:thing'));
	});

	test('should resolve sourceCustomAgent to look up handoffs from a different mode', async () => {
		const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
		const { widget, executeHandoffCalls } = createMockWidget(askMode); // widget is in "ask" mode (no handoffs)

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		// The plan mode has handoffs; sourceCustomAgent overrides the widget's current mode
		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, {
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
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [] }));

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { id: 'implement:start-implementation' });
		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes('No handoffs available'));
	});
});
