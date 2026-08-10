/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { ChatSessionRoutingController, IChatSessionRoutingHost } from '../../../browser/sessionRouter/chatSessionRoutingController.js';
import { ChatRequestQueueKind, ChatSendResult, IChatService } from '../../../common/chatService/chatService.js';

suite('ChatSessionRoutingController', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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
		);
		const collect = Reflect.get(controller, '_collectCandidateSessions') as (token: CancellationToken) => Promise<readonly { sessionId: string }[]>;

		const candidates = await collect.call(controller, CancellationToken.None);

		assert.deepStrictEqual(candidates.map(candidate => candidate.sessionId), ['agent-host-copilotcli:/copilot']);
		controller.dispose();
	});
});
