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

	test('re-enables a warm microphone on the next press and disables it on abort', async () => {
		const track = new class extends mock<MediaStreamTrack>() {
			override enabled = true;
			override muted = false;
			override addEventListener(): void { }
			override removeEventListener(): void { }
			override stop(): void { }
		}();
		const stream = new class extends mock<MediaStream>() {
			override getTracks(): MediaStreamTrack[] { return [track]; }
			override getAudioTracks(): MediaStreamTrack[] { return [track]; }
		}();
		const targetWindow = Object.create(mainWindow) as Window & typeof globalThis;
		Object.defineProperties(targetWindow, {
			navigator: { value: { mediaDevices: { getUserMedia: async () => stream } } },
			AudioContext: {
				value: class extends mock<AudioContext>() {
					override sampleRate = 16000;
					override destination = new class extends mock<AudioDestinationNode>() { };
					override audioWorklet = new class extends mock<AudioWorklet>() {
						override async addModule(): Promise<void> { }
					}();
					override createMediaStreamSource(): MediaStreamAudioSourceNode {
						return new class extends mock<MediaStreamAudioSourceNode>() {
							override connect(): AudioNode { return this; }
						}();
					}
					override createAnalyser(): AnalyserNode {
						return new class extends mock<AnalyserNode>() { override fftSize = 256; };
					}
					override async close(): Promise<void> { }
				},
			},
			AudioWorkletNode: {
				value: class extends mock<AudioWorkletNode>() {
					override port = new class extends mock<MessagePort>() {
						override onmessage = null;
					}();
					override connect(): AudioNode { return this; }
					override disconnect(): void { }
				},
			},
		});
		const service = store.add(new class extends MicCaptureService {
			protected override getMediaCaptureWindow(): Window & typeof globalThis { return targetWindow; }
		}(store.add(new TestStorageService()), new TestNotificationService(), new NullLogService()));
		service.prepare(targetWindow);
		await service.startCapture(targetWindow);
		const warm = track.enabled;
		await service.pttDown('turn-1');
		const firstPress = track.enabled;
		service.isMuted = true;
		const muted = track.enabled;
		service.isMuted = false;
		service.abortPtt();
		const aborted = track.enabled;
		await service.pttDown('turn-2');
		assert.deepStrictEqual({ warm, firstPress, muted, aborted, nextPress: track.enabled }, {
			warm: false, firstPress: true, muted: false, aborted: false, nextPress: true,
		});
	});

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
