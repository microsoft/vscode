/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSideChatService } from '../../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatModel, IChatRequestModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatRequestViewModel, IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { SessionsSideChatProviderContribution } from '../../browser/sideChatProvider.contribution.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, ChatOriginKind, IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

suite('SessionsSideChatProviderContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/source'), title: constObservable('Source Chat'), interactivity: constObservable(ChatInteractivity.Full) });
	const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });

	function setup(options: {
		status?: SessionStatus;
		isArchived?: boolean;
		supportsSideChat?: boolean;
		hasTurn?: boolean;
		sourceTurnIds?: string[];
		readOnly?: boolean;
		fail?: 'create' | 'open' | 'send';
		isSessionsWindow?: boolean;
		chat?: IChat;
		parentChat?: IChat;
		widget?: IChatWidget;
		widgetFactory?: (callOrder: string[]) => IChatWidget;
		onOpenChat?: (callOrder: string[]) => void;
	} = {}) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		const chat = options.chat ?? sourceChat;
		const parentChat = options.parentChat ?? sourceChat;

		const session = upcastPartial<IActiveSession>({
			sessionId: 'session',
			resource: URI.parse('test:///session'),
			status: constObservable(options.status ?? SessionStatus.Completed),
			isArchived: constObservable(options.isArchived ?? false),
			capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: options.supportsSideChat ?? true }),
			chats: constObservable([parentChat, chat]),
		});

		let registered: SessionsSideChatProviderContribution | undefined;
		instantiationService.stub(IChatSideChatService, upcastPartial<IChatSideChatService>({
			registerProvider: provider => {
				assert.ok(provider instanceof SessionsSideChatProviderContribution);
				registered = provider;
				return toDisposable(() => { registered = undefined; });
			},
		}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: () => upcastPartial<IChatModel>({
				isReadOnly: constObservable(!!options.readOnly),
				getRequests: () => (options.hasTurn ?? true) ? (options.sourceTurnIds ?? ['turn-1']).map(id => upcastPartial<IChatRequestModel>({ id })) : [],
			}),
		}));

		const callOrder: string[] = [];
		const requests: ISendRequestOptions[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => {
				const resolvedChat = [chat, parentChat].find(candidate => extUri.isEqual(candidate.resource, resource));
				return resolvedChat ? { session, chat: resolvedChat } : undefined;
			},
			createSideChatInSession: async (_session, _sourceChat, turnId, selection) => {
				callOrder.push(`create:${turnId}:${selection?.text ?? ''}`);
				if (options.fail === 'create') {
					throw new Error('Create failed');
				}
				return sideChat;
			},
			sendRequest: async (_session, chat, requestOptions) => {
				callOrder.push(`send:${chat.resource.toString()}:${requestOptions.query}`);
				requests.push(requestOptions);
				if (options.fail === 'send') {
					throw new Error('Send failed');
				}
			},
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			visibleSessions: constObservable([session]),
			openChat: async (_session, chatUri) => {
				callOrder.push(`open:${chatUri.toString()}`);
				if (options.fail === 'open') {
					throw new Error('Open failed');
				}
				options.onOpenChat?.(callOrder);
			},
		}));
		instantiationService.stub(ISessionsPartService, upcastPartial<ISessionsPartService>({
			getSessionView: () => upcastPartial<NonNullable<ReturnType<ISessionsPartService['getSessionView']>>>({
				splitChatToSide: resource => { callOrder.push(`split:${resource.toString()}`); },
			}),
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getWidgetBySessionResource: () => options.widgetFactory?.(callOrder) ?? options.widget,
		}));
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({
			isSessionsWindow: options.isSessionsWindow ?? true,
		}));

		store.add(instantiationService.createInstance(SessionsSideChatProviderContribution));
		return { provider: () => registered, callOrder, requests };
	}

	test('registers a provider that branches, opens, then sends on the side chat', async () => {
		const { provider, callOrder, requests } = setup();
		const attachedContext = [toPasteVariableEntry('Pasted text #1', 'Long pasted text')];

		await provider()!.askInSideChat(sourceChat.resource, 'what about this?', { text: 'selected text' }, { attachedContext });

		assert.deepStrictEqual({ callOrder, requests }, {
			callOrder: [
				'create:turn-1:selected text',
				`open:${sideChat.resource.toString()}`,
				`split:${sideChat.resource.toString()}`,
				`send:${sideChat.resource.toString()}:what about this?`,
			],
			requests: [{ query: 'what about this?', attachedContext }],
		});
	});

	test('reports capability only for conversations that can actually branch', () => {
		const capability = (options: Parameters<typeof setup>[0]) => {
			const { provider } = setup(options);
			return provider()!.canAskInSideChat(sourceChat.resource);
		};

		assert.deepStrictEqual({
			supported: capability({}),
			unknownChat: (() => setup({}).provider()!.canAskInSideChat(URI.parse('test:///chat/other')))(),
			untitled: capability({ status: SessionStatus.Untitled }),
			archived: capability({ isArchived: true }),
			noSideChatSupport: capability({ supportsSideChat: false }),
			noTurnYet: capability({ hasTurn: false }),
			readOnly: capability({ readOnly: true }),
			nonInteractive: capability({ chat: upcastPartial<IChat>({ ...sourceChat, interactivity: constObservable(ChatInteractivity.ReadOnly) }) }),
		}, {
			supported: true,
			unknownChat: false,
			untitled: false,
			archived: false,
			noSideChatSupport: false,
			noTurnYet: false,
			readOnly: false,
			nonInteractive: false,
		});
	});

	test('branches from an explicitly selected older turn', async () => {
		const harness = setup({ sourceTurnIds: ['older-turn', 'latest-turn'] });
		await harness.provider()!.askInSideChat(sourceChat.resource, 'Explain this', { text: 'Older response' }, { sourceTurnId: 'older-turn' });
		assert.deepStrictEqual(harness.callOrder[0], 'create:older-turn:Older response');
	});

	test('rejects a missing selected turn rather than branching from the latest turn', async () => {
		const harness = setup();
		await assert.rejects(harness.provider()!.askInSideChat(sourceChat.resource, 'Explain this', undefined, { sourceTurnId: 'missing-turn' }));
		assert.deepStrictEqual(harness.callOrder, []);
	});

	for (const fail of ['create', 'open', 'send'] as const) {
		test(`propagates ${fail} failures to the shared caller`, async () => {
			const { provider, callOrder } = setup({ fail });
			await assert.rejects(provider()!.askInSideChat(sourceChat.resource, 'question'), new RegExp(`${fail}`, 'i'));
			assert.strictEqual(callOrder.length, fail === 'create' ? 1 : fail === 'open' ? 2 : 4);
		});
	}

	test('does not register outside the Agents window', () => {
		const { provider } = setup({ isSessionsWindow: false });

		assert.strictEqual(provider(), undefined);
	});

	test('observes the source metadata for a side chat', () => {
		const parentChat = upcastPartial<IChat>({
			resource: sourceChat.resource,
			title: constObservable('Source Chat'),
		});
		const chat = upcastPartial<IChat>({
			resource: sideChat.resource,
			origin: {
				kind: ChatOriginKind.SideChat,
				parentChat: sourceChat.resource,
				turnId: 'turn-1',
				selection: { text: 'selected text' },
			},
		});
		const { provider } = setup({ chat, parentChat });

		assert.deepStrictEqual(provider()!.observeSideChatOrigin(sideChat.resource).get(), {
			sourceSessionResource: sourceChat.resource,
			sourceTurnId: 'turn-1',
			sourceTitle: 'Source Chat',
			selection: { text: 'selected text' },
		});
	});

	test('returns undefined for chats without a complete side-chat origin', () => {
		const origin = (chat: IChat) => setup({ chat }).provider()!.observeSideChatOrigin(sideChat.resource).get();

		assert.deepStrictEqual({
			noOrigin: origin(upcastPartial<IChat>({ resource: sideChat.resource })),
			user: origin(upcastPartial<IChat>({ resource: sideChat.resource, origin: { kind: ChatOriginKind.User } })),
			tool: origin(upcastPartial<IChat>({ resource: sideChat.resource, origin: { kind: ChatOriginKind.Tool } })),
			missingTurn: origin(upcastPartial<IChat>({ resource: sideChat.resource, origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource } })),
		}, {
			noOrigin: undefined,
			user: undefined,
			tool: undefined,
			missingTurn: undefined,
		});
	});

	test('observes a side chat without a selection', () => {
		const chat = upcastPartial<IChat>({
			resource: sideChat.resource,
			origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: 'turn-1' },
		});
		const { provider } = setup({ chat });

		assert.deepStrictEqual(provider()!.observeSideChatOrigin(sideChat.resource).get(), {
			sourceSessionResource: sourceChat.resource,
			sourceTurnId: 'turn-1',
			sourceTitle: 'Source Chat',
			selection: undefined,
		});
	});

	test('reacts to source title changes', () => {
		const title = observableValue('sourceTitle', 'Original Title');
		const parentChat = upcastPartial<IChat>({ resource: sourceChat.resource, title });
		const chat = upcastPartial<IChat>({
			resource: sideChat.resource,
			origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: 'turn-1' },
		});
		const { provider } = setup({ chat, parentChat });
		const origin = provider()!.observeSideChatOrigin(sideChat.resource);

		const before = origin.get();
		title.set('Renamed Title', undefined);

		assert.deepStrictEqual([before?.sourceTitle, origin.get()?.sourceTitle], ['Original Title', 'Renamed Title']);
	});

	test('reveals the request a side chat branched from', async () => {
		const revealed: ChatTreeItem[] = [];
		const request = upcastPartial<IChatRequestViewModel>({ id: 'turn-1', message: { parts: [], text: '' } });
		const chat = upcastPartial<IChat>({
			resource: sideChat.resource,
			origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: 'turn-1' },
		});
		const { provider, callOrder } = setup({
			chat,
			widgetFactory: callOrder => upcastPartial<IChatWidget>({
				viewModel: upcastPartial<IChatViewModel>({ sessionResource: sourceChat.resource, getItems: () => [request] }),
				onDidChangeViewModel: Event.None,
				reveal: item => {
					callOrder.push(`reveal:${item.id}`);
					revealed.push(item);
				},
			}),
		});

		await provider()!.revealSideChatSource(sideChat.resource);

		assert.deepStrictEqual({ callOrder, revealed }, {
			callOrder: [`open:${sourceChat.resource.toString()}`, 'reveal:turn-1'],
			revealed: [request],
		});
	});

	test('reveals the request a side chat branched from after its widget view model changes', async () => {
		const store = disposables.add(new DisposableStore());
		const onDidChangeViewModel = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const revealed: ChatTreeItem[] = [];
		const request = upcastPartial<IChatRequestViewModel>({ id: 'turn-1', message: { parts: [], text: '' } });
		const chat = upcastPartial<IChat>({
			resource: sideChat.resource,
			origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: 'turn-1' },
		});
		let viewModel = upcastPartial<IChatViewModel>({ sessionResource: sideChat.resource, getItems: () => [] });
		const widget = upcastPartial<IChatWidget>({
			get viewModel() { return viewModel; },
			onDidChangeViewModel: onDidChangeViewModel.event,
			reveal: item => {
				callOrder.push(`reveal:${item.id}`);
				revealed.push(item);
			},
		});
		const { provider, callOrder } = setup({
			chat,
			widget,
			onOpenChat: () => {
				void timeout(0).then(() => {
					viewModel = upcastPartial<IChatViewModel>({ sessionResource: sourceChat.resource, getItems: () => [request] });
					onDidChangeViewModel.fire({ previousSessionResource: sideChat.resource, currentSessionResource: sourceChat.resource });
				});
			},
		});

		await provider()!.revealSideChatSource(sideChat.resource);

		assert.deepStrictEqual({ callOrder, revealed }, {
			callOrder: [`open:${sourceChat.resource.toString()}`, 'reveal:turn-1'],
			revealed: [request],
		});
	});

	test('does not reveal a source when its widget view model does not change', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const revealed: ChatTreeItem[] = [];
		const chat = upcastPartial<IChat>({
			resource: sideChat.resource,
			origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: 'turn-1' },
		});
		const widget = upcastPartial<IChatWidget>({
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: sideChat.resource, getItems: () => [] }),
			onDidChangeViewModel: Event.None,
			reveal: item => { revealed.push(item); },
		});
		const { provider, callOrder } = setup({ chat, widget });

		await provider()!.revealSideChatSource(sideChat.resource);

		assert.deepStrictEqual({ callOrder, revealed }, {
			callOrder: [`open:${sourceChat.resource.toString()}`],
			revealed: [],
		});
	}));

	test('does not reveal a source for a non-side chat', async () => {
		const revealed: ChatTreeItem[] = [];
		const widget = upcastPartial<IChatWidget>({
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: sourceChat.resource, getItems: () => [] }),
			onDidChangeViewModel: Event.None,
			reveal: item => { revealed.push(item); },
		});
		const { provider, callOrder } = setup({ chat: upcastPartial<IChat>({ resource: sideChat.resource }), widget });

		await provider()!.revealSideChatSource(sideChat.resource);

		assert.deepStrictEqual({ callOrder, revealed }, { callOrder: [], revealed: [] });
	});
});
