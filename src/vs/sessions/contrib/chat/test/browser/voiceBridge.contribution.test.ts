/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IVoiceSessionController } from '../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat } from '../../../../services/sessions/common/session.js';
import { SessionsVoiceActiveSessionContribution, SessionsVoiceListeningContribution } from '../../browser/voiceBridge.contribution.js';
import { INewChatVoiceComposer, INewChatVoiceTargetService, NEW_CHAT_VOICE_SENTINEL } from '../../browser/newChatVoice.js';

suite('SessionsVoiceActiveSessionContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes connected voice mode to the new-session composer', () => {
		const chatResource = URI.parse('test:///chat');
		const createdSession = upcastPartial<IActiveSession>({
			isCreated: constObservable(true),
			activeChat: constObservable(upcastPartial<IChat>({ resource: chatResource })),
		});
		const draftSession = upcastPartial<IActiveSession>({
			isCreated: constObservable(false),
			activeChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:///draft-chat') })),
		});
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', createdSession);
		const activeComposer = observableValue<INewChatVoiceComposer | undefined>('activeComposer', {
			onDidFocus: Event.None,
			sendQuery: () => undefined,
			prefillInput: () => undefined,
			focus: () => undefined,
		});
		const shownResources: Array<string | undefined> = [];
		disposables.add(new SessionsVoiceActiveSessionContribution(
			upcastPartial<IVoiceSessionController>({
				setActiveSessionShown: resource => shownResources.push(resource?.toString()),
			}),
			upcastPartial<ISessionsService>({ activeSession }),
			upcastPartial<INewChatVoiceTargetService>({ activeComposer }),
		));

		activeSession.set(draftSession, undefined);
		activeComposer.set(undefined, undefined);

		assert.deepStrictEqual(shownResources, [
			chatResource.toString(),
			NEW_CHAT_VOICE_SENTINEL.toString(),
			undefined,
		]);
	});

	test('keeps listening when opening the new-session composer', () => {
		const firstChatResource = URI.parse('test:///first-chat');
		const secondChatResource = URI.parse('test:///second-chat');
		const createdSession = upcastPartial<IActiveSession>({
			isCreated: constObservable(true),
			activeChat: constObservable(upcastPartial<IChat>({ resource: firstChatResource })),
		});
		const draftSession = upcastPartial<IActiveSession>({
			isCreated: constObservable(false),
			activeChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:///draft-chat') })),
		});
		const secondCreatedSession = upcastPartial<IActiveSession>({
			isCreated: constObservable(true),
			activeChat: constObservable(upcastPartial<IChat>({ resource: secondChatResource })),
		});
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', createdSession);
		const activeComposer = observableValue<INewChatVoiceComposer | undefined>('activeComposer', {
			onDidFocus: Event.None,
			sendQuery: () => undefined,
			prefillInput: () => undefined,
			focus: () => undefined,
		});
		const listeningChanges: string[] = [];
		disposables.add(new SessionsVoiceListeningContribution(
			upcastPartial<IVoiceSessionController>({
				isConnected: constObservable(true),
				voiceState: constObservable<'listening'>('listening'),
				targetSession: constObservable(undefined),
				transcriptTurns: constObservable([]),
				discardListening: () => listeningChanges.push('discard'),
				finishListeningAndSubmitTo: resource => listeningChanges.push(`submit:${resource.toString()}`),
			}),
			upcastPartial<ISessionsService>({ activeSession }),
			upcastPartial<INewChatVoiceTargetService>({ activeComposer }),
		));

		activeSession.set(draftSession, undefined);
		activeSession.set(secondCreatedSession, undefined);

		assert.deepStrictEqual(listeningChanges, ['discard']);
	});
});
