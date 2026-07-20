/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatDictationController } from '../../../browser/speechToText/dictationSession.js';
import { startDictationWithHoldMode } from '../../../browser/speechToText/dictationMode.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../../browser/speechToText/chatSpeechToTextService.js';

class TestSpeechToTextService implements IChatSpeechToTextService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeState = Event.None;
	readonly onDidUpdateTranscript = Event.None;
	readonly onDidFail = Event.None;
	readonly onDidChangePreparingModel = Event.None;
	state = ChatSpeechToTextState.Idle;
	readonly isConfigured = true;
	readonly isPreparingModel = false;
	async start(): Promise<void> { }
	async stopAndTranscribe(): Promise<string | undefined> { return undefined; }
	cancel(): void { }
}

class TestDictationController implements IChatDictationController {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeActive = Event.None;
	readonly isActive = false;
	readonly activeEditor = undefined;
	startCount = 0;
	stopCount = 0;
	cancelCount = 0;
	async start(): Promise<void> { this.startCount++; }
	async stop(): Promise<void> { this.stopCount++; }
	cancel(): void { this.cancelCount++; }
}

suite('Dictation mode', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers();
	});

	teardown(() => {
		clock.restore();
		sinon.restore();
	});

	test('push-to-talk cancels a short press', async () => {
		const service = new TestSpeechToTextService();
		service.state = ChatSpeechToTextState.Recording;
		const controller = new TestDictationController();
		const released = new DeferredPromise<void>();

		const running = startDictationWithHoldMode({
			mode: 'pushToTalk',
			holdMode: released.p,
			speechToTextService: service,
			dictationController: controller,
			start: () => controller.start(),
		});
		clock.tick(100);
		released.complete();
		await running;

		assert.deepStrictEqual({ starts: controller.startCount, stops: controller.stopCount, cancels: controller.cancelCount }, {
			starts: 1,
			stops: 0,
			cancels: 1,
		});
	});

	test('held dictation stops after release', async () => {
		const service = new TestSpeechToTextService();
		service.state = ChatSpeechToTextState.Recording;
		const controller = new TestDictationController();
		const released = new DeferredPromise<void>();

		const running = startDictationWithHoldMode({
			mode: 'auto',
			holdMode: released.p,
			speechToTextService: service,
			dictationController: controller,
			start: () => controller.start(),
		});
		clock.tick(501);
		released.complete();
		await running;

		assert.deepStrictEqual({ starts: controller.startCount, stops: controller.stopCount, cancels: controller.cancelCount }, {
			starts: 1,
			stops: 1,
			cancels: 0,
		});
	});

	test('release while starting cancels instead of recording later', async () => {
		const service = new TestSpeechToTextService();
		service.state = ChatSpeechToTextState.Starting;
		const controller = new TestDictationController();
		const released = new DeferredPromise<void>();

		const running = startDictationWithHoldMode({
			mode: 'auto',
			holdMode: released.p,
			speechToTextService: service,
			dictationController: controller,
			start: () => controller.start(),
		});
		clock.tick(501);
		released.complete();
		await running;

		assert.deepStrictEqual({ starts: controller.startCount, stops: controller.stopCount, cancels: controller.cancelCount }, {
			starts: 1,
			stops: 0,
			cancels: 1,
		});
	});
});
