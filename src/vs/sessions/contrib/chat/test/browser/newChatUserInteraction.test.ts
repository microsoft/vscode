/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationError, errorHandler } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatUserInteractionTimingResult } from '../../../../../workbench/contrib/chat/browser/chatUserInteractionTelemetry.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatSendResult, IChatSendRequestData, IChatSendRequestOptions, IChatToolInvocation } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatServiceImpl.js';
import { IChatResponseModel, serializeSendOptions } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ToolInvocationPresentation } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { createChatUserInteractionTestHarness } from '../../../../../workbench/contrib/chat/test/browser/chatUserInteractionTestUtils.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { INewChatInputSendRequest, NewChatInputWidget } from '../../browser/newChatInput.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NewChatUserInteraction } from '../../browser/newChatUserInteraction.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';

suite('Sessions - New chat user-perceived TTFP', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(newSession = true) {
		const h = createChatUserInteractionTestHarness(disposables);
		const sourceVisible = observableValue('sourceVisible', true);
		const hostVisible = observableValue('hostVisible', true);
		const chat = upcastPartial<IChat>({ resource: URI.parse('test-chat:/first') });
		const activeChat = observableValue('activeChat', chat);
		const preparing = observableValue('preparing', newSession);
		const session = upcastPartial<IActiveSession>({
			sessionId: 'source-session', resource: URI.parse('test-session:/source'), providerId: 'test', sessionType: 'test-chat',
			status: constObservable(newSession ? SessionStatus.Untitled : SessionStatus.Completed),
			mainChat: constObservable(chat), activeChat, isNewSessionRequestInProgress: preparing,
		});
		const visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', [session]);
		const replaced = disposables.add(new Emitter<{ from: ISession; to: ISession }>());
		const replacedDraft = disposables.add(new Emitter<{ from: ISession; to: ISession }>());
		h.instantiationService.stub(ISessionsManagementService, { onDidReplaceSession: replaced.event, onDidReplaceNewDraftSession: replacedDraft.event });
		h.instantiationService.stub(ISessionsService, { visibleSessions });
		const added = disposables.add(new Emitter<IChatWidget>());
		const removed = disposables.add(new Emitter<IChatWidget>());
		const widgets: IChatWidget[] = [];
		h.instantiationService.stub(IChatWidgetService, { onDidAddWidget: added.event, onDidRemoveWidget: removed.event, getAllWidgets: () => widgets });
		const source = { window: h.window, visible: sourceVisible, hostVisible };
		return {
			...h, session, chat, activeChat, preparing, visibleSessions, replaced, replacedDraft, sourceVisible, hostVisible,
			createInteraction: () => h.instantiationService.createInstance(NewChatUserInteraction, source),
			createResponse: (resource = chat.resource, properties: Partial<IChatResponseModel> = {}) => h.createResponse(resource, properties),
			addWidget: (response?: IChatResponseModel, progressActive = false) => {
				const view = h.createWidget(response, progressActive);
				widgets.push(view.widget);
				added.fire(view.widget);
				return {
					...view,
					finishPreparation: () => { view.finishPreparation(); preparing.set(false, undefined); },
					remove: () => { widgets.splice(widgets.indexOf(view.widget), 1); removed.fire(view.widget); },
				};
			},
			assertFinished: (...results: ChatUserInteractionTimingResult[]) => {
				h.assertFinished(...results);
				assert.strictEqual([added, removed, replaced, replacedDraft].some(emitter => emitter.hasListeners()), false);
			},
		};
	}

	function createInput(h: ReturnType<typeof createHarness>, sendRequest: (request: INewChatInputSendRequest) => Promise<boolean>, tryHandle: () => Promise<boolean> = async () => false) {
		let query = 'test request';
		const sourceOwner = disposables.add(new MutableDisposable());
		const input: NewChatInputWidget = Object.assign(Object.create(NewChatInputWidget.prototype), {
			_editorContainer: h.element,
			_editor: { getModel: () => ({ getValue: () => query, setValue: (value: string) => { query = value; } }), updateOptions: () => { } },
			_sending: false,
			_userInteractionSource: sourceOwner,
			_canSendRequest: constObservable(true),
			_contextAttachments: { attachments: [], clear: () => { } },
			options: { session: constObservable(h.session), inputVisible: h.sourceVisible, hostVisible: h.hostVisible, sendRequest },
			instantiationService: h.instantiationService,
			chatSubmitRequestHandlerService: { tryHandle },
			chatInputNotificationService: { handleMessageSent: () => { } },
			logService: { error: () => { } },
			_getNotificationContext: () => ({}),
			_clearDraftState: () => { },
			_updateDraftState: () => { },
			_updateSendButtonState: () => { },
			_updateInputLoadingState: () => { },
		});
		return { input, sourceOwner };
	}

	function createSend(h: ReturnType<typeof createHarness>, newSession: boolean, dispatch: (options: ISendRequestOptions) => Promise<void>) {
		type Send = (query: string, attachments?: IChatRequestVariableEntry[], background?: boolean, interaction?: NewChatUserInteraction) => Promise<boolean>;
		const owner = {
			send: Reflect.get(newSession ? NewChatWidget.prototype : NewChatInSessionWidget.prototype, '_send') as Send,
			_session: constObservable(h.session),
			_feedbackItems: constObservable([]),
			_isQuickChatComposer: constObservable(false),
			_workspacePicker: { clearAttachedContext: () => { }, showPicker: () => { } },
			_pendingBackgroundSends: { set: () => { }, deleteAndDispose: () => { } },
			agentFeedbackService: { removeFeedback: () => { } },
			_getWorkspaceRoots: () => [],
			newSessionComposerService: { notifyWillSendRequest: () => { } },
			sessionsManagementService: {
				sendNewChatRequest: (_session: ISession, options: ISendRequestOptions) => dispatch(options),
				sendRequest: (_session: ISession, _chat: IChat, options: ISendRequestOptions) => dispatch(options),
			},
			notificationService: { error: () => { } },
			logService: { error: () => { } },
		};
		return (request: INewChatInputSendRequest) => owner.send(request.query, request.attachments, request.background, request.userInteraction);
	}

	for (const newSession of [true, false]) {
		test(`${newSession ? 'new-session' : 'peer-chat'} queued responses are excluded even when they later make progress`, async () => {
			const h = createHarness(newSession);
			let sentOptions: ISendRequestOptions | undefined;
			const { input } = createInput(h, createSend(h, newSession, async options => {
				sentOptions = options;
				options.onDidCreateResponse?.(undefined, 'queued');
			}));
			assert.strictEqual(await input.submit(), true);
			const response = h.createResponse();
			sentOptions?.onDidCreateResponse?.(response.response, 'sent');
			h.addWidget(response.response);
			response.progress();
			h.frame(2);
			assert.deepStrictEqual([h.events[0].data.timeToFirstProgress, h.events[0].data.firstProgressKind], [undefined, undefined]);
			h.assertFinished('queued');
		});

		test(`${newSession ? 'new session' : 'peer chat'} preserves the gesture through preparation and exact-response handoff`, async () => {
			const h = createHarness(newSession);
			const handler = new DeferredPromise<boolean>();
			const provider = new DeferredPromise<void>();
			let sentOptions: ISendRequestOptions | undefined;
			const { input, sourceOwner } = createInput(h, createSend(h, newSession, async options => {
				sentOptions = options;
				await provider.p;
			}), () => handler.p);
			const send = input.submit();
			assert.deepStrictEqual({ started: h.starts.length, sent: sentOptions }, { started: 1, sent: undefined });
			const id = h.starts[0];
			h.setTime(175);
			await handler.complete(false);
			await Promise.resolve();
			const unrelated = h.createResponse();
			h.addWidget(unrelated.response);
			unrelated.progress();
			const response = h.createResponse();
			sentOptions!.onDidCreateResponse!(response.response);
			sentOptions!.onDidCreateResponse!(unrelated.response);
			sourceOwner.dispose();
			h.sourceVisible.set(false, undefined);
			const widget = h.addWidget();
			response.progress([{ kind: 'thinking', value: [' ', '\n'] }]);
			widget.bind(response.response);
			assert.strictEqual(h.frames.size, 0);
			response.progress([{ kind: 'thinking', value: 'Reasoning' }]);
			h.frame();
			assert.strictEqual(h.events.length, 0);
			h.setTime(350);
			h.frame();
			await provider.complete();
			assert.deepStrictEqual({ sent: await send, starts: h.starts, duration: h.events[0].data.timeToFirstProgress, request: h.events[0].data.requestId }, {
				sent: true, starts: [id], duration: 250, request: response.response.requestId,
			});
			h.assertFinished('success');
			response.progress();
			assert.strictEqual(response.response.isComplete, false);
		});

		test(`${newSession ? 'new session' : 'peer chat'} provider errors clean up the original measurement`, async () => {
			const h = createHarness(newSession);
			const { input } = createInput(h, createSend(h, newSession, async () => { throw new Error('dispatch failed'); }));
			assert.deepStrictEqual({ sent: await input.submit(), starts: h.starts.length }, { sent: false, starts: 1 });
			h.assertFinished('error');
		});
	}

	for (const replacement of ['replaced', 'replacedDraft'] as const) {
		test(`${replacement} and response-widget replacement preserve the timestamp`, async () => {
			const h = createHarness();
			const interaction = h.createInteraction();
			interaction.handoff(h.session, h.chat);
			h.sourceVisible.set(false, undefined);
			interaction.disposeSource();
			const resource = URI.parse('test-chat:/prepared');
			const chat = upcastPartial<IChat>({ resource });
			const prepared = { ...h.session, sessionId: 'prepared', mainChat: constObservable(chat), activeChat: constObservable(chat) };
			h.visibleSessions.set([prepared], undefined);
			h[replacement].fire({ from: h.session, to: prepared });
			await Promise.resolve();
			const response = h.createResponse(resource);
			interaction.onDidCreateResponse(response.response);
			const preparingWidget = h.addWidget(response.response);
			h.setTime(150);
			response.progress();
			h.frame();
			preparingWidget.remove();
			assert.strictEqual(h.frames.size, 0);
			h.addWidget(response.response);
			h.setTime(180);
			h.frame(2);
			assert.deepStrictEqual([h.starts, interaction.timer.startedAt, h.events[0].data.timeToFirstProgress], [[interaction.timer.id], 100, 80]);
			h.assertFinished('success');
		});
	}

	test('background composer submissions do not start a measurement', async () => {
		const h = createHarness();
		let sent: INewChatInputSendRequest | undefined;
		const { input } = createInput(h, async request => { sent = request; return true; });
		assert.deepStrictEqual({ sent: await input.submit(true), interaction: sent?.userInteraction, starts: h.starts.length }, {
			sent: true, interaction: undefined, starts: 0,
		});
		h.assertFinished();
	});

	for (const initial of [true, false]) {
		test(`${initial ? 'initially hidden' : 'hidden during submit preparation'} sends but never attaches late observers`, async () => {
			const h = createHarness();
			const handler = new DeferredPromise<boolean>();
			let requests = 0;
			h.sourceVisible.set(!initial, undefined);
			const { input } = createInput(h, createSend(h, true, async options => {
				requests++;
				const response = h.createResponse();
				options.onDidCreateResponse?.(response.response);
				h.addWidget(response.response);
				response.progress();
			}), () => handler.p);
			const send = input.submit();
			h.sourceVisible.set(false, undefined);
			h.sourceVisible.set(true, undefined);
			await handler.complete(false);
			assert.deepStrictEqual({ sent: await send, requests }, { sent: true, requests: 1 });
			h.assertFinished('hidden');
		});
	}

	for (const change of ['document', 'host', 'widget', 'focus only'] as const) {
		test(`${change} visibility during render is continuous, not dependent on focus`, () => {
			const h = createHarness(false);
			const interaction = h.createInteraction();
			interaction.handoff(h.session, h.chat);
			interaction.disposeSource();
			const response = h.createResponse();
			interaction.onDidCreateResponse(response.response);
			const widget = h.addWidget(response.response);
			h.blur();
			response.progress();
			h.frame();
			assert.strictEqual(h.events.length, 0);
			if (change === 'document') {
				h.setDocumentVisible(false);
				h.setDocumentVisible(true);
			} else if (change === 'host') {
				h.hostVisible.set(false, undefined);
				h.hostVisible.set(true, undefined);
			} else if (change === 'widget') {
				widget.hide();
				widget.show();
			}
			h.frame(2);
			assert.strictEqual(h.events[0].data.windowFocused, false);
			h.assertFinished(change === 'focus only' ? 'success' : 'hidden');
		});
	}

	for (const destination of [false, true]) {
		test(`hiding ${destination ? 'the destination before response creation' : 'during the response-view gap'} never resumes`, async () => {
			const h = createHarness(false);
			const interaction = h.createInteraction();
			interaction.handoff(h.session, h.chat);
			interaction.disposeSource();
			const response = h.createResponse();
			if (destination) {
				const widget = h.addWidget(response.response);
				widget.hide();
				widget.show();
			} else {
				h.activeChat.set(upcastPartial<IChat>({ resource: URI.parse('test-chat:/other') }), undefined);
				await Promise.resolve();
				h.activeChat.set(h.chat, undefined);
			}
			interaction.onDidCreateResponse(response.response);
			h.addWidget(response.response);
			response.progress();
			h.frame(2);
			h.assertFinished('hidden');
		});
	}

	test('preparation UI is not counted as rendered response content', async () => {
		const h = createHarness();
		const interaction = h.createInteraction();
		interaction.handoff(h.session, h.chat);
		h.sourceVisible.set(false, undefined);
		const response = h.createResponse();
		interaction.onDidCreateResponse(response.response);
		const widget = h.addWidget(response.response, true);
		response.progress();
		assert.strictEqual(h.frames.size, 0);
		widget.finishPreparation();
		await Promise.resolve();
		h.frame(2);
		h.assertFinished('success');
	});

	for (const outcome of ['notDispatched', 'hidden response', 'cancelled', 'error', 'completedWithoutProgress'] as const) {
		test(`cleans up ${outcome} without claiming visible progress`, () => {
			const h = createHarness();
			const interaction = h.createInteraction();
			interaction.handoff(h.session, h.chat);
			const response = h.createResponse(undefined, { isHiddenFromTranscript: outcome === 'hidden response' });
			interaction.onDidCreateResponse(outcome === 'notDispatched' ? undefined : response.response);
			response.complete(outcome === 'cancelled' || outcome === 'error' ? outcome : undefined);
			assert.strictEqual(interaction.timer.isActive, false);
			h.assertFinished(outcome === 'hidden response' ? 'notDispatched' : outcome);
		});
	}

	for (const [outcome, result] of [[true, 'notDispatched'], [new Error('handler failure'), 'error'], [new CancellationError(), 'cancelled']] as const) {
		test(`submit-handler ${result} never dispatches a provider request`, async () => {
			const h = createHarness();
			let requests = 0;
			const { input } = createInput(h, async () => { requests++; return true; }, async () => {
				if (outcome instanceof Error) {
					throw outcome;
				}
				return outcome;
			});
			await input.submit();
			assert.strictEqual(requests, 0);
			h.assertFinished(result);
		});
	}

	test('visible tools complete after two frames while nil, whitespace and hidden parts do not', () => {
		const h = createHarness(false);
		const interaction = h.createInteraction();
		interaction.handoff(h.session, h.chat);
		const response = h.createResponse();
		interaction.onDidCreateResponse(response.response);
		h.addWidget(response.response);
		response.progress([
			{ kind: 'thinking' }, { kind: 'markdownContent', content: new MarkdownString(' \n') },
			upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation', presentation: ToolInvocationPresentation.Hidden }),
		]);
		assert.strictEqual(h.frames.size, 0);
		response.progress([upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation' })]);
		h.frame();
		assert.strictEqual(h.events.length, 0);
		h.frame();
		h.assertFinished('success');
	});

	for (const responseDisposed of [false, true]) {
		test(`disposing ${responseDisposed ? 'the response model' : 'the composer before handoff'} cleans up`, () => {
			const h = createHarness();
			const interaction = h.createInteraction();
			if (responseDisposed) {
				interaction.handoff(h.session, h.chat);
				const response = h.createResponse();
				interaction.onDidCreateResponse(response.response);
				response.disposed.fire();
			} else {
				interaction.disposeSource();
			}
			h.assertFinished('disposed');
		});
	}

	for (const kind of ['sent', 'rejected', 'queued'] as const) {
		for (const throws of [false, true]) {
			test(`${kind} callbacks ${throws ? 'may throw without failing dispatch' : 'neither await completion nor survive queuing or serialization'}`, async () => {
				const h = createHarness();
				const created = new DeferredPromise<IChatResponseModel>();
				const completed = new DeferredPromise<void>();
				const queued = new DeferredPromise<ChatSendResult>();
				const sent: ChatSendResult = { kind: 'sent', data: upcastPartial<IChatSendRequestData>({ responseCreatedPromise: created.p, responseCompletePromise: completed.p }) };
				const result: ChatSendResult = kind === 'sent' ? sent : kind === 'queued' ? { kind, deferred: queued.p } : { kind, reason: 'test' };
				let requestOptions: IChatSendRequestOptions | undefined;
				const service: ChatService = Object.assign(Object.create(ChatService.prototype), {
					sendRequestInternal: async (_resource: URI, _request: string, options: IChatSendRequestOptions | undefined) => { requestOptions = options; return result; },
				});
				const observed: [IChatResponseModel | undefined, ChatSendResult['kind'] | undefined][] = [];
				const errors: unknown[] = [];
				const failure = new Error('observer failure');
				const previousHandler = errorHandler.getUnexpectedErrorHandler();
				errorHandler.setUnexpectedErrorHandler(error => errors.push(error));
				try {
					const options: IChatSendRequestOptions = {
						onDidCreateResponse: (response, dispatchKind) => {
							observed.push([response, dispatchKind]);
							if (throws) {
								throw failure;
							}
						},
					};
					assert.strictEqual(await service.sendRequest(h.chat.resource, 'test request', options), result);
					assert.deepStrictEqual(observed, kind === 'sent' ? [] : [[undefined, kind]]);
					const response = h.createResponse();
					await queued.complete(sent);
					await created.complete(response.response);
					await Promise.resolve();
					assert.deepStrictEqual({ observed, errors, callback: requestOptions?.onDidCreateResponse, persisted: Object.hasOwn(serializeSendOptions(options), 'onDidCreateResponse'), completed: completed.isSettled }, {
						observed: [[kind === 'sent' ? response.response : undefined, kind]], errors: throws ? [failure] : [], callback: undefined, persisted: false, completed: false,
					});
					await completed.complete();
				} finally {
					errorHandler.setUnexpectedErrorHandler(previousHandler);
				}
			});
		}
	}
});
