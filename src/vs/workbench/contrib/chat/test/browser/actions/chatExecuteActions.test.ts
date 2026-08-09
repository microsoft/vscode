/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { type IChatAcceptInputOptions, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatSubmitAction, ExecuteHandoffActionId, GetHandoffsActionId, IToggleChatModeArgs, registerChatExecuteActions, ToggleAgentModeActionId } from '../../../browser/actions/chatExecuteActions.js';
import { IChatMode, IChatModes, IChatModeService, ICustomAgentInfo } from '../../../common/chatModes.js';
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

	test('should return all modes when no sourceCustomAgent is specified', async () => {
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

		const result = await runCommandAsync<ICustomAgentInfo[]>(handler, instantiationService);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].name, 'ask');
		assert.strictEqual(result[0].handoffs.length, 0);
		assert.strictEqual(result[1].name, 'plan');
		assert.strictEqual(result[1].handoffs.length, 1);
	});

	test('should filter by sourceCustomAgent (case-insensitive)', async () => {
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

		const result = await runCommandAsync<ICustomAgentInfo[]>(handler, instantiationService, { sourceCustomAgent: 'Plan' });
		assert.deepStrictEqual(result.length, 1);
		assert.strictEqual(result[0].name, 'plan');
		assert.strictEqual(result[0].handoffs.length, 1);
	});

	test('should return empty array for non-matching sourceCustomAgent', async () => {
		const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });

		instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [] }));

		const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<ICustomAgentInfo[]>(handler, instantiationService, { sourceCustomAgent: 'nonexistent' });
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

	function createMockWidget(currentMode: IChatMode, chatModes: IChatModes): { widget: Partial<IChatWidget>; executeHandoffCalls: IHandOff[] } {
		const executeHandoffCalls: IHandOff[] = [];
		const widget: Partial<IChatWidget> = {
			input: {
				currentModeObs: constObservable(currentMode),
				currentChatModesObs: constObservable(chatModes),
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
		const chatModeService = new MockChatModeService();
		const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, chatModeService);

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { id: 'implement:start-implementation' });
		assert.deepStrictEqual(result, { success: true, targetMode: 'implement' });
		assert.strictEqual(executeHandoffCalls.length, 1);
		assert.strictEqual(executeHandoffCalls[0].label, 'Start Implementation');
	});

	test('should resolve widget by sessionResource', async () => {
		const chatModeService = new MockChatModeService({ builtin: [], custom: [planMode] });
		const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());
		const sessionUri = URI.parse('test://session/1');

		const mockWidgetService = new class extends MockChatWidgetService {
			override getWidgetBySessionResource(resource: URI) {
				return resource.toString() === sessionUri.toString() ? widget as IChatWidget : undefined;
			}
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, chatModeService);

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
		const chatModeService = new MockChatModeService();
		const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, chatModeService);

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { id: 'agent:open-in-editor' });
		assert.deepStrictEqual(result, { success: true, targetMode: 'agent' });
		assert.strictEqual(executeHandoffCalls[0].label, 'Open in Editor');
	});

	test('should fall back to label match when id is not provided', async () => {
		const chatModeService = new MockChatModeService();
		const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, chatModeService);

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { label: 'start implementation' });
		assert.deepStrictEqual(result, { success: true, targetMode: 'implement' });
		assert.strictEqual(executeHandoffCalls[0].prompt, 'Implement the plan');
	});

	test('should return error for non-matching identifier', async () => {
		const chatModeService = new MockChatModeService();
		const { widget } = createMockWidget(planMode, await chatModeService.getLocalModes());

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, chatModeService);

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { id: 'nonexistent:thing' });
		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes('nonexistent:thing'));
	});

	test('should resolve sourceCustomAgent to look up handoffs from a different mode', async () => {
		const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
		const modeService = new MockChatModeService({ builtin: [askMode], custom: [planMode] });
		const { widget, executeHandoffCalls } = createMockWidget(askMode, await modeService.getLocalModes()); // widget is in "ask" mode (no handoffs)

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		// The plan mode has handoffs; sourceCustomAgent overrides the widget's current mode
		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, modeService);

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
		const chatModeService = new MockChatModeService({ builtin: [askMode], custom: [] });
		const { widget } = createMockWidget(askMode, await chatModeService.getLocalModes()); // widget is in "ask" mode (no handoffs)

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widget as IChatWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, chatModeService);

		const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
		assert.ok(handler);

		const result = await runCommandAsync<IExecuteHandoffResult>(handler, instantiationService, { id: 'implement:start-implementation' });
		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes('No handoffs available'));
	});
});

suite('SwitchToNextPinnedModelAction', () => {
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

	test('invokes switchToNextPinnedModel on the last focused widget', async () => {
		let switchCalls = 0;
		const mockWidget = {
			input: {
				switchToNextPinnedModel: () => {
					switchCalls++;
				}
			}
		} as unknown as IChatWidget;

		const mockWidgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = mockWidget;
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);

		const handler = CommandsRegistry.getCommand('workbench.action.chat.switchToNextPinnedModel')?.handler;
		assert.ok(handler);

		await runCommandAsync<void>(handler, instantiationService);
		assert.strictEqual(switchCalls, 1);
	});

	test('is a no-op when there is no focused widget', async () => {
		instantiationService.set(IChatWidgetService, new MockChatWidgetService());

		const handler = CommandsRegistry.getCommand('workbench.action.chat.switchToNextPinnedModel')?.handler;
		assert.ok(handler);

		await runCommandAsync<void>(handler, instantiationService);
	});
});

suite('ChatSubmitAction', () => {
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

	test('passes acceptInputOptions to the widget', async () => {
		let acceptedOptions: unknown;
		const widget = {
			input: {
				pendingDelegationTarget: undefined,
			} as IChatWidget['input'],
			acceptInput: async (_query: string | undefined, options: IChatAcceptInputOptions | undefined) => {
				acceptedOptions = options;
				return undefined;
			},
		} satisfies Partial<IChatWidget>;

		instantiationService.set(ITelemetryService, NullTelemetryService);
		instantiationService.set(IChatWidgetService, new MockChatWidgetService());

		const handler = CommandsRegistry.getCommand(ChatSubmitAction.ID)?.handler;
		assert.ok(handler);

		await runCommandAsync<void>(handler, instantiationService, {
			widget: widget as IChatWidget,
			acceptInputOptions: { cancelCurrentRequest: true },
		});

		assert.deepStrictEqual(acceptedOptions, { cancelCurrentRequest: true });
	});
});

suite('ToggleChatModeAction', () => {
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
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ICommandService, { executeCommand: async () => undefined } as unknown as ICommandService);
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Build a minimal chat widget whose input records setChatMode calls. The
	 * viewModel's model has no editingSession so handleModeSwitch short-circuits.
	 */
	function createMockWidget(currentMode: IChatMode, chatModes: IChatModes, sessionResource: URI, inputUri: URI): {
		widget: IChatWidget;
		setChatModeCalls: string[];
	} {
		const setChatModeCalls: string[] = [];
		const widget = {
			input: {
				currentModeObs: constObservable(currentMode),
				currentChatModesObs: constObservable(chatModes),
				currentModeKind: currentMode.kind,
				inputUri,
				setChatMode: (id: string) => {
					setChatModeCalls.push(id);
				},
			},
			viewModel: {
				sessionResource,
				model: {
					sessionResource,
					getRequests: () => [],
					editingSession: undefined,
				},
			},
		} as unknown as IChatWidget;
		return { widget, setChatModeCalls };
	}

	test('resolves widget by inputUri when multiple widgets share a session resource (issue #275200)', async () => {
		const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
		const agentMode = createMockMode({ id: 'agent', kind: ChatModeKind.Agent, isBuiltin: true });
		const chatModeService = new MockChatModeService({ builtin: [askMode, agentMode], custom: [] });
		const modes = await chatModeService.getLocalModes();

		const sharedSession = URI.parse('chat-session://shared/1');
		const panelInputUri = URI.parse('vscode-chat-input:input-panel');
		const editorInputUri = URI.parse('vscode-chat-input:input-editor');

		// Two widgets with the SAME session resource but DIFFERENT input URIs.
		// Simulates a chat panel and chat editor both showing the same session.
		const panel = createMockWidget(askMode, modes, sharedSession, panelInputUri);
		const editor = createMockWidget(askMode, modes, sharedSession, editorInputUri);

		const mockWidgetService = new class extends MockChatWidgetService {
			// find-by-session returns the FIRST widget (the bug path) — here, the panel.
			override getWidgetBySessionResource(resource: URI) {
				return resource.toString() === sharedSession.toString() ? panel.widget : undefined;
			}
			override getWidgetByInputUri(uri: URI) {
				if (uri.toString() === panelInputUri.toString()) {
					return panel.widget;
				}
				if (uri.toString() === editorInputUri.toString()) {
					return editor.widget;
				}
				return undefined;
			}
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, chatModeService);

		const handler = CommandsRegistry.getCommand(ToggleAgentModeActionId)?.handler;
		assert.ok(handler);

		// User clicks the mode picker in the EDITOR widget, which passes its inputUri.
		const args: IToggleChatModeArgs = {
			modeId: 'agent',
			sessionResource: sharedSession,
			inputUri: editorInputUri,
		};
		await runCommandAsync<void>(handler, instantiationService, args);

		// The editor widget (the one the user clicked in) should have its mode changed.
		// Before the fix, the panel would incorrectly receive the mode change because
		// getWidgetBySessionResource returned the first match.
		assert.deepStrictEqual(editor.setChatModeCalls, ['agent'], 'editor widget should receive setChatMode');
		assert.deepStrictEqual(panel.setChatModeCalls, [], 'panel widget should NOT receive setChatMode');
	});

	test('falls back to sessionResource when inputUri is not provided (back-compat)', async () => {
		const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
		const agentMode = createMockMode({ id: 'agent', kind: ChatModeKind.Agent, isBuiltin: true });
		const chatModeService = new MockChatModeService({ builtin: [askMode, agentMode], custom: [] });
		const modes = await chatModeService.getLocalModes();

		const sessionResource = URI.parse('chat-session://only/1');
		const inputUri = URI.parse('vscode-chat-input:input-only');
		const { widget, setChatModeCalls } = createMockWidget(askMode, modes, sessionResource, inputUri);

		const mockWidgetService = new class extends MockChatWidgetService {
			override getWidgetBySessionResource(resource: URI) {
				return resource.toString() === sessionResource.toString() ? widget : undefined;
			}
		};

		instantiationService.set(IChatWidgetService, mockWidgetService);
		instantiationService.set(IChatModeService, chatModeService);

		const handler = CommandsRegistry.getCommand(ToggleAgentModeActionId)?.handler;
		assert.ok(handler);

		// Legacy callers that don't pass inputUri should still work via sessionResource.
		const args: IToggleChatModeArgs = {
			modeId: 'agent',
			sessionResource,
		};
		await runCommandAsync<void>(handler, instantiationService, args);

		assert.deepStrictEqual(setChatModeCalls, ['agent']);
	});
});
