/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { MIC_CAPTURE_CHUNK_SIZE, MicCaptureService } from '../../../browser/voiceClient/micCaptureService.js';

suite('MicCaptureService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('buffers 32 ms voice chunks at 16 kHz', () => {
		assert.deepStrictEqual({
			samples: MIC_CAPTURE_CHUNK_SIZE,
			durationMs: MIC_CAPTURE_CHUNK_SIZE / 16,
		}, {
			samples: 512,
			durationMs: 32,
		});
	});

	test('propagates capture setup failures after cleaning up acquired resources', async () => {
		const setupError = new Error('audio source setup failed');
		let trackStopCalls = 0;
		const track = new class extends mock<MediaStreamTrack>() {
			override stop(): void { trackStopCalls++; }
		}();
		const stream = new class extends mock<MediaStream>() {
			override getTracks(): MediaStreamTrack[] { return [track]; }
			override getAudioTracks(): MediaStreamTrack[] { return []; }
		}();
		const targetWindow = Object.create(mainWindow) as Window & typeof globalThis;
		Object.defineProperties(targetWindow, {
			navigator: {
				value: {
					mediaDevices: {
						getUserMedia: async () => stream,
					},
				},
			},
			AudioContext: {
				value: class {
					close(): Promise<void> { return Promise.resolve(); }
					createMediaStreamSource(): never { throw setupError; }
				},
			},
		});
		const service = store.add(new class extends MicCaptureService {
			protected override getMediaCaptureWindow(targetWindow: Window & typeof globalThis): Window & typeof globalThis {
				return targetWindow;
			}
		}(
			store.add(new TestStorageService()),
			new TestNotificationService(),
			new NullLogService(),
		));
		service.prepare(targetWindow);

		await assert.rejects(() => service.pttDown('turn-1'), error => error === setupError);
		assert.deepStrictEqual({
			isCapturing: service.isCapturing,
			trackStopCalls,
		}, {
			isCapturing: false,
			trackStopCalls: 1,
		});
	});
});
