/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { ChatSessionRoutingController, IChatSessionRoutingHost } from '../../../browser/sessionRouter/chatSessionRoutingController.js';
import { ChatRequestQueueKind, ChatSendResult, IChatService } from '../../../common/chatService/chatService.js';
import { ChatModeKind } from '../../../common/constants.js';

suite('ChatSessionRoutingController', () => {

	ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('uses an exact command title without model intent detection', async () => {
		const command = { commandId: 'workbench.action.terminal.toggleTerminal', label: 'View: Toggle Terminal' };
		let detectIntentCallCount = 0;
		let pendingCommand: typeof command | undefined;
		const host = {
			widget: {
				input: { setSubmitPending: () => { } },
				inputEditor: {
					onDidChangeModelContent: Event.None,
					getValue: () => 'toggle terminal',
				},
				attachmentModel: {
					onDidChange: Event.None,
					attachments: [],
				},
				getSelectedModelRequestOptions: () => ({}),
				getModeRequestOptions: () => ({}),
			},
		} as unknown as IChatSessionRoutingHost;
		const controller = new ChatSessionRoutingController(
			host,
			'test',
			undefined!,
			undefined!,
			undefined!,
			{
				detectIntent: async () => {
					detectIntentCallCount++;
					return { kind: 'chat' };
				},
			} as never,
			undefined!,
			{ warn: () => { } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		Reflect.set(controller, '_collectCommandCandidates', () => [command]);
		Reflect.set(controller, '_beginPendingCommand', (candidate: typeof command) => {
			pendingCommand = candidate;
		});

		await controller.handleSubmit('toggle terminal', ChatModeKind.Agent);

		assert.deepStrictEqual({ detectIntentCallCount, pendingCommand }, { detectIntentCallCount: 0, pendingCommand: command });
		controller.dispose();
	});

	test('detects command intent before collecting chat sessions', async () => {
		const phases: Array<[boolean, boolean]> = [];
		const host = {
			widget: {
				input: { setSubmitPending: (pending: boolean, showingProgress: boolean) => phases.push([pending, showingProgress]) },
				inputEditor: {
					onDidChangeModelContent: Event.None,
					getValue: () => 'turn on zen mode',
				},
				attachmentModel: {
					onDidChange: Event.None,
					attachments: [],
				},
				getSelectedModelRequestOptions: () => ({}),
				getModeRequestOptions: () => ({}),
			},
		} as unknown as IChatSessionRoutingHost;
		const controller = new ChatSessionRoutingController(
			host,
			'test',
			undefined!,
			undefined!,
			undefined!,
			{
				detectIntent: async () => ({ kind: 'command', commandId: 'workbench.action.toggleZenMode', confidence: 0.95 }),
			} as never,
			undefined!,
			{ warn: () => { } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const command = { commandId: 'workbench.action.toggleZenMode', label: 'View: Toggle Zen Mode' };
		let pendingCommand: typeof command | undefined;
		let routeToChat: (() => Promise<void>) | undefined;
		let routedToChat = false;
		Reflect.set(controller, '_collectCommandCandidates', () => [command]);
		Reflect.set(controller, '_beginPendingCommand', (candidate: typeof command, _input: string, _attachmentIds: readonly string[], _cts: CancellationTokenSource, continueToChat: () => Promise<void>) => {
			pendingCommand = candidate;
			routeToChat = continueToChat;
		});
		Reflect.set(controller, '_routeToChat', () => {
			routedToChat = true;
			return Promise.resolve();
		});

		await controller.handleSubmit('turn on zen mode', ChatModeKind.Agent);

		assert.deepStrictEqual({
			pendingCommand,
			routedToChat,
			phases,
		}, {
			pendingCommand: command,
			routedToChat: false,
			phases: [[true, true], [true, false]],
		});
		await routeToChat?.();
		assert.strictEqual(routedToChat, true);
		controller.dispose();
	});

	test('auto-runs a reviewed command after countdown', async () => {
		const clock = sinon.useFakeTimers();
		const command = { commandId: 'workbench.action.toggleZenMode', label: 'View: Toggle Zen Mode' };
		const phases: Array<[boolean, boolean]> = [];
		const executionOrder: string[] = [];
		const container = document.createElement('div');
		document.body.appendChild(container);
		const executeCommand = sinon.stub().callsFake(async () => {
			executionOrder.push('execute');
		});
		try {
			const host = {
				widget: {
					input: { setSubmitPending: (pending: boolean, showingProgress: boolean) => phases.push([pending, showingProgress]) },
					inputEditor: {
						onDidChangeModelContent: Event.None,
						getValue: () => 'turn on zen mode',
						setValue: () => { },
					},
					attachmentModel: {
						onDidChange: Event.None,
						attachments: [],
						clear: () => { },
					},
					getSelectedModelRequestOptions: () => ({}),
					getModeRequestOptions: () => ({}),
				},
				getOwnSessionResource: () => undefined,
				prepareForCommandExecution: async () => {
					executionOrder.push('focus');
				},
				placeBadge: (badge: HTMLElement) => container.appendChild(badge),
			} as unknown as IChatSessionRoutingHost;
			const controller = new ChatSessionRoutingController(
				host,
				'test',
				undefined!,
				undefined!,
				undefined!,
				{
					detectIntent: async () => ({ kind: 'command', commandId: command.commandId, confidence: 0.95 }),
				} as never,
				undefined!,
				{ warn: () => { } } as never,
				undefined!,
				undefined!,
				undefined!,
				{ executeCommand } as never,
				undefined!,
				undefined!,
				undefined!,
			);
			Reflect.set(controller, '_collectCommandCandidates', () => [command]);

			await controller.handleSubmit('turn on zen mode', ChatModeKind.Agent);
			await clock.tickAsync(10000);

			assert.deepStrictEqual({
				executeCommandCallCount: executeCommand.callCount,
				executionOrder,
				phases,
			}, {
				executeCommandCallCount: 1,
				executionOrder: ['focus', 'execute'],
				phases: [[true, true], [true, false], [true, true], [false, false]],
			});
			controller.dispose();
		} finally {
			clock.restore();
			container.remove();
		}
	});

	test('run now starts execution and removes cancellation controls', async () => {
		const command = { commandId: 'workbench.action.toggleZenMode', label: 'View: Toggle Zen Mode' };
		const container = document.createElement('div');
		document.body.appendChild(container);
		let resolveCommand: (() => void) | undefined;
		const executePromise = new Promise<void>(resolve => resolveCommand = resolve);
		const executeCommand = sinon.stub().returns(executePromise);
		try {
			const host = {
				widget: {
					input: { setSubmitPending: () => { } },
					inputEditor: {
						onDidChangeModelContent: Event.None,
						getValue: () => 'turn on zen mode',
						setValue: () => { },
					},
					attachmentModel: {
						onDidChange: Event.None,
						attachments: [],
						clear: () => { },
					},
					getSelectedModelRequestOptions: () => ({}),
					getModeRequestOptions: () => ({}),
				},
				getOwnSessionResource: () => undefined,
				placeBadge: (badge: HTMLElement) => container.appendChild(badge),
			} as unknown as IChatSessionRoutingHost;
			const controller = new ChatSessionRoutingController(
				host,
				'test',
				undefined!,
				undefined!,
				undefined!,
				{
					detectIntent: async () => ({ kind: 'command', commandId: command.commandId, confidence: 0.95 }),
				} as never,
				undefined!,
				{ warn: () => { } } as never,
				undefined!,
				undefined!,
				undefined!,
				{ executeCommand } as never,
				undefined!,
				undefined!,
				undefined!,
			);
			Reflect.set(controller, '_collectCommandCandidates', () => [command]);

			await controller.handleSubmit('turn on zen mode', ChatModeKind.Agent);
			const runNow = [...container.querySelectorAll<HTMLElement>('.chat-routing-badge-action')]
				.find(action => action.textContent === 'Run Now');
			assert.ok(runNow);
			runNow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			assert.strictEqual(executeCommand.callCount, 1);
			assert.strictEqual(
				[...container.querySelectorAll<HTMLElement>('.chat-routing-badge-action')].some(action => action.textContent === 'Cancel'),
				false,
			);
			const submitCts = Reflect.get(controller, '_submitCts') as { value?: CancellationTokenSource };
			assert.strictEqual(submitCts.value?.token.isCancellationRequested, false);

			resolveCommand?.();
			await executePromise;
			controller.dispose();
		} finally {
			container.remove();
		}
	});

	test('cancel keeps draft and skips command execution', async () => {
		const command = { commandId: 'workbench.action.toggleZenMode', label: 'View: Toggle Zen Mode' };
		const container = document.createElement('div');
		document.body.appendChild(container);
		const executeCommand = sinon.stub().resolves();
		try {
			const host = {
				widget: {
					input: { setSubmitPending: () => { } },
					inputEditor: {
						onDidChangeModelContent: Event.None,
						getValue: () => 'turn on zen mode',
						setValue: () => { },
					},
					attachmentModel: {
						onDidChange: Event.None,
						attachments: [],
						clear: () => { },
					},
					getSelectedModelRequestOptions: () => ({}),
					getModeRequestOptions: () => ({}),
				},
				getOwnSessionResource: () => undefined,
				placeBadge: (badge: HTMLElement) => container.appendChild(badge),
			} as unknown as IChatSessionRoutingHost;
			const controller = new ChatSessionRoutingController(
				host,
				'test',
				undefined!,
				undefined!,
				undefined!,
				{
					detectIntent: async () => ({ kind: 'command', commandId: command.commandId, confidence: 0.95 }),
				} as never,
				undefined!,
				{ warn: () => { } } as never,
				undefined!,
				undefined!,
				undefined!,
				{ executeCommand } as never,
				undefined!,
				undefined!,
				undefined!,
			);
			Reflect.set(controller, '_collectCommandCandidates', () => [command]);

			await controller.handleSubmit('turn on zen mode', ChatModeKind.Agent);
			const cancel = [...container.querySelectorAll<HTMLElement>('.chat-routing-badge-action')]
				.find(action => action.textContent === 'Cancel');
			assert.ok(cancel);
			cancel?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			assert.strictEqual(executeCommand.callCount, 0);
			const submitCts = Reflect.get(controller, '_submitCts') as { value?: CancellationTokenSource };
			assert.strictEqual(submitCts.value, undefined);
			controller.dispose();
		} finally {
			container.remove();
		}
	});

	test('shows command failure result when execution fails', async () => {
		const command = { commandId: 'workbench.action.toggleZenMode', label: 'View: Toggle Zen Mode' };
		const container = document.createElement('div');
		document.body.appendChild(container);
		const executeCommand = sinon.stub().rejects(new Error('boom'));
		try {
			const host = {
				widget: {
					input: { setSubmitPending: () => { } },
					inputEditor: {
						onDidChangeModelContent: Event.None,
						getValue: () => 'turn on zen mode',
						setValue: () => { },
					},
					attachmentModel: {
						onDidChange: Event.None,
						attachments: [],
						clear: () => { },
					},
					getSelectedModelRequestOptions: () => ({}),
					getModeRequestOptions: () => ({}),
				},
				getOwnSessionResource: () => undefined,
				placeBadge: (badge: HTMLElement) => container.appendChild(badge),
			} as unknown as IChatSessionRoutingHost;
			const controller = new ChatSessionRoutingController(
				host,
				'test',
				undefined!,
				undefined!,
				undefined!,
				{
					detectIntent: async () => ({ kind: 'command', commandId: command.commandId, confidence: 0.95 }),
				} as never,
				undefined!,
				{ warn: () => { } } as never,
				undefined!,
				undefined!,
				undefined!,
				{ executeCommand } as never,
				undefined!,
				undefined!,
				undefined!,
			);
			Reflect.set(controller, '_collectCommandCandidates', () => [command]);

			await controller.handleSubmit('turn on zen mode', ChatModeKind.Agent);
			const runNow = [...container.querySelectorAll<HTMLElement>('.chat-routing-badge-action')]
				.find(action => action.textContent === 'Run Now');
			assert.ok(runNow);
			runNow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await Promise.resolve();

			assert.ok(container.textContent?.includes('Could not run command View: Toggle Zen Mode.'));
			controller.dispose();
		} finally {
			container.remove();
		}
	});

	test('returns the stable request id for an immediately sent route', async () => {
		const resource = URI.parse('agent-host-copilotcli:/untitled-route');
		const chatService = {
			sendRequest: async (): Promise<ChatSendResult> => ({
				kind: 'sent',
				newSessionResource: URI.parse('agent-host-copilotcli:/durable-route'),
				data: {
					agent: undefined!,
					responseCreatedPromise: Promise.resolve({ requestId: 'stable-request-id' } as never),
					responseCompletePromise: Promise.resolve(),
				},
			}),
		} as unknown as IChatService;
		const controller = new ChatSessionRoutingController(
			{} as IChatSessionRoutingHost,
			'test',
			chatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ warn: () => { } } as never,
			undefined!,
			{ setFolder: () => { } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const sendRequest = Reflect.get(controller, '_sendRequest') as (resource: URI, utterance: string, options: object) => Promise<{ status: string; resource?: URI; requestId?: string }>;

		const result = await sendRequest.call(controller, resource, 'Run the build', {});

		assert.deepStrictEqual({
			status: result.status,
			resource: result.resource?.toString(),
			requestId: result.requestId,
		}, {
			status: 'sent',
			resource: 'agent-host-copilotcli:/durable-route',
			requestId: 'stable-request-id',
		});
		controller.dispose();
	});

	test('keeps an existing session reference until a queued route completes', async () => {
		const resource = URI.parse('agent-host-copilotcli:/existing-route');
		let resolveQueued!: (result: ChatSendResult) => void;
		const queued = new Promise<ChatSendResult>(resolve => resolveQueued = resolve);
		let disposed = false;
		let sentOptions: { userSelectedModelId?: string; agentIdSilent?: string; queue?: ChatRequestQueueKind } | undefined;
		const chatService = {
			acquireOrLoadSession: async () => ({
				object: { sessionResource: resource },
				dispose: () => disposed = true,
			}),
			sendRequest: async (_resource: URI, _message: string, options: typeof sentOptions): Promise<ChatSendResult> => {
				sentOptions = options;
				return { kind: 'queued', requestId: 'queued-request', deferred: queued };
			},
		} as unknown as IChatService;
		const host = {
			widget: {
				inputEditor: { getValue: () => 'different draft', setValue: () => { } },
				attachmentModel: { attachments: [], clear: () => { } },
			},
		} as unknown as IChatSessionRoutingHost;
		const controller = new ChatSessionRoutingController(
			host,
			'test',
			chatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const dispatch = Reflect.get(controller, '_dispatchToSession') as (
			sessionId: string,
			input: string,
			attachmentIds: readonly string[],
			utterance: string,
			options: object,
			token: CancellationToken,
			notifyRoute: boolean,
		) => Promise<{ completion?: Promise<unknown> }>;

		const result = await dispatch.call(controller, resource.toString(), 'run', [], 'run', { userSelectedModelId: 'picked-model' }, CancellationToken.None, false);

		assert.strictEqual(disposed, false);
		assert.strictEqual(sentOptions?.userSelectedModelId, undefined);
		assert.strictEqual(sentOptions?.agentIdSilent, AgentSessionProviders.AgentHostCopilot);
		assert.strictEqual(sentOptions?.queue, ChatRequestQueueKind.Queued);
		resolveQueued({
			kind: 'sent',
			data: {
				agent: undefined!,
				responseCreatedPromise: Promise.resolve({ requestId: 'queued-request' } as never),
				responseCompletePromise: Promise.resolve(),
			},
		});
		await result.completion;
		assert.strictEqual(disposed, true);
		controller.dispose();
	});

	test('selects the created Agent Host session agent for a new route', async () => {
		const resource = URI.parse('agent-host-copilotcli:/new-route');
		let sentOptions: { agentIdSilent?: string } | undefined;
		const chatService = {
			acquireOrLoadSession: async () => ({
				object: { sessionResource: resource },
				dispose: () => { },
			}),
			sendRequest: async (_resource: URI, _message: string, options: typeof sentOptions): Promise<ChatSendResult> => {
				sentOptions = options;
				return { kind: 'rejected', reason: 'stop after option capture' };
			},
		} as unknown as IChatService;
		const controller = new ChatSessionRoutingController(
			{ getNewSessionTarget: () => AgentSessionProviders.AgentHostCopilot } as IChatSessionRoutingHost,
			'test',
			chatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ warn: () => { } } as never,
			undefined!,
			{ setFolder: () => { } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const dispatch = Reflect.get(controller, '_dispatchToNewSession') as (
			input: string,
			attachmentIds: readonly string[],
			utterance: string,
			options: object,
			token: CancellationToken,
			notifyRoute: boolean,
			folder: URI,
		) => Promise<unknown>;

		await dispatch.call(controller, 'run', [], 'run', {}, CancellationToken.None, false, URI.file('/workspace'));

		assert.strictEqual(sentOptions?.agentIdSilent, AgentSessionProviders.AgentHostCopilot);
		controller.dispose();
	});

	test('does not send another provider session metadata to the Copilot router', async () => {
		const session = (providerType: AgentSessionProviders, path: string) => ({
			resource: URI.from({ scheme: providerType, path }),
			providerType,
			label: path,
			status: undefined,
			isArchived: () => false,
		});
		const agentSessionsService = {
			model: {
				resolve: async () => { },
				sessions: [
					session(AgentSessionProviders.AgentHostCopilot, '/copilot'),
					session(AgentSessionProviders.AgentHostClaude, '/claude'),
				],
			},
		};
		const controller = new ChatSessionRoutingController(
			{ getOwnSessionResource: () => undefined } as IChatSessionRoutingHost,
			'test',
			undefined!,
			agentSessionsService as never,
			{ getChatSessionContribution: () => ({ isReadOnly: false }) } as never,
			undefined!,
			undefined!,
			{ warn: () => { } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const collect = Reflect.get(controller, '_collectCandidateSessions') as (token: CancellationToken) => Promise<readonly { sessionId: string }[]>;

		const candidates = await collect.call(controller, CancellationToken.None);

		assert.deepStrictEqual(candidates.map(candidate => candidate.sessionId), ['agent-host-copilotcli:/copilot']);
		controller.dispose();
	});
});
