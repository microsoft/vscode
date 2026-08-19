/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSideChatSendResultKind } from '../../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { IChatModel, IChatRequestModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatSlashCallback, IChatSlashCommandService, IChatSlashData } from '../../../../../workbench/contrib/chat/common/participants/chatSlashCommands.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { BtwSlashCommandContribution } from '../../browser/btwSlashCommand.contribution.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ITransientSideChatService } from '../../browser/transientSideChatService.js';
import { ISideChatOrchestrationService, SideChatOrchestrationService, SideChatPresentation } from '../../browser/sideChatOrchestration.js';

suite('BtwSlashCommandContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class RecordingNotificationService extends TestNotificationService {
		readonly errors: string[] = [];

		override error(error: string | Error) {
			this.errors.push(error instanceof Error ? error.message : error);
			return super.error(error);
		}
	}

	test('opens the created side chat through the control path before sending attached context', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		let registered: { data: IChatSlashData; callback: IChatSlashCallback } | undefined;
		instantiationService.stub(IChatSlashCommandService, {
			_serviceBrand: undefined,
			onDidChangeCommands: Event.None,
			registerSlashCommand: (data, callback) => {
				registered = { data, callback };
				return toDisposable(() => undefined);
			},
			executeCommand: async () => undefined,
			getCommands: () => [],
			hasCommand: () => false,
		});
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: true }));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: () => upcastPartial<IChatModel>({ getRequests: () => [upcastPartial<IChatRequestModel>({ id: 'turn-1' })] }),
		}));
		const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/source') });
		const targetDocument = dom.getActiveDocument();
		const widgetDomNode = targetDocument.createElement('div');
		const transcriptNode = targetDocument.createElement('div');
		transcriptNode.textContent = '  selected text  ';
		widgetDomNode.appendChild(transcriptNode);
		targetDocument.body.appendChild(widgetDomNode);
		const targetWindow = dom.getWindow(widgetDomNode);
		const originalGetSelection = targetWindow.getSelection.bind(targetWindow);
		const mutableWindow = targetWindow as typeof targetWindow & { getSelection: () => Selection | null };
		mutableWindow.getSelection = () => ({
			toString: () => '  selected text  ',
			anchorNode: transcriptNode.firstChild,
			focusNode: transcriptNode.firstChild,
			rangeCount: 1,
		} as Selection);
		store.add(toDisposable(() => {
			(mutableWindow as typeof mutableWindow & { getSelection: typeof originalGetSelection }).getSelection = originalGetSelection;
			widgetDomNode.remove();
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getWidgetBySessionResource: resource => resource.toString() === sourceChat.resource.toString()
				? upcastPartial<IChatWidget>({
					domNode: widgetDomNode,
					inputEditor: { getDomNode: () => null } as ICodeEditor,
				})
				: undefined,
		}));
		const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			resource: URI.parse('test:///session'),
			status: constObservable(SessionStatus.Completed),
			isArchived: constObservable(false),
			capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }),
		});
		const callOrder: string[] = [];
		let createArgs: { selection?: { text: string } } | undefined;
		let sendOptions: ISendRequestOptions | undefined;
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => resource.toString() === sourceChat.resource.toString() ? { session, chat: sourceChat } : undefined,
			createSideChatInSession: async (_session, _sourceChat, _turnId, selection) => {
				createArgs = { selection };
				callOrder.push('create');
				return sideChat;
			},
			sendRequest: async (_session, chat, options) => {
				callOrder.push(`send:${chat.resource.toString()}:${options.query}`);
				sendOptions = options;
			},
		}));
		const activeChat = observableValue<IChat>('test.activeChat', sourceChat);
		const activeSession = upcastPartial<IActiveSession>({ ...session, activeChat });
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			activeSession: constObservable(activeSession),
			openChat: async (_session, chatUri) => {
				callOrder.push(`open:${chatUri.toString()}`);
				activeChat.set(sideChat, undefined);
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
				return false;
			},
		}));
		instantiationService.stub(ISideChatOrchestrationService, instantiationService.createInstance(SideChatOrchestrationService));
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(ILogService, new NullLogService());

		const contribution = instantiationService.createInstance(BtwSlashCommandContribution);
		store.add(contribution);

		assert.ok(registered);
		assert.strictEqual(registered.data.executeDuringRequest, true);
		const pastedText = toPasteVariableEntry('Pasted text #1', 'Long pasted text');

		await registered.callback(
			'what about this?',
			{ report: () => undefined },
			[],
			ChatAgentLocation.Chat,
			sourceChat.resource,
			CancellationToken.None,
			{ attachedContext: [pastedText] },
		);

		assert.deepStrictEqual(callOrder, [
			'create',
			`show:${sourceChat.resource.toString()}:${sideChat.resource.toString()}:what about this?`,
			`open:${sideChat.resource.toString()}`,
			`split:${sideChat.resource.toString()}`,
			`send:${sideChat.resource.toString()}:what about this?`,
		]);
		assert.deepStrictEqual(createArgs, { selection: { text: '  selected text  ' } });
		assert.deepStrictEqual({
			attachedContext: sendOptions?.attachedContext,
			preserveActiveChat: sendOptions?.preserveActiveChat,
		}, {
			attachedContext: [pastedText],
			preserveActiveChat: false,
		});
	});

	test('uses the transient failure card without an additional error notification', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		let callback: IChatSlashCallback | undefined;
		instantiationService.stub(IChatSlashCommandService, {
			_serviceBrand: undefined,
			onDidChangeCommands: Event.None,
			registerSlashCommand: (_data, registeredCallback) => {
				callback = registeredCallback;
				return toDisposable(() => undefined);
			},
			executeCommand: async () => undefined,
			getCommands: () => [],
			hasCommand: () => false,
		});
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: true }));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: () => upcastPartial<IChatModel>({ getRequests: () => [upcastPartial<IChatRequestModel>({ id: 'turn-1' })] }),
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: () => undefined }));
		const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/source') });
		const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			status: constObservable(SessionStatus.Completed),
			isArchived: constObservable(false),
			capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }),
		});
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: () => ({ session, chat: sourceChat }),
			createSideChatInSession: async () => sideChat,
		}));
		instantiationService.stub(ISideChatOrchestrationService, upcastPartial<ISideChatOrchestrationService>({
			prepare: async () => ({
				sideChat,
				presentation: SideChatPresentation.Transient,
				send: async () => ({ kind: ChatSideChatSendResultKind.FailedAndPresented, error: new Error('send failed') }),
			}),
		}));
		const notificationService = new RecordingNotificationService();
		instantiationService.stub(INotificationService, notificationService);
		instantiationService.stub(ILogService, new NullLogService());
		store.add(instantiationService.createInstance(BtwSlashCommandContribution));
		assert.ok(callback);

		await callback('question', { report: () => undefined }, [], ChatAgentLocation.Chat, sourceChat.resource, CancellationToken.None, undefined);

		assert.deepStrictEqual(notificationService.errors, []);
	});

	test('notifies when the full-chat send fails', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		let callback: IChatSlashCallback | undefined;
		instantiationService.stub(IChatSlashCommandService, {
			_serviceBrand: undefined,
			onDidChangeCommands: Event.None,
			registerSlashCommand: (_data, registeredCallback) => {
				callback = registeredCallback;
				return toDisposable(() => undefined);
			},
			executeCommand: async () => undefined,
			getCommands: () => [],
			hasCommand: () => false,
		});
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: true }));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: () => upcastPartial<IChatModel>({ getRequests: () => [upcastPartial<IChatRequestModel>({ id: 'turn-1' })] }),
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: () => undefined }));
		const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/source') });
		const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			status: constObservable(SessionStatus.Completed),
			isArchived: constObservable(false),
			capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }),
		});
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: () => ({ session, chat: sourceChat }),
			createSideChatInSession: async () => sideChat,
		}));
		instantiationService.stub(ISideChatOrchestrationService, upcastPartial<ISideChatOrchestrationService>({
			prepare: async () => ({
				sideChat,
				presentation: SideChatPresentation.Full,
				send: async () => { throw new Error('send failed'); },
			}),
		}));
		const notificationService = new RecordingNotificationService();
		instantiationService.stub(INotificationService, notificationService);
		instantiationService.stub(ILogService, new NullLogService());
		store.add(instantiationService.createInstance(BtwSlashCommandContribution));
		assert.ok(callback);

		await callback('question', { report: () => undefined }, [], ChatAgentLocation.Chat, sourceChat.resource, CancellationToken.None, undefined);

		assert.deepStrictEqual(notificationService.errors, ['The side question could not be answered.']);
	});
});
