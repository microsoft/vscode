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
import { ChatSideChatSendResultKind, IChatSideChatProvider, IChatSideChatService } from '../../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { IChatModel, IChatRequestModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatRequestViewModel, IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { SessionsSideChatProviderContribution } from '../../browser/sideChatProvider.contribution.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ITransientSideChatService } from '../../browser/transientSideChatService.js';
import { ISideChatOrchestrationService, SideChatOrchestrationService } from '../../browser/sideChatOrchestration.js';

suite('SessionsSideChatProviderContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/source'), title: constObservable('Source Chat') });
	const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });

	function setup(options: {
		status?: SessionStatus;
		isArchived?: boolean;
		supportsSideChat?: boolean;
		hasTurn?: boolean;
		isSessionsWindow?: boolean;
		chat?: IChat;
		parentChat?: IChat;
		widget?: IChatWidget;
		widgetFactory?: (callOrder: string[]) => IChatWidget;
		widgetForResource?: (resource: URI, callOrder: string[]) => IChatWidget | undefined;
		onOpenChat?: (callOrder: string[]) => void;
		presentTransiently?: boolean;
		sendError?: Error;
	} = {}) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		const chat = options.chat ?? sourceChat;
		const parentChat = options.parentChat ?? sourceChat;
		const activeChat = observableValue<IChat>(store, chat);

		const session = upcastPartial<IActiveSession>({
			sessionId: 'session',
			resource: URI.parse('test:///session'),
			status: constObservable(options.status ?? SessionStatus.Completed),
			isArchived: constObservable(options.isArchived ?? false),
			capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: options.supportsSideChat ?? true }),
			chats: constObservable([parentChat, chat]),
			activeChat,
		});

		let registered: IChatSideChatProvider | undefined;
		instantiationService.stub(IChatSideChatService, upcastPartial<IChatSideChatService>({
			registerProvider: provider => {
				registered = provider;
				return toDisposable(() => { registered = undefined; });
			},
		}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: () => upcastPartial<IChatModel>({
				getRequests: () => (options.hasTurn ?? true) ? [upcastPartial<IChatRequestModel>({ id: 'turn-1' })] : [],
			}),
		}));

		const callOrder: string[] = [];
		const sendOptions: ISendRequestOptions[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => {
				const resolvedChat = [parentChat, chat].find(candidate => extUri.isEqual(candidate.resource, resource));
				return resolvedChat ? { session, chat: resolvedChat } : undefined;
			},
			createSideChatInSession: async (_session, _sourceChat, turnId, selection) => {
				callOrder.push(`create:${turnId}:${selection?.text ?? ''}`);
				return sideChat;
			},
			sendRequest: async (_session, chat, requestOptions) => {
				callOrder.push(`send:${chat.resource.toString()}:${requestOptions.query}`);
				sendOptions.push(requestOptions);
				if (options.sendError) {
					throw options.sendError;
				}
			},
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			visibleSessions: constObservable([session]),
			activeSession: constObservable(session),
			openChat: async (_session, chatUri) => {
				callOrder.push(`open:${chatUri.toString()}`);
				activeChat.set(sideChat, undefined);
				options.onOpenChat?.(callOrder);
			},
		}));
		instantiationService.stub(ISessionsPartService, upcastPartial<ISessionsPartService>({
			getSessionView: () => upcastPartial<NonNullable<ReturnType<ISessionsPartService['getSessionView']>>>({
				splitChatToSide: resource => callOrder.push(`split:${resource.toString()}`),
			}),
		}));
		instantiationService.stub(ITransientSideChatService, upcastPartial<ITransientSideChatService>({
			show: async (_session, source, target, question) => {
				callOrder.push(`show:${source.resource.toString()}:${target.resource.toString()}:${question}`);
				return options.presentTransiently ?? false;
			},
			markFailed: resource => {
				callOrder.push(`failed:${resource.toString()}`);
				return true;
			},
		}));
		instantiationService.stub(ISideChatOrchestrationService, instantiationService.createInstance(SideChatOrchestrationService));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getWidgetBySessionResource: resource => options.widgetForResource?.(resource, callOrder) ?? options.widgetFactory?.(callOrder) ?? options.widget,
		}));
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({
			isSessionsWindow: options.isSessionsWindow ?? true,
		}));

		store.add(instantiationService.createInstance(SessionsSideChatProviderContribution));
		return { provider: () => registered, callOrder, sendOptions };
	}

	test('falls back to opening and splitting a side chat when no transient host is available', async () => {
		const { provider, callOrder, sendOptions } = setup();

		await provider()!.askInSideChat(sourceChat.resource, 'what about this?', { text: 'selected text' });

		assert.deepStrictEqual(callOrder, [
			'create:turn-1:selected text',
			`show:${sourceChat.resource.toString()}:${sideChat.resource.toString()}:what about this?`,
			`open:${sideChat.resource.toString()}`,
			`split:${sideChat.resource.toString()}`,
			`send:${sideChat.resource.toString()}:what about this?`,
		]);
		assert.strictEqual(sendOptions[0].preserveActiveChat, false);
	});

	test('presents a side chat transiently without changing visible navigation', async () => {
		const { provider, callOrder, sendOptions } = setup({ presentTransiently: true });

		await provider()!.askInSideChat(sourceChat.resource, 'what about this?', { text: 'selected text' });

		assert.deepStrictEqual(callOrder, [
			'create:turn-1:selected text',
			`show:${sourceChat.resource.toString()}:${sideChat.resource.toString()}:what about this?`,
			`send:${sideChat.resource.toString()}:what about this?`,
		]);
		assert.strictEqual(sendOptions[0].preserveActiveChat, true);
	});

	test('returns a handled failure when the transient card presents a send error', async () => {
		const { provider } = setup({ presentTransiently: true, sendError: new Error('send failed') });

		const result = await provider()!.askInSideChat(sourceChat.resource, 'what about this?');

		assert.deepStrictEqual({
			kind: result.kind,
			error: result.kind === ChatSideChatSendResultKind.FailedAndPresented && result.error instanceof Error ? result.error.message : undefined,
		}, {
			kind: ChatSideChatSendResultKind.FailedAndPresented,
			error: 'send failed',
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
		}, {
			supported: true,
			unknownChat: false,
			untitled: false,
			archived: false,
			noSideChatSupport: false,
			noTurnYet: false,
		});
	});

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

	test('reveals through the source widget when the side chat is embedded', async () => {
		const revealed: string[] = [];
		const request = upcastPartial<IChatRequestViewModel>({ id: 'turn-1', message: { parts: [], text: '' } });
		const chat = upcastPartial<IChat>({
			resource: sideChat.resource,
			origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: 'turn-1' },
		});
		const sourceWidget = upcastPartial<IChatWidget>({
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: sourceChat.resource, getItems: () => [request] }),
			onDidChangeViewModel: Event.None,
			reveal: () => revealed.push('source'),
		});
		const embeddedWidget = upcastPartial<IChatWidget>({
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: sideChat.resource, getItems: () => [] }),
			onDidChangeViewModel: Event.None,
			reveal: () => revealed.push('embedded'),
		});
		const { provider, callOrder } = setup({
			chat,
			widgetForResource: resource => extUri.isEqual(resource, sourceChat.resource) ? sourceWidget : embeddedWidget,
		});

		await provider()!.revealSideChatSource(sideChat.resource);

		assert.deepStrictEqual({ callOrder, revealed }, {
			callOrder: [`open:${sourceChat.resource.toString()}`],
			revealed: ['source'],
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
