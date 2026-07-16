/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { VoiceClientService } from '../../../browser/voiceClient/voiceClientService.js';
import { IVoiceBargeIn, IVoiceTranscription } from '../../../common/voiceClient/voiceClientService.js';

class TestWebSocket {
	static instance: TestWebSocket | undefined;

	readonly readyState = 3;
	onopen: (() => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;

	constructor() {
		TestWebSocket.instance = this;
	}

	close(): void { }
	send(): void { }
}

function createTestWindow(): Window & typeof globalThis {
	return new Proxy(mainWindow, {
		get(target, property, receiver) {
			if (property === 'WebSocket') {
				return TestWebSocket;
			}
			return Reflect.get(target, property, receiver);
		}
	});
}

suite('VoiceClientService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		TestWebSocket.instance = undefined;
	});

	test('emits barge-in events from the backend', async () => {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'ws://voice.test/realtime/voice',
		};
		const service = store.add(new VoiceClientService(
			new TestConfigurationService(),
			new NullLogService(),
			productService,
		));
		const events: IVoiceBargeIn[] = [];
		store.add(service.onBargeIn(event => events.push(event)));

		await service.connect(createTestWindow());
		const socket = TestWebSocket.instance;
		if (!socket?.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		socket.onmessage(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'barge_in',
				turn_id: 'interrupting-turn',
				interrupted_turn_id: 'cancelled-turn',
			}),
		}));

		assert.deepStrictEqual(events, [{
			turnId: 'interrupting-turn',
			interruptedTurnId: 'cancelled-turn',
		}]);
	});

	test('validates and translates scoped transcription metadata', async () => {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'ws://voice.test/realtime/voice',
		};
		const service = store.add(new VoiceClientService(
			new TestConfigurationService(),
			new NullLogService(),
			productService,
		));
		const events: IVoiceTranscription[] = [];
		store.add(service.onTranscription(event => events.push(event)));

		await service.connect(createTestWindow());
		const socket = TestWebSocket.instance;
		if (!socket?.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		socket.onmessage(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'transcription',
				text: 'create a file',
				status: 'partial',
				committed: 'create ',
				turn_id: 'turn-1',
				revision: 3,
			}),
		}));

		assert.deepStrictEqual(events, [{
			text: 'create a file',
			status: 'partial',
			committed: 'create ',
			turnId: 'turn-1',
			revision: 3,
		}]);
	});

	test('rejects invalid transcription status and revision', async () => {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'ws://voice.test/realtime/voice',
		};
		const service = store.add(new VoiceClientService(
			new TestConfigurationService(),
			new NullLogService(),
			productService,
		));
		const events: IVoiceTranscription[] = [];
		store.add(service.onTranscription(event => events.push(event)));

		await service.connect(createTestWindow());
		const socket = TestWebSocket.instance;
		if (!socket?.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		for (const message of [
			{ type: 'transcription', text: 'invalid status', status: 'pending' },
			{ type: 'transcription', text: 'unscoped revision', status: 'partial', revision: 1 },
			{ type: 'transcription', text: 'invalid revision', status: 'partial', turn_id: 'turn-1', revision: 1.5 },
			{ type: 'transcription', text: 'negative revision', status: 'partial', turn_id: 'turn-1', revision: -1 },
			{ type: 'transcription', text: 'legacy final' },
		]) {
			socket.onmessage(new mainWindow.MessageEvent('message', { data: JSON.stringify(message) }));
		}

		assert.deepStrictEqual(events, [{
			text: 'legacy final',
			status: 'final',
			committed: '',
			turnId: undefined,
			revision: undefined,
		}]);
	});
});
