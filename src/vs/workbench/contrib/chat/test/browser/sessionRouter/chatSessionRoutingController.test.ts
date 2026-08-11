/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { ChatSessionRoutingController, IChatSessionRoutingHost } from '../../../browser/sessionRouter/chatSessionRoutingController.js';
import { ChatRequestQueueKind, ChatSendResult, IChatService } from '../../../common/chatService/chatService.js';

suite('ChatSessionRoutingController', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the selected folder and folder picker for multi-root new sessions', async () => {
		const clock = sinon.useFakeTimers();
		const vscode = folder('vscode', '/work/vscode', 0);
		const docs = folder('docs', '/work/docs', 1);
		const container = document.createElement('div');
		document.body.appendChild(container);
		let submitted = false;
		let resolveFolderPick: (() => void) | undefined;
		const host = {
			widget: {
				inputEditor: {
					onDidChangeModelContent: Event.None,
					getValue: () => 'create a new session to update docs',
				},
				attachmentModel: {
					onDidChange: Event.None,
					attachments: [],
				},
				input: { setSubmitPending: () => { } },
				getSelectedModelRequestOptions: () => ({}),
				getModeRequestOptions: () => ({}),
			},
			getOwnSessionResource: () => undefined,
			getNewSessionTarget: () => AgentSessionProviders.AgentHostCopilot,
			placeBadge: (badge: HTMLElement) => container.appendChild(badge),
		} as unknown as IChatSessionRoutingHost;
		const workspaceContextService = {
			getWorkspace: () => ({ folders: [vscode, docs] }),
			getWorkspaceFolder: (resource: URI) => [vscode, docs].find(candidate => candidate.uri.toString() === resource.toString()),
		} as IWorkspaceContextService;
		const controller = new ChatSessionRoutingController(
			host,
			'test',
			{ sendRequest: async () => { submitted = true; return { kind: 'rejected' }; } } as unknown as IChatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ info: () => { }, warn: () => { } } as never,
			workspaceContextService,
			{ getDefaultFolder: () => undefined, setFolder: () => { } } as never,
			{
				pick: <T>(items: readonly T[]) => new Promise<T | undefined>(resolve => {
					resolveFolderPick = () => resolve(items[0]);
				})
			} as never,
		);

		await controller.handleSubmit('create a new session to update docs', undefined!);
		const label = container.querySelector<HTMLElement>('.chat-routing-badge-name');
		const changeFolder = container.querySelector<HTMLButtonElement>('.chat-routing-badge-folder-action');
		const countdown = container.querySelector<HTMLElement>('.chat-routing-badge-countdown');
		assert.deepStrictEqual({
			submitted,
			label: label?.textContent,
			changeFolder: changeFolder?.textContent,
			countdown: countdown?.textContent,
		}, {
			submitted: false,
			label: 'New session in docs',
			changeFolder: 'Change Folder',
			countdown: 'sending in 10s',
		});

		try {
			clock.tick(3_000);
			assert.strictEqual(countdown?.textContent, 'sending in 7s');
			changeFolder?.click();
			assert.strictEqual(countdown?.textContent, 'waiting for you');
			clock.tick(5_000);
			assert.strictEqual(countdown?.textContent, 'waiting for you');
			resolveFolderPick?.();
			await Promise.resolve();
			assert.deepStrictEqual({
				label: label?.textContent,
				countdown: countdown?.textContent,
			}, {
				label: 'New session in vscode',
				countdown: 'sending in 7s',
			});
			clock.tick(1_000);
			assert.strictEqual(countdown?.textContent, 'sending in 6s');
		} finally {
			controller.dispose();
			container.remove();
			clock.restore();
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
			{ info: () => { }, warn: () => { } } as never,
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

	test('dismisses routed pending input with the delivery badge', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const resource = URI.parse('agent-host-copilotcli:/dismissed-route');
		let dismissed: { resource: string; requestId: string | undefined } | undefined;
		const controller = new ChatSessionRoutingController(
			{
				placeBadge: badge => container.appendChild(badge),
				onDidDismissRoute: (dismissedResource, requestId) => {
					dismissed = { resource: dismissedResource.toString(), requestId };
				},
			} as IChatSessionRoutingHost,
			'test',
			{ getSession: () => undefined } as unknown as IChatService,
			{ model: { getSession: () => undefined, onDidChangeSessions: Event.None } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const showDeliveryConfirmation = Reflect.get(controller, '_showDeliveryConfirmation') as (
			label: string,
			result: { status: 'sent'; resource: URI; requestId: string },
		) => void;

		showDeliveryConfirmation.call(controller, 'Session', { status: 'sent', resource, requestId: 'request-1' });
		container.querySelectorAll<HTMLElement>('.chat-routing-badge-action')[1]?.click();

		assert.deepStrictEqual({
			dismissed,
			badgeConnected: !!container.querySelector('.chat-routing-badge'),
		}, {
			dismissed: { resource: resource.toString(), requestId: 'request-1' },
			badgeConnected: false,
		});

		controller.dispose();
		container.remove();
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
			{ info: () => { }, warn: () => { } } as never,
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
			{ info: () => { }, warn: () => { } } as never,
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

function folder(name: string, path: string, index: number): IWorkspaceFolder {
	const uri = URI.file(path);
	return { uri, name, index, toResource: relativePath => URI.joinPath(uri, relativePath) };
}
