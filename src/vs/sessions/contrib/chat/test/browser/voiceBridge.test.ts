/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IVoiceSessionController } from '../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { INewChatVoiceComposer, NewChatVoiceTargetService } from '../../browser/newChatVoice.js';
import { SessionsVoiceNewComposerContribution } from '../../browser/voiceBridge.contribution.js';

suite('SessionsVoiceNewComposerContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function composer(routesWhileSessionActive = false): INewChatVoiceComposer {
		return {
			onDidFocus: Event.None,
			routesWhileSessionActive,
			sendQuery: () => { },
			prefillInput: () => { },
			focus: () => { },
		};
	}

	function createController(isConnected: ISettableObservable<boolean>) {
		let disconnectCount = 0;
		const controller = new class extends mock<IVoiceSessionController>() {
			override readonly isConnected = isConnected;
			override readonly isConnecting = constObservable(false);
			override disconnect(): void { disconnectCount++; }
		};
		return { controller, getDisconnectCount: () => disconnectCount };
	}

	test('disconnects when a fresh welcome composer takes over a connected voice session', () => {
		const target = disposables.add(new NewChatVoiceTargetService());
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

	test('keeps voice connected when switching to an in-session composer that opts to route', () => {
		const target = disposables.add(new NewChatVoiceTargetService());
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
		const target = disposables.add(new NewChatVoiceTargetService());
		const isConnected = observableValue<boolean>('isConnected', false);
		const { controller, getDisconnectCount } = createController(isConnected);

		const a = composer();
		disposables.add(target.registerComposer(a));
		disposables.add(new SessionsVoiceNewComposerContribution(controller, target));

		const b = composer();
		disposables.add(target.registerComposer(b));

		assert.strictEqual(getDisconnectCount(), 0);
	});
});
