/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IVoiceSessionController } from '../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { IChat, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { INewChatVoiceComposer, NewChatVoiceTargetService } from '../../browser/newChatVoice.js';
import { prepareNewVoiceSession, SessionsVoiceNewComposerContribution } from '../../browser/voiceBridge.contribution.js';

suite('SessionsVoiceNewComposerContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function composer(routesWhileSessionActive = false): INewChatVoiceComposer {
		return {
			onDidFocus: Event.None,
			routesWhileSessionActive,
			sendQuery: () => { },
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
		const { controller, hasDraftTarget, getDisconnectCount } = createController(isConnected);

		const a = composer();
		disposables.add(target.registerComposer(a));
		isConnected.set(true, undefined);
		disposables.add(new SessionsVoiceNewComposerContribution(controller, target));

		hasDraftTarget.set(true, undefined);
		const b = composer();
		disposables.add(target.registerComposer(b));

		assert.strictEqual(getDisconnectCount(), 0);
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

	test('creates and sends a voice-requested session without waiting for its composer', async () => {
		const workspace = new class extends mock<ISessionWorkspace>() {
			override readonly uri = URI.file('/workspace');
		}();
		const activeSession = new class extends mock<IActiveSession>() {
			override readonly workspace = constObservable(workspace);
			override readonly isQuickChat = constObservable(false);
		}();
		const chat = new class extends mock<IChat>() { }();
		const createdSession = new class extends mock<ISession>() {
			override readonly mainChat = constObservable(chat);
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(activeSession);
			override async openNewSession() {
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
		let draftTargetSet = false;
		const voiceSessionController = new class extends mock<IVoiceSessionController>() {
			override setDraftTarget(): void { draftTargetSet = true; }
		}();

		const result = await prepareNewVoiceSession(
			'refactor the upload service',
			sessionsService,
			sessionsManagementService,
			voiceSessionController,
			() => false,
			new NullLogService(),
		);

		assert.deepStrictEqual({
			result,
			draftTargetSet,
			sent,
		}, {
			result: 'sent',
			draftTargetSet: true,
			sent: [{ session: createdSession, query: 'refactor the upload service' }],
		});
	});
});
