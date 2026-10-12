/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { MainThreadSpeechShape } from '../../common/extHost.protocol.js';
import { ExtHostSpeech } from '../../common/extHostSpeech.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostSpeech', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not restore a text-to-speech session that resolves after cancellation', async () => {
		let providerHandle = 0;
		const proxy = new class extends mock<MainThreadSpeechShape>() {
			override $registerProvider(handle: number): void { providerHandle = handle; }
			override $unregisterProvider(): void { }
		}();
		const speech = new ExtHostSpeech(SingleProxyRPCProtocol(proxy));
		const pendingSession = new DeferredPromise<vscode.TextToSpeechSession>();
		const synthesized: string[] = [];
		store.add(speech.registerProvider(new ExtensionIdentifier('test.speech'), 'test', {
			provideSpeechToTextSession: () => undefined,
			provideKeywordRecognitionSession: () => undefined,
			provideTextToSpeechSession: () => pendingSession.p
		}));

		const creation = speech.$createTextToSpeechSession(providerHandle, 1);
		await speech.$cancelTextToSpeechSession(1);
		await pendingSession.complete({ onDidChange: Event.None, synthesize: text => { synthesized.push(text); } });
		await creation;
		// Allow listeners added to an already canceled token to finish their cleanup.
		await timeout(0);
		await speech.$synthesizeSpeech(1, 'This session was canceled');

		assert.deepStrictEqual(synthesized, []);
	});
});
