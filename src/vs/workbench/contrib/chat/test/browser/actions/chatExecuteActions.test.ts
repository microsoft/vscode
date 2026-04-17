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
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatDynamicVariableModel } from '../../../browser/attachments/chatDynamicVariables.js';
import { GetHandoffsActionId, ExecuteHandoffActionId, registerChatExecuteActions } from '../../../browser/actions/chatExecuteActions.js';
import { IChatMode, IChatModeService, ICustomAgentInfo } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IDynamicVariable } from '../../../common/attachments/chatVariables.js';
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

suite('GetHandoffsAction', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;

	let chatExecuteActions: DisposableStore;
	suiteSetup(() => {
		chatExecuteActions = registerChatExecuteActions();
	});

	suiteTeardown(() => {
		chatExecuteActions.dispose();
	});

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

	let chatExecuteActions: DisposableStore;
	suiteSetup(() => {
		chatExecuteActions = registerChatExecuteActions();
	});

	suiteTeardown(() => {
		chatExecuteActions.dispose();
	});

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

suite('SendToNewChatAction', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;

	let chatExecuteActions: DisposableStore;
	suiteSetup(() => {
		chatExecuteActions = registerChatExecuteActions();
	});

	suiteTeardown(() => {
		chatExecuteActions.dispose();
	});

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	interface ICallLog {
		event: 'setInput' | 'clear' | 'addContext' | 'addReference' | 'acceptInput';
		value?: unknown;
	}

	function createMockWidget(input: string, attachments: IChatRequestVariableEntry[], dynamicVariables: IDynamicVariable[]) {
		const calls: ICallLog[] = [];
		let currentInput = input;
		let currentAttachments = [...attachments];
		let currentVariables = [...dynamicVariables];

		const mockDynamicVariableModel: Partial<ChatDynamicVariableModel> = {
			get variables() { return currentVariables.slice(); },
			addReference: (ref: IDynamicVariable) => {
				calls.push({ event: 'addReference', value: ref });
				currentVariables.push(ref);
			},
		};

		const widget: Partial<IChatWidget> = {
			viewContext: {},
			viewModel: undefined,
			get attachmentModel() {
				return {
					get attachments() { return currentAttachments.slice(); },
					addContext: (...entries: IChatRequestVariableEntry[]) => {
						calls.push({ event: 'addContext', value: entries });
						currentAttachments.push(...entries);
					},
				} as unknown as IChatWidget['attachmentModel'];
			},
			getInput: () => currentInput,
			setInput: (value?: string) => {
				calls.push({ event: 'setInput', value });
				currentInput = value ?? '';
				if (value === '' || value === undefined) {
					// Emulate the editor content being replaced; the dynamic variable model
					// detaches variables whose decorations are invalidated.
					currentVariables = [];
				}
			},
			clear: async () => {
				calls.push({ event: 'clear' });
				// Emulate the local-session editor clear: attachments and variables are reset.
				currentAttachments = [];
				currentVariables = [];
			},
			acceptInput: async (query?: string) => {
				calls.push({ event: 'acceptInput', value: { query, input: currentInput, attachments: currentAttachments.slice(), variables: currentVariables.slice() } });
				return undefined;
			},
			getContrib: function <T>(id: string): T | undefined {
				if (id === ChatDynamicVariableModel.ID) {
					return mockDynamicVariableModel as unknown as T;
				}
				return undefined;
			},
		};

		return { widget: widget as IChatWidget, calls };
	}

	test('preserves attachments and dynamic variables when sending to a new chat (issue #292064)', async () => {
		const attachment: IChatRequestVariableEntry = {
			kind: 'generic',
			id: 'changes',
			name: 'changes',
			value: '',
		};
		const dynamicVariable: IDynamicVariable = {
			id: 'changes',
			fullName: 'changes',
			range: { startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 16 },
			data: '',
		};

		const { widget, calls } = createMockWidget('review #changes', [attachment], [dynamicVariable]);

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatService, {} as unknown as IChatService);
		instantiationService.set(IViewsService, {} as unknown as IViewsService);
		instantiationService.set(IDialogService, {} as unknown as IDialogService);

		const handler = CommandsRegistry.getCommand('workbench.action.chat.sendToNewChat')?.handler;
		assert.ok(handler);

		await runCommandAsync(handler, instantiationService);

		// The acceptInput call is the final event; it must see the restored input, attachments,
		// and dynamic variables so that references like #changes survive the transition.
		const acceptInputCall = calls.find(c => c.event === 'acceptInput');
		assert.ok(acceptInputCall, 'acceptInput must be called');
		const payload = acceptInputCall.value as { query: string | undefined; input: string; attachments: IChatRequestVariableEntry[]; variables: IDynamicVariable[] };
		assert.strictEqual(payload.input, 'review #changes', 'input text must be restored');
		assert.strictEqual(payload.attachments.length, 1, 'attachments must be restored');
		assert.strictEqual(payload.attachments[0].id, 'changes');
		assert.strictEqual(payload.variables.length, 1, 'dynamic variables must be restored');
		assert.strictEqual(payload.variables[0].id, 'changes');

		// Ensure the capture happened before the clear (otherwise the attachments would be lost).
		const clearIdx = calls.findIndex(c => c.event === 'clear');
		const addContextIdx = calls.findIndex(c => c.event === 'addContext');
		const addReferenceIdx = calls.findIndex(c => c.event === 'addReference');
		assert.ok(clearIdx >= 0, 'clear must be called');
		assert.ok(addContextIdx > clearIdx, 'attachments must be re-added after clear');
		assert.ok(addReferenceIdx > clearIdx, 'dynamic variables must be re-added after clear');
	});

	test('does not fail when there are no attachments or dynamic variables', async () => {
		const { widget, calls } = createMockWidget('hello', [], []);

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatService, {} as unknown as IChatService);
		instantiationService.set(IViewsService, {} as unknown as IViewsService);
		instantiationService.set(IDialogService, {} as unknown as IDialogService);

		const handler = CommandsRegistry.getCommand('workbench.action.chat.sendToNewChat')?.handler;
		assert.ok(handler);

		await runCommandAsync(handler, instantiationService);

		const acceptInputCall = calls.find(c => c.event === 'acceptInput');
		assert.ok(acceptInputCall, 'acceptInput must be called');
		const payload = acceptInputCall.value as { input: string };
		assert.strictEqual(payload.input, 'hello');
		assert.ok(!calls.some(c => c.event === 'addContext'), 'addContext should not be called for empty attachments');
		assert.ok(!calls.some(c => c.event === 'addReference'), 'addReference should not be called for empty variables');
	});
});
