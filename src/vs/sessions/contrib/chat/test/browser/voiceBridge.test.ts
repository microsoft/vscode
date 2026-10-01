/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IVoiceSessionController } from '../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { IChat, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ICreateNewSessionOptions, ISendRequestOptions, ISendRequestSentEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IOpenNewSessionOptions, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { INewChatVoiceComposer, INewChatVoiceTargetService, NEW_CHAT_VOICE_SENTINEL, NewChatVoiceTargetService } from '../../browser/newChatVoice.js';
import { INewSessionComposer, INewSessionComposerService } from '../../browser/newSessionComposerService.js';
import { prepareNewVoiceSession, SessionsVoiceActiveSessionContribution, SessionsVoiceBridgeContribution, SessionsVoiceNewComposerContribution } from '../../browser/voiceBridge.contribution.js';

suite('SessionsVoiceBridgeContribution - input ownership', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function registerBridge(widget: IChatWidget | undefined, composer: INewChatVoiceComposer | undefined) {
		disposables.add(new SessionsVoiceBridgeContribution(
			new TestConfigurationService({ 'agents.voice.enabled': true }),
			new class extends mock<IChatWidgetService>() {
				override readonly lastFocusedWidget = widget;
				override getWidgetBySessionResource(resource: URI) {
					return widget?.viewModel?.sessionResource.toString() === resource.toString() ? widget : undefined;
				}
			}(),
			new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable(undefined);
			}(),
			new class extends mock<ISessionsManagementService>() { }(),
			new class extends mock<INewChatVoiceTargetService>() {
				override readonly activeComposer = constObservable(composer);
			}(),
			new class extends mock<IVoiceSessionController>() { }(),
			new class extends mock<INewSessionComposerService>() { }(),
			new NullLogService(),
		));
		return (text: string, expectedSession: string) => CommandsRegistry.getCommand('_chat.voice.acceptInput')!.handler(
			new class extends mock<ServicesAccessor>() { }(), text, expectedSession,
		);
	}

	test('rejects late input after its widget changed session instead of sending it to the new session', async () => {
		let resource = URI.parse('chat-session:/a');
		const inputs: string[] = [];
		const widget = new class extends mock<IChatWidget>() {
			override get viewModel() { return upcastPartial<IChatViewModel>({ sessionResource: resource }); }
			override getInput() { return 'Already typed'; }
			override async acceptInput(text?: string) {
				inputs.push(text ?? '');
				return upcastPartial<IChatResponseModel>({ id: 'response' });
			}
		}();
		const accept = registerBridge(widget, undefined);
		const first = await accept('First request', resource.toString());
		resource = URI.parse('chat-session:/b');
		const stale = await accept('Stale request', 'chat-session:/a');
		assert.deepStrictEqual({ inputs, first, stale }, {
			inputs: ['Already typed First request'], first: { id: 'response' }, stale: false,
		});
	});

	test('does not redirect an existing session turn to a new composer and reports a busy composer honestly', async () => {
		const sent: string[] = [];
		const composer = upcastPartial<INewChatVoiceComposer>({
			sendQuery: text => { sent.push(text); return false; },
		});
		const accept = registerBridge(undefined, composer);
		const wrongTarget = await accept('Old session input', 'chat-session:/a');
		const busy = await accept('Draft input', NEW_CHAT_VOICE_SENTINEL.toString());
		assert.deepStrictEqual({ sent, wrongTarget, busy }, { sent: ['Draft input'], wrongTarget: false, busy: false });
	});
});

suite('SessionsVoiceActiveSessionContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createDraftOwner() {
		const connected = observableValue('connected', true);
		const draft = observableValue('draft', true);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const composer = upcastPartial<INewChatVoiceComposer & INewSessionComposer>({});
		const activeComposer = observableValue<INewChatVoiceComposer | undefined>('composer', composer);
		const willSend = disposables.add(new Emitter<{ options: ISendRequestOptions; selection: undefined }>());
		const didSend = disposables.add(new Emitter<ISendRequestSentEvent>());
		const promoted: string[] = [];
		disposables.add(new SessionsVoiceActiveSessionContribution(
			new class extends mock<IVoiceSessionController>() {
				override readonly isConnected = connected;
				override readonly hasDraftTarget = draft;
				override setActiveSessionShown(): void { }
				override promoteDraftTarget(resource: URI): void {
					promoted.push(resource.toString());
					draft.set(false, undefined);
				}
			}(),
			new class extends mock<ISessionsService>() {
				override readonly activeSession = activeSession;
			}(),
			new class extends mock<ISessionsManagementService>() {
				override readonly onDidSendRequest = didSend.event;
			}(),
			new class extends mock<INewSessionComposerService>() {
				override readonly activeComposer = constObservable(composer);
				override readonly onWillSendRequest = willSend.event;
			}(),
			new class extends mock<INewChatVoiceTargetService>() {
				override readonly activeComposer = activeComposer;
			}(),
		));
		const complete = (options: ISendRequestOptions) => didSend.fire({
			options,
			session: upcastPartial<ISession>({ sessionId: 'replacement-session' }),
			chat: upcastPartial<IChat>({ resource: URI.parse('agent-host-copilotcli:/created-chat') }),
			isNewSession: true,
			isNewChat: true,
		});
		return { connected, draft, activeSession, activeComposer, willSend, promoted, complete };
	}

	test('promotes the welcome input through its exact send even when the draft facade is replaced', () => {
		const owner = createDraftOwner();
		const options: ISendRequestOptions = { query: 'Voice request' };
		owner.willSend.fire({ options, selection: undefined });
		owner.complete({ query: options.query });
		const beforeOwnedSend = [...owner.promoted];
		owner.complete(options);
		owner.complete(options);
		assert.deepStrictEqual({ beforeOwnedSend, promoted: owner.promoted }, {
			beforeOwnedSend: [], promoted: ['agent-host-copilotcli:/created-chat'],
		});
	});

	test('does not promote background sends, other composers, or requests from a retired voice owner', () => {
		const results = [];
		for (const kind of ['background', 'other-composer', 'disconnect', 'retarget'] as const) {
			const owner = createDraftOwner();
			const options: ISendRequestOptions = { query: 'Voice request', background: kind === 'background' };
			if (kind === 'other-composer') {
				owner.activeComposer.set(upcastPartial<INewChatVoiceComposer>({}), undefined);
			}
			owner.willSend.fire({ options, selection: undefined });
			if (kind === 'disconnect') {
				owner.connected.set(false, undefined);
				owner.connected.set(true, undefined);
			} else if (kind === 'retarget') {
				owner.draft.set(false, undefined);
				owner.draft.set(true, undefined);
			}
			owner.complete(options);
			results.push({ kind, promoted: owner.promoted });
		}
		assert.deepStrictEqual(results, [
			{ kind: 'background', promoted: [] },
			{ kind: 'other-composer', promoted: [] },
			{ kind: 'disconnect', promoted: [] },
			{ kind: 'retarget', promoted: [] },
		]);
	});

	test('waits for the exact send result when the draft becomes created before its chat resource is ready', () => {
		const owner = createDraftOwner();
		const created = observableValue('isCreated', false);
		owner.activeSession.set(upcastPartial<IActiveSession>({
			isCreated: created,
			activeChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilotcli:/untitled') })),
		}), undefined);
		const options: ISendRequestOptions = { query: 'Voice request' };
		owner.willSend.fire({ options, selection: undefined });
		created.set(true, undefined);
		const beforeSendResult = [...owner.promoted];
		owner.complete(options);
		assert.deepStrictEqual({ beforeSendResult, promoted: owner.promoted }, {
			beforeSendResult: [], promoted: ['agent-host-copilotcli:/created-chat'],
		});
	});
});

suite('SessionsVoiceNewComposerContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function composer(routesWhileSessionActive = false): INewChatVoiceComposer {
		return {
			onDidFocus: Event.None,
			routesWhileSessionActive,
			sendQuery: () => true,
			prefillInput: () => { },
			focus: () => { },
			getVoiceModels: () => [],
			selectVoiceModel: () => false,
		};
	}

	function createController(isConnected: ISettableObservable<boolean>, isConnecting = constObservable(false)) {
		let disconnectCount = 0;
		const hasDraftTarget = observableValue<boolean>('hasDraftTarget', false);
		const controller = new class extends mock<IVoiceSessionController>() {
			override readonly isConnected = isConnected;
			override readonly isConnecting = isConnecting;
			override readonly hasDraftTarget = hasDraftTarget;
			override disconnect(): void { disconnectCount++; }
		};
		return { controller, hasDraftTarget, getDisconnectCount: () => disconnectCount };
	}

	function createTarget(): NewChatVoiceTargetService {
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		}();
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidChangeFocusedSession = Event.None;
		}();
		return new NewChatVoiceTargetService(sessionsService, chatWidgetService);
	}

	test('disconnects when a fresh welcome composer takes over a connected voice session', () => {
		const target = disposables.add(createTarget());
		const isConnected = observableValue<boolean>('isConnected', false);
		const { controller, getDisconnectCount } = createController(isConnected);

		// Voice starts on the first (welcome) composer.
		const a = composer();
		disposables.add(target.registerComposer(a));
		isConnected.set(true, undefined);
		disposables.add(new SessionsVoiceNewComposerContribution(controller, target));

		// Opening a new session mounts a fresh welcome composer.
		const b = composer();
		disposables.add(target.registerComposer(b));

		assert.strictEqual(getDisconnectCount(), 1);
	});

	test('keeps voice connected when voice creates a fresh session composer', () => {
		const target = disposables.add(createTarget());
		const isConnected = observableValue<boolean>('isConnected', false);
		const { controller, getDisconnectCount } = createController(isConnected);

		const a = composer();
		disposables.add(target.registerComposer(a));
		isConnected.set(true, undefined);
		disposables.add(new SessionsVoiceNewComposerContribution(controller, target));

		const transition = target.beginVoiceTransition();
		const b = composer();
		disposables.add(target.registerComposer(b));
		transition.dispose();

		assert.strictEqual(getDisconnectCount(), 0);
	});

	test('disconnects for an unrelated composer even when voice owns a draft', () => {
		const target = disposables.add(createTarget());
		const isConnected = observableValue<boolean>('isConnected', false);
		const { controller, hasDraftTarget, getDisconnectCount } = createController(isConnected);

		const a = composer();
		disposables.add(target.registerComposer(a));
		hasDraftTarget.set(true, undefined);
		isConnected.set(true, undefined);
		disposables.add(new SessionsVoiceNewComposerContribution(controller, target));

		const b = composer();
		disposables.add(target.registerComposer(b));

		assert.strictEqual(getDisconnectCount(), 1);
	});

	test('disconnects when a fresh welcome composer takes over a connecting voice session', () => {
		const target = disposables.add(createTarget());
		const isConnected = observableValue<boolean>('isConnected', false);
		const isConnecting = observableValue<boolean>('isConnecting', true);
		const { controller, getDisconnectCount } = createController(isConnected, isConnecting);

		const a = composer();
		disposables.add(target.registerComposer(a));
		disposables.add(new SessionsVoiceNewComposerContribution(controller, target));

		const b = composer();
		disposables.add(target.registerComposer(b));

		assert.strictEqual(getDisconnectCount(), 1);
	});

	test('keeps voice connected when switching to an in-session composer that opts to route', () => {
		const target = disposables.add(createTarget());
		const isConnected = observableValue<boolean>('isConnected', false);
		const { controller, getDisconnectCount } = createController(isConnected);

		const a = composer();
		disposables.add(target.registerComposer(a));
		isConnected.set(true, undefined);
		disposables.add(new SessionsVoiceNewComposerContribution(controller, target));

		// An in-session composer deliberately keeps routing the active session's voice.
		const inSession = composer(/* routesWhileSessionActive */ true);
		disposables.add(target.registerComposer(inSession));

		assert.strictEqual(getDisconnectCount(), 0);
	});

	test('does not disconnect when voice is not connected', () => {
		const target = disposables.add(createTarget());
		const isConnected = observableValue<boolean>('isConnected', false);
		const { controller, getDisconnectCount } = createController(isConnected);

		const a = composer();
		disposables.add(target.registerComposer(a));
		disposables.add(new SessionsVoiceNewComposerContribution(controller, target));

		const b = composer();
		disposables.add(target.registerComposer(b));

		assert.strictEqual(getDisconnectCount(), 0);
	});

	test('uses the selected provider and sends without waiting for the composer', async () => {
		const workspace = new class extends mock<ISessionWorkspace>() {
			override readonly uri = URI.file('/workspace');
		}();
		const activeSession = new class extends mock<IActiveSession>() {
			override readonly providerId = 'hidden-provider';
			override readonly sessionType = 'hidden-type';
			override readonly workspace = constObservable(workspace);
			override readonly isQuickChat = constObservable(false);
		}();
		const chat = new class extends mock<IChat>() { }();
		const createdSession = new class extends mock<ISession>() {
			override readonly mainChat = constObservable(chat);
		}();
		let openOptions: IOpenNewSessionOptions | undefined;
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(activeSession);
			override async openNewSession(options?: IOpenNewSessionOptions) {
				openOptions = options;
				return { session: createdSession, trustDeclined: false };
			}
		}();
		const sent: { session: ISession; query: string }[] = [];
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override isNewSessionTargetAvailable(): boolean { return false; }
			override async sendNewChatRequest(session: ISession, options: { query: string }): Promise<void> {
				sent.push({ session, query: options.query });
			}
		}();
		const targetSession = observableValue<URI | undefined>('targetSession', URI.parse('agent-host-copilot:/existing'));
		const hasDraftTarget = observableValue<boolean>('hasDraftTarget', false);
		const voiceSessionController = new class extends mock<IVoiceSessionController>() {
			override readonly targetSession = targetSession;
			override readonly hasDraftTarget = hasDraftTarget;
			override setDraftTarget(): void {
				targetSession.set(undefined, undefined);
				hasDraftTarget.set(true, undefined);
			}
			override setTargetSession(resource: URI | undefined): void {
				hasDraftTarget.set(false, undefined);
				targetSession.set(resource, undefined);
			}
		}();

		const result = await prepareNewVoiceSession(
			'refactor the upload service',
			sessionsService,
			sessionsManagementService,
			voiceSessionController,
			() => false,
			() => ({ dispose() { } }),
			new NullLogService(),
		);

		assert.deepStrictEqual({
			result,
			hasDraftTarget: hasDraftTarget.get(),
			openOptions,
			sent,
		}, {
			result: 'sent',
			hasDraftTarget: true,
			openOptions: {
				folderUri: workspace.uri,
				providerId: 'hidden-provider',
			},
			sent: [{ session: createdSession, query: 'refactor the upload service' }],
		});
	});

	test('preserves an available harness for a voice-requested session', async () => {
		const workspace = new class extends mock<ISessionWorkspace>() {
			override readonly uri = URI.file('/workspace');
		}();
		const activeSession = new class extends mock<IActiveSession>() {
			override readonly providerId = 'selected-provider';
			override readonly sessionType = 'selected-type';
			override readonly workspace = constObservable(workspace);
			override readonly isQuickChat = constObservable(false);
		}();
		const createdSession = new class extends mock<ISession>() { }();
		let openOptions: IOpenNewSessionOptions | undefined;
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(activeSession);
			override async openNewSession(options?: IOpenNewSessionOptions) {
				openOptions = options;
				return { session: createdSession, trustDeclined: false };
			}
		}();
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override isNewSessionTargetAvailable(_folderUri: URI, options?: ICreateNewSessionOptions): boolean {
				return options?.providerId === 'selected-provider' && options.sessionTypeId === 'selected-type';
			}
		}();
		const voiceSessionController = new class extends mock<IVoiceSessionController>() {
			override readonly targetSession = constObservable<URI | undefined>(undefined);
			override readonly hasDraftTarget = constObservable(false);
			override setDraftTarget(): void { }
		}();

		const result = await prepareNewVoiceSession(
			'',
			sessionsService,
			sessionsManagementService,
			voiceSessionController,
			() => false,
			() => ({ dispose() { } }),
			new NullLogService(),
		);

		assert.deepStrictEqual({ result, openOptions }, {
			result: 'prepared',
			openOptions: {
				folderUri: workspace.uri,
				providerId: 'selected-provider',
				sessionTypeId: 'selected-type',
			},
		});
	});

	test('restores the previous voice target when new-session preparation is declined', async () => {
		const previousTarget = URI.parse('agent-host-copilot:/existing');
		const workspace = new class extends mock<ISessionWorkspace>() {
			override readonly uri = URI.file('/workspace');
		}();
		const activeSession = new class extends mock<IActiveSession>() {
			override readonly workspace = constObservable(workspace);
			override readonly isQuickChat = constObservable(false);
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(activeSession);
			override async openNewSession() {
				return { session: undefined, trustDeclined: true };
			}
		}();
		const targetSession = observableValue<URI | undefined>('targetSession', previousTarget);
		const hasDraftTarget = observableValue<boolean>('hasDraftTarget', false);
		const voiceSessionController = new class extends mock<IVoiceSessionController>() {
			override readonly targetSession = targetSession;
			override readonly hasDraftTarget = hasDraftTarget;
			override setDraftTarget(): void {
				targetSession.set(undefined, undefined);
				hasDraftTarget.set(true, undefined);
			}
			override setTargetSession(resource: URI | undefined): void {
				hasDraftTarget.set(false, undefined);
				targetSession.set(resource, undefined);
			}
		}();

		const result = await prepareNewVoiceSession(
			'refactor the upload service',
			sessionsService,
			new class extends mock<ISessionsManagementService>() { }(),
			voiceSessionController,
			() => false,
			() => ({ dispose() { } }),
			new NullLogService(),
		);

		assert.deepStrictEqual({
			result,
			targetSession: targetSession.get()?.toString(),
			hasDraftTarget: hasDraftTarget.get(),
		}, {
			result: 'failed',
			targetSession: previousTarget.toString(),
			hasDraftTarget: false,
		});
	});
});
