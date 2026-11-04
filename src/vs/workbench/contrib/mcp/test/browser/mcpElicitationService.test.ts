/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotification, INotificationService, NoOpNotification } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ElicitationState, IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IChatEditingService } from '../../../chat/common/editing/chatEditingService.js';
import { ChatModel } from '../../../chat/common/model/chatModel.js';
import { ChatElicitationRequestPart } from '../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatQuestionCarouselData } from '../../../chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { McpElicitationService } from '../../browser/mcpElicitationService.js';
import { ElicitationKind, ElicitResult, IMcpServer, IMcpToolCallContext } from '../../common/mcpTypes.js';
import { MCP } from '../../common/modelContextProtocol.js';

suite('McpElicitationService', () => {
	const elicitation: MCP.ElicitRequestFormParams = {
		mode: 'form',
		message: 'Continue **the operation**? [Details](command:untrusted)',
		requestedSchema: { type: 'object', properties: {} },
	};
	let model: ChatModel;
	let service: McpElicitationService;
	let server: IMcpServer;
	let cancellation: CancellationTokenSource;
	let pending: Promise<ElicitResult> | undefined;

	teardown(async () => {
		cancellation.cancel();
		(await pending)?.dispose();
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		cancellation = store.add(new CancellationTokenSource());
		pending = undefined;
		const chatService = upcastPartial<IChatService>({ getSession: () => model });
		model = store.add(new ChatModel(
			undefined,
			{ initialLocation: ChatAgentLocation.Chat, canUseTools: true, disableBackgroundKeepAlive: true },
			new NullLogService(),
			upcastPartial<IChatAgentService>({ getDefaultAgent: () => undefined }),
			upcastPartial<IChatEditingService>({}),
			chatService,
		));
		model.addRequest({ text: 'Use the MCP server', parts: [] }, { variables: [] }, 0);
		service = new McpElicitationService(
			upcastPartial<INotificationService>({ notify: () => assert.fail('Unexpected notification') }),
			upcastPartial<IQuickInputService>({ createQuickPick: () => assert.fail('Unexpected quick pick') }),
			chatService,
			upcastPartial<IOpenerService>({}),
		);
		server = upcastPartial<IMcpServer>({
			definition: upcastPartial<IMcpServer['definition']>({ id: 'server', label: 'Server' }),
			collection: upcastPartial<IMcpServer['collection']>({ id: 'collection', label: 'Collection', order: 0 }),
			serverMetadata: constObservable<ReturnType<IMcpServer['serverMetadata']['get']>>(undefined),
		});
	});

	test('confirms an empty form with its message and server source before accepting', async () => {
		pending = service.elicit(server, { chatSessionResource: model.sessionResource }, elicitation, cancellation.token);
		const parts = model.getRequests()[0].response?.response.value;
		const part = parts?.[0];
		assert.ok(part instanceof ChatElicitationRequestPart);
		assert.ok(part.message instanceof MarkdownString);
		assert.deepStrictEqual({
			kinds: parts?.map(part => part.kind),
			message: part.message.value,
			isTrusted: part.message.isTrusted,
			subtitle: part.subtitle,
			source: part.source,
			state: part.state.get(),
		}, {
			kinds: ['elicitation2'],
			message: elicitation.message,
			isTrusted: false,
			subtitle: 'Server (MCP Server)',
			source: { type: 'mcp', serverLabel: undefined, instructions: undefined, label: 'Server', collectionId: 'collection', definitionId: 'server' },
			state: ElicitationState.Pending,
		});

		await part.accept(true);
		const result = await pending;
		assert.deepStrictEqual({
			kind: result.kind,
			value: result.value,
			state: part.state.get(),
		}, {
			kind: ElicitationKind.Form,
			value: { action: 'accept', content: {} },
			state: ElicitationState.Accepted,
		});
	});

	test('declines an empty form', async () => {
		pending = service.elicit(server, { chatSessionResource: model.sessionResource }, elicitation, cancellation.token);
		const part = model.getRequests()[0].response?.response.value[0];
		assert.ok(part instanceof ChatElicitationRequestPart);
		assert.ok(part.reject);
		await part.reject();

		assert.deepStrictEqual({
			value: (await pending).value,
			state: part.state.get(),
		}, {
			value: { action: 'decline' },
			state: ElicitationState.Rejected,
		});
	});

	test('cancels an empty form and hides its confirmation', async () => {
		pending = service.elicit(server, { chatSessionResource: model.sessionResource }, elicitation, cancellation.token);
		const part = model.getRequests()[0].response?.response.value[0];
		assert.ok(part instanceof ChatElicitationRequestPart);
		cancellation.cancel();
		const result = await pending;
		await part.accept(true);

		assert.deepStrictEqual({
			value: result.value,
			hidden: part.isHidden.get(),
			state: part.state.get(),
		}, {
			value: { action: 'cancel' },
			hidden: true,
			state: ElicitationState.Rejected,
		});
	});

	for (const inChat of [true, false]) {
		const location = inChat ? 'in chat' : 'without a chat session';
		test(`cancels a pre-cancelled empty form without showing UI ${location}`, async () => {
			const context: IMcpToolCallContext | undefined = inChat ? { chatSessionResource: model.sessionResource } : undefined;
			pending = service.elicit(server, context, elicitation, CancellationToken.Cancelled);
			const result = await pending;
			assert.deepStrictEqual({
				kind: result.kind,
				value: result.value,
				response: model.getRequests()[0].response?.response.value,
			}, {
				kind: ElicitationKind.Form,
				value: { action: 'cancel' },
				response: [],
			});
		});
	}

	test('keeps the notification fallback for an empty form outside chat', async () => {
		let notification: INotification | undefined;
		let quickPickDisposed = false;
		service = new McpElicitationService(
			upcastPartial<INotificationService>({
				notify: value => {
					notification = value;
					return new NoOpNotification();
				},
			}),
			upcastPartial<IQuickInputService>({
				createQuickPick: <T extends IQuickPickItem>() => upcastPartial<IQuickPick<T, { useSeparators: boolean }>>({
					dispose: () => { quickPickDisposed = true; },
					show: () => assert.fail('Unexpected quick pick'),
				}),
			}),
			upcastPartial<IChatService>({}),
			upcastPartial<IOpenerService>({}),
		);
		pending = service.elicit(server, undefined, elicitation, cancellation.token);
		assert.ok(notification);
		const respond = notification.actions?.primary?.[0];
		assert.ok(respond);
		await respond.run();

		assert.deepStrictEqual({
			message: notification.message,
			value: (await pending).value,
			quickPickDisposed,
			response: model.getRequests()[0].response?.response.value,
		}, {
			message: elicitation.message,
			value: { action: 'accept', content: {} },
			quickPickDisposed: true,
			response: [],
		});
	});

	test('keeps nonempty forms in the chat question carousel', async () => {
		pending = service.elicit(server, { chatSessionResource: model.sessionResource }, {
			...elicitation,
			requestedSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
		}, cancellation.token);
		const carousel = model.getRequests()[0].response?.response.value[0];
		assert.ok(carousel instanceof ChatQuestionCarouselData);
		await carousel.completion.complete({ answers: { [carousel.questions[0].id]: 'Alice' } });
		assert.deepStrictEqual((await pending).value, { action: 'accept', content: { name: 'Alice' } });
	});
});
