/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { chatUserInteractionTimingTracker, ChatUserInteractionTimingTracker, IChatUserInteractionTimer, IChatUserInteractionTiming } from '../../../../../workbench/contrib/chat/browser/chatUserInteractionTelemetry.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatSendResult, IChatSendRequestData, IChatSendRequestOptions, IChatToolInvocation } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatServiceImpl.js';
import { ChatResponseModelChangeReason, IChatModel, IChatProgressResponseContent, IChatResponseModel, IResponse, serializeSendOptions } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { ToolInvocationPresentation } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { INewChatInputSendRequest, NewChatInputWidget } from '../../browser/newChatInput.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NewChatUserInteraction } from '../../browser/newChatUserInteraction.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';

suite('Sessions - New chat user-perceived TTFP', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(newSession = true, globalTracker = false) {
		let now = 10;
		let visibilityState: DocumentVisibilityState = 'visible';
		let focused = true;
		let nextFrame = 0;
		const frames = new Map<number, FrameRequestCallback>();
		const windowEvents = new EventTarget();
		const documentEvents = new EventTarget();
		const window: Window & typeof globalThis = upcastPartial<Window & typeof globalThis>({
			get window(): Window & typeof globalThis { return window; },
			document: upcastPartial<Document>({
				get defaultView() { return window; },
				get visibilityState() { return visibilityState; },
				hasFocus: () => focused,
				addEventListener: (...args: Parameters<EventTarget['addEventListener']>) => documentEvents.addEventListener(...args),
				removeEventListener: (...args: Parameters<EventTarget['removeEventListener']>) => documentEvents.removeEventListener(...args),
			}),
			addEventListener: (...args: Parameters<EventTarget['addEventListener']>) => windowEvents.addEventListener(...args),
			removeEventListener: (...args: Parameters<EventTarget['removeEventListener']>) => windowEvents.removeEventListener(...args),
			requestAnimationFrame: callback => {
				const id = ++nextFrame;
				frames.set(id, callback);
				return id;
			},
			cancelAnimationFrame: id => { frames.delete(id); },
		});
		const element = upcastPartial<HTMLElement>({ ownerDocument: window.document });
		const sourceVisible = observableValue('sourceVisible', true);
		const hostVisible = observableValue('hostVisible', true);
		const chat = upcastPartial<IChat>({ resource: URI.parse('test-chat:/first') });
		const activeChat = observableValue('activeChat', chat);
		const preparing = observableValue('preparing', newSession);
		const session = upcastPartial<IActiveSession>({
			sessionId: 'source-session',
			resource: URI.parse('test-session:/source'),
			providerId: 'test',
			sessionType: 'test-chat',
			status: constObservable(newSession ? SessionStatus.Untitled : SessionStatus.Completed),
			mainChat: constObservable(chat),
			activeChat,
			isNewSessionRequestInProgress: preparing,
		});
		const visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', [session]);
		const replaced = disposables.add(new Emitter<{ from: ISession; to: ISession }>());
		const replacedDraft = disposables.add(new Emitter<{ from: ISession; to: ISession }>());
		const managementService = upcastPartial<ISessionsManagementService>({
			onDidReplaceSession: replaced.event,
			onDidReplaceNewDraftSession: replacedDraft.event,
		});
		const sessionsService = upcastPartial<ISessionsService>({ visibleSessions });
		const added = disposables.add(new Emitter<IChatWidget>());
		const removed = disposables.add(new Emitter<IChatWidget>());
		const widgets: IChatWidget[] = [];
		const widgetService = upcastPartial<IChatWidgetService>({
			onDidAddWidget: added.event,
			onDidRemoveWidget: removed.event,
			getAllWidgets: () => widgets,
		});
		const tracker = globalTracker ? chatUserInteractionTimingTracker : disposables.add(new ChatUserInteractionTimingTracker(() => now));
		const starts: IChatUserInteractionTimer[] = [];
		const finishes: IChatUserInteractionTiming[] = [];
		disposables.add(tracker.onDidStart(({ timer }) => {
			starts.push(timer);
			disposables.add(toDisposable(() => tracker.cancel(timer, 'disposed')));
		}));
		disposables.add(tracker.onDidFinish(timing => finishes.push(timing)));
		const source = { window, visible: sourceVisible, hostVisible };
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWidgetService, widgetService);
		instantiationService.stub(ISessionsService, sessionsService);
		instantiationService.stub(ISessionsManagementService, managementService);
		const createInteraction = () => instantiationService.createInstance(NewChatUserInteraction, source, tracker);

		function createResponse(resource = chat.resource) {
			const changed = disposables.add(new Emitter<ChatResponseModelChangeReason>());
			const disposed = disposables.add(new Emitter<void>());
			let parts: IChatProgressResponseContent[] = [];
			let complete = false;
			let canceled = false;
			let error = false;
			const model = upcastPartial<IChatModel>({ sessionResource: resource, onDidDispose: disposed.event });
			const response = upcastPartial<IChatResponseModel>({
				session: model,
				requestId: `request-${resource.path}`,
				onDidChange: changed.event,
				response: upcastPartial<IResponse>({ get value() { return parts; } }),
				get isComplete() { return complete; },
				get isCanceled() { return canceled; },
				get result() { return error ? { errorDetails: { message: 'request failed' } } : undefined; },
			});
			return {
				response,
				disposed,
				hasListeners: () => changed.hasListeners() || disposed.hasListeners(),
				progress: (value: IChatProgressResponseContent[]) => { parts = value; changed.fire({ reason: 'other' }); },
				complete: (result?: 'cancelled' | 'error') => {
					complete = true;
					canceled = result === 'cancelled';
					error = result === 'error';
					changed.fire({ reason: 'completedRequest' });
				},
			};
		}

		function addWidget(response?: IChatResponseModel, progressActive = false) {
			const changed = disposables.add(new Emitter<IChatWidgetViewModelChangeEvent>());
			const hidden = disposables.add(new Emitter<void>());
			const shown = disposables.add(new Emitter<void>());
			let viewModel: IChatViewModel | undefined;
			let visible = true;
			const widget = upcastPartial<IChatWidget>({
				domNode: element,
				get visible() { return visible; },
				get viewModel() { return viewModel; },
				get isTranscriptProgressActive() { return progressActive; },
				onDidChangeViewModel: changed.event,
				onDidHide: hidden.event,
				onDidShow: shown.event,
			});
			const bind = (response: IChatResponseModel) => {
				const previousSessionResource = viewModel?.sessionResource;
				viewModel = upcastPartial<IChatViewModel>({ model: response.session, sessionResource: response.session.sessionResource });
				changed.fire({ previousSessionResource, currentSessionResource: viewModel.sessionResource });
			};
			if (response) {
				bind(response);
			}
			widgets.push(widget);
			added.fire(widget);
			return {
				widget,
				bind,
				hide: () => { visible = false; hidden.fire(); },
				show: () => { visible = true; shown.fire(); },
				finishPreparation: () => { progressActive = false; preparing.set(false, undefined); },
				remove: () => { widgets.splice(widgets.indexOf(widget), 1); removed.fire(widget); },
			};
		}

		return {
			tracker, starts, finishes, session, chat, activeChat, preparing, visibleSessions, replaced, replacedDraft,
			sourceVisible, hostVisible, element, instantiationService, frames, createInteraction, createResponse, addWidget,
			hasViewObservers: () => added.hasListeners() || removed.hasListeners() || replaced.hasListeners() || replacedDraft.hasListeners(),
			setTime: (value: number) => { now = value; },
			frame: () => {
				const callbacks = [...frames.values()];
				frames.clear();
				callbacks.forEach(callback => callback(now));
			},
			blur: () => { focused = false; },
			hideDocument: () => { visibilityState = 'hidden'; documentEvents.dispatchEvent(new globalThis.Event('visibilitychange')); },
			showDocument: () => { visibilityState = 'visible'; documentEvents.dispatchEvent(new globalThis.Event('visibilitychange')); },
		};
	}

	function createInput(harness: ReturnType<typeof createHarness>, sendRequest: (request: INewChatInputSendRequest) => Promise<boolean>, tryHandle: () => Promise<boolean> = async () => false) {
		let query = 'test request';
		const sourceOwner = disposables.add(new MutableDisposable());
		const input: NewChatInputWidget = Object.assign(Object.create(NewChatInputWidget.prototype), {
			_editorContainer: harness.element,
			_editor: { getModel: () => ({ getValue: () => query, setValue: (value: string) => { query = value; } }), updateOptions: () => { } },
			_sending: false,
			_userInteractionSource: sourceOwner,
			_canSendRequest: constObservable(true),
			_contextAttachments: { attachments: [], clear: () => { } },
			options: { session: constObservable(harness.session), inputVisible: harness.sourceVisible, hostVisible: harness.hostVisible, sendRequest },
			instantiationService: harness.instantiationService,
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

	function createSend(harness: ReturnType<typeof createHarness>, newSession: boolean, dispatch: (options: ISendRequestOptions) => Promise<void>, comparison = false) {
		type Send = (query: string, attachments?: IChatRequestVariableEntry[], background?: boolean, interaction?: NewChatUserInteraction) => Promise<boolean>;
		const owner = {
			send: Reflect.get(newSession ? NewChatWidget.prototype : NewChatInSessionWidget.prototype, '_send') as Send,
			_session: constObservable(harness.session),
			_feedbackItems: constObservable([]),
			_comparisonSubmitArmed: comparison,
			_comparisonAttempts: constObservable(comparison ? [{}] : []),
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
		test(`${newSession ? 'new session' : 'peer chat'} preserves the gesture through submit-handler preparation and response-view handoff`, async () => {
			const h = createHarness(newSession, true);
			const handler = new DeferredPromise<boolean>();
			const provider = new DeferredPromise<void>();
			let sentOptions: ISendRequestOptions | undefined;
			const { input, sourceOwner } = createInput(h, createSend(h, newSession, async options => {
				sentOptions = options;
				await provider.p;
			}), () => handler.p);
			const send = input.submit();
			assert.deepStrictEqual({ started: h.starts.length, sent: sentOptions }, { started: 1, sent: undefined });
			const timer = h.starts[0];
			await handler.complete(false);
			await Promise.resolve();
			const response = h.createResponse();
			sentOptions!.onDidCreateResponse!(response.response);
			sourceOwner.dispose();
			h.sourceVisible.set(false, undefined);
			const widget = h.addWidget();
			response.progress([{ kind: 'thinking', value: [' ', '\n'] }]);
			widget.bind(response.response);
			assert.strictEqual(h.frames.size, 0);
			response.progress([{ kind: 'thinking', value: 'Reasoning' }]);
			h.frame();
			assert.strictEqual(h.finishes.length, 0);
			h.frame();
			await provider.complete();
			assert.deepStrictEqual({ sent: await send, starts: h.starts, result: h.finishes.map(t => [t.timer, t.result]) }, {
				sent: true, starts: [timer], result: [[timer, 'success']],
			});
			// Measuring never cancels or completes the actual response.
			response.progress([{ kind: 'markdownContent', content: new MarkdownString('Still streaming') }]);
			assert.strictEqual(response.response.isComplete, false);
		});
	}

	test('keeps the timestamp through preparation session replacement and two response widgets', async () => {
		const h = createHarness();
		const interaction = h.createInteraction();
		interaction.handoff(h.session, h.chat);
		h.sourceVisible.set(false, undefined);
		interaction.disposeSource();
		const resource = URI.parse('test-chat:/prepared');
		const chat = upcastPartial<IChat>({ resource });
		const prepared = { ...h.session, sessionId: 'prepared', mainChat: constObservable(chat), activeChat: constObservable(chat) };
		h.visibleSessions.set([prepared], undefined);
		h.replacedDraft.fire({ from: h.session, to: prepared });
		await Promise.resolve();
		const response = h.createResponse(resource);
		interaction.onDidCreateResponse(response.response);
		const preparingWidget = h.addWidget(response.response);
		h.setTime(50);
		response.progress([{ kind: 'markdownContent', content: new MarkdownString('Visible') }]);
		h.frame();
		preparingWidget.remove();
		assert.strictEqual(h.frames.size, 0);
		h.addWidget(response.response);
		h.setTime(90);
		h.frame();
		h.frame();
		assert.deepStrictEqual(h.finishes.map(t => ({ timer: t.timer, result: t.result, elapsed: t.elapsedMs })), [
			{ timer: interaction.timer, result: 'success', elapsed: 80 },
		]);
		assert.strictEqual(h.starts.length, 1);
	});

	test('background composer submissions do not start a measurement', async () => {
		const h = createHarness(true, true);
		let sent: INewChatInputSendRequest | undefined;
		const { input } = createInput(h, async request => { sent = request; return true; });
		assert.deepStrictEqual({ sent: await input.submit(true), interaction: sent?.userInteraction, starts: h.starts.length }, {
			sent: true, interaction: undefined, starts: 0,
		});
	});

	for (const initial of [true, false]) {
		test(`${initial ? 'initially hidden' : 'hidden during submit preparation'} does not resume or stop the send`, async () => {
			const h = createHarness(true, true);
			const handler = new DeferredPromise<boolean>();
			let requests = 0;
			if (initial) {
				h.sourceVisible.set(false, undefined);
			}
			const { input } = createInput(h, createSend(h, true, async options => {
				requests++;
				const response = h.createResponse();
				options.onDidCreateResponse?.(response.response);
				h.addWidget(response.response);
				response.progress([{ kind: 'thinking', value: 'Progress after hiding' }]);
			}), () => handler.p);
			const send = input.submit();
			h.sourceVisible.set(false, undefined);
			h.sourceVisible.set(true, undefined);
			await handler.complete(false);
			assert.deepStrictEqual({ sent: await send, requests, results: h.finishes.map(t => t.result), frames: h.frames.size }, {
				sent: true, requests: 1, results: ['hidden'], frames: 0,
			});
		});
	}

	for (const hide of ['document', 'host', 'widget'] as const) {
		test(`${hide} hiding ends an interaction permanently without requiring focus`, () => {
			const h = createHarness(false);
			const interaction = h.createInteraction();
			interaction.handoff(h.session, h.chat);
			interaction.disposeSource();
			const response = h.createResponse();
			interaction.onDidCreateResponse(response.response);
			const widget = h.addWidget(response.response);
			h.blur();
			response.progress([{ kind: 'thinking', value: 'Visible' }]);
			h.frame();
			assert.strictEqual(h.finishes.length, 0);
			if (hide === 'document') {
				h.hideDocument();
				h.showDocument();
			} else if (hide === 'host') {
				h.hostVisible.set(false, undefined);
				h.hostVisible.set(true, undefined);
			} else {
				widget.hide();
				widget.show();
			}
			h.frame();
			assert.deepStrictEqual({ results: h.finishes.map(t => t.result), frames: h.frames.size }, { results: ['hidden'], frames: 0 });
		});
	}

	test('initially hidden input never installs late response or handoff observers', () => {
		const h = createHarness();
		h.sourceVisible.set(false, undefined);
		const interaction = h.createInteraction();
		interaction.handoff(h.session, h.chat);
		const response = h.createResponse();
		interaction.onDidCreateResponse(response.response);
		h.sourceVisible.set(true, undefined);
		h.addWidget(response.response);
		assert.deepStrictEqual({
			active: h.tracker.isActive(interaction.timer),
			viewObservers: h.hasViewObservers(),
			responseObservers: response.hasListeners(),
			results: h.finishes.map(t => t.result),
		}, { active: false, viewObservers: false, responseObservers: false, results: ['hidden'] });
	});

	test('focus loss alone remains eligible through both render frames', () => {
		const h = createHarness(false);
		const interaction = h.createInteraction();
		h.blur();
		interaction.handoff(h.session, h.chat);
		const response = h.createResponse();
		interaction.onDidCreateResponse(response.response);
		h.addWidget(response.response);
		response.progress([{ kind: 'markdownContent', content: new MarkdownString('Visible while unfocused') }]);
		h.frame();
		h.frame();
		assert.deepStrictEqual(h.finishes.map(t => ({ timer: t.timer, result: t.result })), [{ timer: interaction.timer, result: 'success' }]);
	});

	test('switching away during the response-view gap terminates instead of waiting for a later show', async () => {
		const h = createHarness(false);
		const interaction = h.createInteraction();
		interaction.handoff(h.session, h.chat);
		interaction.disposeSource();
		h.activeChat.set(upcastPartial<IChat>({ resource: URI.parse('test-chat:/other') }), undefined);
		await Promise.resolve();
		h.activeChat.set(h.chat, undefined);
		const response = h.createResponse();
		interaction.onDidCreateResponse(response.response);
		h.addWidget(response.response);
		response.progress([{ kind: 'thinking', value: 'Too late' }]);
		h.frame();
		h.frame();
		assert.deepStrictEqual(h.finishes.map(t => t.result), ['hidden']);
	});

	test('destination hiding before response creation terminates even if it is immediately shown again', () => {
		const h = createHarness(false);
		const interaction = h.createInteraction();
		interaction.handoff(h.session, h.chat);
		const response = h.createResponse();
		const widget = h.addWidget(response.response);
		widget.hide();
		widget.show();
		interaction.onDidCreateResponse(response.response);
		response.progress([{ kind: 'thinking', value: 'Too late' }]);
		h.frame();
		h.frame();
		assert.deepStrictEqual(h.finishes.map(t => t.result), ['hidden']);
	});

	test('preparation UI is not counted as rendered response content', async () => {
		const h = createHarness();
		const interaction = h.createInteraction();
		interaction.handoff(h.session, h.chat);
		h.sourceVisible.set(false, undefined);
		const response = h.createResponse();
		interaction.onDidCreateResponse(response.response);
		const widget = h.addWidget(response.response, true);
		response.progress([{ kind: 'thinking', value: 'Ready, but covered by preparation' }]);
		assert.strictEqual(h.frames.size, 0);
		widget.finishPreparation();
		await Promise.resolve();
		h.frame();
		h.frame();
		assert.deepStrictEqual(h.finishes.map(t => t.result), ['success']);
	});

	for (const result of ['notDispatched', 'cancelled', 'error', 'completedWithoutProgress'] as const) {
		test(`cleans up ${result} without claiming visible progress`, () => {
			const h = createHarness();
			const interaction = h.createInteraction();
			interaction.handoff(h.session, h.chat);
			if (result === 'notDispatched') {
				interaction.onDidCreateResponse(undefined);
			} else {
				const response = h.createResponse();
				interaction.onDidCreateResponse(response.response);
				response.complete(result === 'completedWithoutProgress' ? undefined : result);
			}
			assert.deepStrictEqual(h.finishes.map(t => t.result), [result]);
			assert.strictEqual(h.tracker.isActive(interaction.timer), false);
		});
	}

	test('handled slash commands and submit-handler errors terminate without a provider response', async () => {
		const results: string[] = [];
		for (const outcome of [true, new Error('handler failure'), new CancellationError()]) {
			const h = createHarness(true, true);
			let requests = 0;
			const { input } = createInput(h, async () => { requests++; return true; }, async () => {
				if (outcome instanceof Error) {
					throw outcome;
				}
				return outcome;
			});
			await input.submit();
			results.push(h.finishes[0].result);
			assert.strictEqual(requests, 0);
		}
		assert.deepStrictEqual(results, ['notDispatched', 'error', 'cancelled']);
	});

	test('provider errors in both composer paths retain the original timer and clean up', async () => {
		for (const newSession of [true, false]) {
			const h = createHarness(newSession, true);
			const { input } = createInput(h, createSend(h, newSession, async () => { throw new Error('dispatch failed'); }));
			assert.deepStrictEqual({ sent: await input.submit(), results: h.finishes.map(t => t.result), starts: h.starts.length }, {
				sent: false, results: ['error'], starts: 1,
			});
		}
	});

	test('comparison submission terminates before entering its unsupported multi-response path', async () => {
		const h = createHarness(true, true);
		let sent = false;
		const { input } = createInput(h, createSend(h, true, async () => { sent = true; }, true));
		await input.submit();
		assert.deepStrictEqual({ sent, results: h.finishes.map(t => t.result) }, { sent: false, results: ['notDispatched'] });
	});

	test('visible tool invocation completes after two frames while whitespace and hidden tools do not', () => {
		const h = createHarness(false);
		const interaction = h.createInteraction();
		interaction.handoff(h.session, h.chat);
		const response = h.createResponse();
		interaction.onDidCreateResponse(response.response);
		h.addWidget(response.response);
		const hidden = upcastPartial<IChatToolInvocation>({
			kind: 'toolInvocation',
			presentation: ToolInvocationPresentation.Hidden,
			toolSpecificDataKind: constObservable(undefined),
		});
		response.progress([{ kind: 'markdownContent', content: new MarkdownString(' \n') }, hidden]);
		assert.strictEqual(h.frames.size, 0);
		response.progress([upcastPartial<IChatToolInvocation>({
			kind: 'toolInvocation',
			toolSpecificDataKind: constObservable(undefined),
		})]);
		h.frame();
		h.frame();
		assert.deepStrictEqual(h.finishes.map(t => t.result), ['success']);
	});

	test('disposing the composer before handoff or its response model cleans up', () => {
		const h = createHarness();
		const beforeSend = h.createInteraction();
		beforeSend.disposeSource();
		const afterSend = h.createInteraction();
		afterSend.handoff(h.session, h.chat);
		const response = h.createResponse();
		afterSend.onDidCreateResponse(response.response);
		response.disposed.fire();
		assert.deepStrictEqual(h.finishes.map(t => t.result), ['disposed', 'disposed']);
	});

	test('chat-service observation does not await the response or persist the callback', async () => {
		const h = createHarness();
		const created = new DeferredPromise<IChatResponseModel>();
		const completed = new DeferredPromise<void>();
		const result: ChatSendResult = {
			kind: 'sent',
			data: upcastPartial<IChatSendRequestData>({ responseCreatedPromise: created.p, responseCompletePromise: completed.p }),
		};
		let requestOptions: IChatSendRequestOptions | undefined;
		const service: ChatService = Object.assign(Object.create(ChatService.prototype), {
			sendRequestInternal: async (_resource: URI, _request: string, options: IChatSendRequestOptions | undefined) => {
				requestOptions = options;
				return result;
			},
		});
		const observed: (IChatResponseModel | undefined)[] = [];
		const options: IChatSendRequestOptions = { onDidCreateResponse: response => observed.push(response) };
		assert.strictEqual(await service.sendRequest(h.chat.resource, 'test request', options), result);
		assert.strictEqual(observed.length, 0);
		const response = h.createResponse();
		await created.complete(response.response);
		assert.deepStrictEqual(observed, [response.response]);
		assert.strictEqual(requestOptions?.onDidCreateResponse, undefined);
		assert.strictEqual(Object.hasOwn(serializeSendOptions(options), 'onDidCreateResponse'), false);
		assert.strictEqual(completed.isSettled, false);
		await completed.complete();
	});

	test('rejected and queued sends end the UI-only observer instead of binding a later request', async () => {
		const h = createHarness();
		const deferred = new DeferredPromise<ChatSendResult>();
		const results: ChatSendResult[] = [{ kind: 'rejected', reason: 'test' }, { kind: 'queued', deferred: deferred.p }];
		for (const result of results) {
			const service: ChatService = Object.assign(Object.create(ChatService.prototype), { sendRequestInternal: async () => result });
			const observed: (IChatResponseModel | undefined)[] = [];
			await service.sendRequest(h.chat.resource, 'test request', { onDidCreateResponse: response => observed.push(response) });
			assert.deepStrictEqual(observed, [undefined]);
		}
		await deferred.complete({ kind: 'rejected', reason: 'test' });
	});
});
