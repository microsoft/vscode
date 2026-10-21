/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Event as VSCodeEvent } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { RecordingState } from '../../browser/recordingService.js';
import { NativeRecordingService } from '../../electron-browser/nativeRecordingService.js';

class TestTrack extends mock<MediaStreamTrack>() {
	constructor(override readonly kind = 'video') { super(); }
	override readyState: MediaStreamTrackState = 'live';
	override onended: MediaStreamTrack['onended'] = null;
	stopCount = 0;

	override stop(): void {
		this.stopCount++;
		this.readyState = 'ended';
	}

	end(): void {
		this.readyState = 'ended';
		this.onended?.(new Event('ended'));
	}
}

class TestStream extends mock<MediaStream>() {
	constructor(private readonly tracks: TestTrack[]) { super(); }
	override getTracks(): MediaStreamTrack[] { return this.tracks; }
	override getVideoTracks(): MediaStreamTrack[] { return this.tracks.filter(track => track.kind === 'video'); }
}

class TestNativeRecordingService extends NativeRecordingService {
	constructor(
		private readonly devices: MediaDevices,
		private readonly recorderConstructor: typeof MediaRecorder,
		nativeHostService: INativeHostService,
		private readonly playableFormats?: readonly string[],
	) {
		super(new NullLogService(), nativeHostService);
	}

	protected override getMediaDevices(): MediaDevices {
		return this.devices;
	}

	protected override getMediaRecorderConstructor(): typeof MediaRecorder {
		return this.recorderConstructor;
	}

	protected override canPlayType(mimeType: string): boolean {
		return this.playableFormats?.includes(mimeType) ?? super.canPlayType(mimeType);
	}
}

suite('NativeRecordingService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(options: {
		tracks?: TestTrack[];
		failure?: 'media' | 'constructor' | 'start' | 'requestData' | 'stop';
		captureGate?: DeferredPromise<void>;
		deferStart?: boolean;
		deferStop?: boolean;
		empty?: boolean;
		formats?: string[];
		playableFormats?: string[];
	} = {}) {
		const tracks = options.tracks ?? [new TestTrack()];
		const stream = new TestStream(tracks);
		const recorders: TestRecorder[] = [];
		const recorderCreated = new DeferredPromise<void>();
		class TestRecorder extends mock<MediaRecorder>() {
			static isTypeSupported(mimeType: string): boolean { return (options.formats ?? ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']).includes(mimeType); }
			override state: 'inactive' | 'recording' | 'paused' = 'inactive';
			override readonly mimeType: string;
			override ondataavailable: MediaRecorder['ondataavailable'] = null;
			override onstop: MediaRecorder['onstop'] = null;
			override onerror: MediaRecorder['onerror'] = null;
			override onstart: MediaRecorder['onstart'] = null;
			stopCount = 0;

			constructor(_stream: MediaStream, recorderOptions?: MediaRecorderOptions) {
				super();
				if (options.failure === 'constructor') {
					throw new Error('constructor failure');
				}
				this.mimeType = recorderOptions?.mimeType ?? 'video/webm';
				recorders.push(this);
				void recorderCreated.complete();
			}

			override start(): void {
				if (options.failure === 'start') {
					throw new Error('start failure');
				}
				this.state = 'recording';
				if (!options.deferStart) {
					this.finishStart();
				}
			}

			finishStart(): void {
				this.onstart?.(new Event('start'));
			}

			override requestData(): void {
				if (options.failure === 'requestData') {
					throw new Error('requestData failure');
				}
				this.emitData();
			}

			emitData(): void {
				if (!options.empty) {
					this.ondataavailable?.(new BlobEvent('dataavailable', { data: new Blob(['video']) }));
				}
			}

			override stop(): void {
				this.stopCount++;
				if (options.failure === 'stop') {
					throw new Error('stop failure');
				}
				this.state = 'inactive';
				if (!options.deferStop) {
					this.finishStop();
				}
			}

			finishStop(): void {
				this.emitData();
				this.onstop?.(new Event('stop'));
			}

			fail(): void {
				this.onerror?.(new ErrorEvent('error', { message: 'recorder failure' }));
			}
		}
		const devices = new class extends mock<MediaDevices>() {
			override async getDisplayMedia(): Promise<MediaStream> {
				await options.captureGate?.p;
				if (options.failure === 'media') {
					throw new Error('media failure');
				}
				return stream;
			}
		}();
		const nativeCalls: string[] = [];
		const nativeHost = new class extends mock<INativeHostService>() {
			override async getMediaAccessStatus(): Promise<'granted'> { return 'granted'; }
			override async requestScreenCaptureAccess(): Promise<boolean> { nativeCalls.push('request'); return true; }
			override async openExternal(url: string): Promise<boolean> { nativeCalls.push(url); return true; }
		}();
		const service = store.add(new TestNativeRecordingService(devices, TestRecorder, nativeHost, options.playableFormats ?? options.formats ?? ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']));
		return { service, tracks, recorders, devices, nativeCalls, recorderCreated };
	}

	function snapshot(service: NativeRecordingService, tracks: TestTrack[], recorders: MediaRecorder[]) {
		return {
			state: service.state,
			stoppedTracks: tracks.map(track => track.stopCount),
			pendingHandlers: recorders.some(recorder => recorder.onstart || recorder.ondataavailable || recorder.onstop || recorder.onerror),
			pendingTrackHandlers: tracks.some(track => track.onended),
		};
	}

	const idleSnapshot = { state: RecordingState.Idle, stoppedTracks: [1], pendingHandlers: false, pendingTrackHandlers: false };

	for (const failure of ['media', 'constructor', 'start'] as const) {
		test(`cleans up after ${failure} failure`, async () => {
			const { service, tracks, recorders } = createService({ failure });
			await assert.rejects(service.startRecording());
			assert.deepStrictEqual(snapshot(service, tracks, recorders), { ...idleSnapshot, stoppedTracks: [failure === 'media' ? 0 : 1] });
		});
	}

	for (const ended of [false, true]) {
		test(`rejects a ${ended ? 'terminated' : 'missing'} video track`, async () => {
			const tracks = ended ? [new TestTrack()] : [];
			if (tracks[0]) {
				tracks[0].readyState = 'ended';
			}
			const { service, recorders } = createService({ tracks });
			await assert.rejects(service.startRecording(), /recording|capture/i);
			assert.deepStrictEqual({
				state: service.state, stoppedTracks: tracks.map(track => track.stopCount), recorders: recorders.length,
			}, { state: RecordingState.Idle, stoppedTracks: ended ? [1] : [], recorders: 0 });
		});
	}

	test('releases an audio-only stream when no video track is present', async () => {
		const { service, tracks, recorders } = createService({ tracks: [new TestTrack('audio')] });
		await assert.rejects(service.startRecording(), /recording/i);
		assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
	});

	for (const format of ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
		test(`records and explicitly stops ${format} without an external stop event`, async () => {
			const { service, tracks, recorders } = createService({ formats: [format] });
			const states: RecordingState[] = [];
			store.add(service.onDidChangeState(state => states.push(state)));
			await service.startRecording('video/mp4');
			const data = await service.stopRecording();
			assert.deepStrictEqual({
				...snapshot(service, tracks, recorders), states, mimeType: data?.mimeType, size: data?.sizeBytes, content: await data?.blob.text(),
			}, { ...idleSnapshot, states: [RecordingState.Recording, RecordingState.Idle], mimeType: format, size: 10, content: 'videovideo' });
		});
	}

	test('honors a supported format preference', async () => {
		const { service } = createService();
		await service.startRecording('video/webm');
		assert.strictEqual((await service.stopRecording())?.mimeType, 'video/webm');
	});

	test('only uses formats that can also be decoded', async () => {
		const { service } = createService({ playableFormats: ['video/mp4'] });
		await service.startRecording('video/webm');
		const data = await service.stopRecording();
		const { service: unsupported } = createService({ playableFormats: [] });
		await assert.rejects(unsupported.startRecording(), /not supported/);
		assert.deepStrictEqual({
			supported: service.isSupported,
			formats: service.getSupportedFormats(),
			fallback: data?.mimeType,
			unsupported: { isSupported: unsupported.isSupported, formats: unsupported.getSupportedFormats() },
		}, {
			supported: true,
			formats: [{ mimeType: 'video/mp4', label: 'MP4', extension: 'mp4' }],
			fallback: 'video/mp4',
			unsupported: { isSupported: false, formats: [] },
		});
	});

	test('external track stop preserves the final recording data', async () => {
		const { service, tracks, recorders } = createService();
		const states: RecordingState[] = [];
		store.add(service.onDidChangeState(state => states.push(state)));
		await service.startRecording();
		tracks[0].end();
		const data = await service.stopRecording();
		assert.deepStrictEqual({
			...snapshot(service, tracks, recorders), states, content: await data?.blob.text(),
		}, { ...idleSnapshot, states: [RecordingState.Recording, RecordingState.Stopped, RecordingState.Idle], content: 'video' });
	});

	test('size-limited stop keeps final muxer data', async () => {
		const { service, recorders } = createService();
		await service.startRecording();
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Reach the size boundary without allocating a 90 MB test blob.
		service['bytesRecorded'] = 90 * 1024 * 1024 - 5;
		recorders[0].emitData();
		const data = await service.stopRecording();
		assert.deepStrictEqual({ content: await data?.blob.text(), stoppedBySize: data?.stoppedBySize, stops: recorders[0].stopCount }, {
			content: 'videovideo', stoppedBySize: true, stops: 1,
		});
	});

	for (const action of ['discard', 'dispose', 'stop'] as const) {
		test(`${action} cancels a pending capture and releases the late stream`, async () => {
			const captureGate = new DeferredPromise<void>();
			const { service, tracks, recorders } = createService({ captureGate });
			const start = assert.rejects(service.startRecording(), isCancellationError);
			if (action === 'discard') {
				service.discardRecording();
			} else if (action === 'dispose') {
				service.dispose();
			} else {
				await service.stopRecording();
			}
			await captureGate.complete();
			await start;
			assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
		});
	}

	test('a late cancelled capture cannot replace a subsequent recording', async () => {
		const captureGate = new DeferredPromise<void>();
		const { service, tracks, devices } = createService({ captureGate });
		const oldStart = assert.rejects(service.startRecording(), isCancellationError);
		service.discardRecording();
		const nextTrack = new TestTrack();
		devices.getDisplayMedia = async () => new TestStream([nextTrack]);
		await service.startRecording();
		await captureGate.complete();
		await oldStart;
		assert.deepStrictEqual({ state: service.state, oldStops: tracks[0].stopCount, nextStops: nextTrack.stopCount }, {
			state: RecordingState.Recording, oldStops: 1, nextStops: 0,
		});
		await service.stopRecording();
	});

	test('rejects overlapping starts without disturbing the first capture', async () => {
		const captureGate = new DeferredPromise<void>();
		const { service, tracks, recorders } = createService({ captureGate });
		const firstStart = service.startRecording();
		await assert.rejects(service.startRecording(), /already in progress/);
		await captureGate.complete();
		await firstStart;
		assert.deepStrictEqual({ state: service.state, stops: tracks[0].stopCount, recorders: recorders.length }, {
			state: RecordingState.Recording, stops: 0, recorders: 1,
		});
	});

	for (const failure of ['ended', 'error', 'dispose'] as const) {
		test(`cleans up ${failure} before MediaRecorder confirms start`, async () => {
			const { service, tracks, recorders, recorderCreated } = createService({ deferStart: true });
			const start = assert.rejects(service.startRecording());
			await recorderCreated.p;
			if (failure === 'ended') {
				tracks[0].end();
			} else if (failure === 'error') {
				recorders[0].fail();
			} else {
				service.dispose();
			}
			await start;
			assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
		});
	}

	for (const failure of ['requestData', 'stop'] as const) {
		test(`releases resources when ${failure} throws during stop`, async () => {
			const { service, tracks, recorders } = createService({ failure });
			await service.startRecording();
			await assert.rejects(service.stopRecording());
			assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
		});
	}

	test('discard settles an explicit stop awaiting its final callback', async () => {
		const { service, tracks, recorders } = createService({ deferStop: true });
		await service.startRecording();
		const stop = service.stopRecording();
		assert.strictEqual(service.stopRecording(), stop);
		service.discardRecording();
		assert.deepStrictEqual({ ...snapshot(service, tracks, recorders), data: await stop }, { ...idleSnapshot, data: undefined });
	});

	test('waits for final data from an externally stopping recorder', async () => {
		const { service, tracks, recorders } = createService({ deferStop: true });
		await service.startRecording();
		tracks[0].end();
		const stopped = service.stopRecording();
		recorders[0].finishStop();
		const data = await stopped;
		assert.deepStrictEqual({
			...snapshot(service, tracks, recorders), content: await data?.blob.text(), stops: recorders[0].stopCount,
		}, { ...idleSnapshot, content: 'video', stops: 1 });
	});

	test('an active recorder error releases resources before notifying callers', async () => {
		const { service, tracks, recorders } = createService();
		const errors: string[] = [];
		store.add(service.onDidFailRecording(error => {
			errors.push(error.message);
			assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
		}));
		await service.startRecording();
		recorders[0].fail();
		assert.strictEqual(errors.length, 1);
	});

	test('external stop failures release resources and report an error', async () => {
		const { service, tracks, recorders } = createService({ failure: 'stop' });
		const errors: Error[] = [];
		store.add(service.onDidFailRecording(error => errors.push(error)));
		await service.startRecording();
		tracks[0].end();
		assert.deepStrictEqual({ ...snapshot(service, tracks, recorders), errors: errors.length }, { ...idleSnapshot, errors: 1 });
	});

	test('empty recordings fail instead of returning a successful-looking result', async () => {
		const { service, tracks, recorders } = createService({ empty: true });
		await service.startRecording();
		await assert.rejects(service.stopRecording(), /No video/);
		assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
	});

	test('failed acquisition after an external stop resets Stopped to Idle', async () => {
		const options: { failure?: 'media' } = {};
		const { service, tracks, recorders } = createService(options);
		await service.startRecording();
		tracks[0].end();
		options.failure = 'media';
		await assert.rejects(service.startRecording());
		assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
	});

	test('disposal releases an active recorder and rejects subsequent starts', async () => {
		const { service, tracks, recorders } = createService();
		await service.startRecording();
		service.dispose();
		await assert.rejects(service.startRecording(), isCancellationError);
		assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
	});

	test('recorder error rejects a pending stop and releases its callbacks', async () => {
		const { service, tracks, recorders } = createService({ deferStop: true });
		await service.startRecording();
		const stopped = assert.rejects(service.stopRecording());
		recorders[0].fail();
		await stopped;
		assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
	});

	for (const operation of ['start', 'stop'] as const) {
		test(`times out a missing ${operation} callback and releases resources`, () => runWithFakedTimers({}, async () => {
			const { service, tracks, recorders } = createService({ deferStart: operation === 'start', deferStop: operation === 'stop' });
			if (operation === 'start') {
				await assert.rejects(service.startRecording(), /Unable to start/);
			} else {
				await service.startRecording();
				await assert.rejects(service.stopRecording(), /did not finish/);
			}
			assert.deepStrictEqual(snapshot(service, tracks, recorders), idleSnapshot);
		}));
	}

	test('settings navigation does not request permission again', async () => {
		const { service, nativeCalls } = createService();
		await service.requestScreenCapturePermission();
		await service.openScreenCapturePermissionSettings();
		assert.deepStrictEqual(nativeCalls, isMacintosh
			? ['request', 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']
			: ['request']);
	});

	for (const mimeType of ['video/mp4', 'video/webm']) {
		test(`only advertises and round-trips playable ${mimeType} without OS capture`, async () => {
			const canvas = mainWindow.document.createElement('canvas');
			const video = mainWindow.document.createElement('video');
			canvas.width = 32;
			canvas.height = 24;
			const context = canvas.getContext('2d')!;
			const stream = canvas.captureStream(30);
			store.add(toDisposable(() => stream.getTracks().forEach(track => track.stop())));
			let frame = 0;
			const timer = mainWindow.setInterval(() => {
				context.fillStyle = frame++ % 2 ? 'red' : 'blue';
				context.fillRect(0, 0, canvas.width, canvas.height);
			}, 30);
			store.add(toDisposable(() => mainWindow.clearInterval(timer)));
			const firstChunk = new DeferredPromise<void>();
			class ObservedMediaRecorder extends MediaRecorder {
				constructor(capturedStream: MediaStream, options?: MediaRecorderOptions) {
					super(capturedStream, options);
					store.add(VSCodeEvent.fromDOMEventEmitter<BlobEvent>(this, 'dataavailable')(event => {
						if (event.data.size) {
							void firstChunk.complete();
						}
					}));
				}
			}
			const devices = new class extends mock<MediaDevices>() {
				override async getDisplayMedia(): Promise<MediaStream> { return stream; }
			}();
			const service = store.add(new TestNativeRecordingService(devices, ObservedMediaRecorder, new class extends mock<INativeHostService>() { }()));
			const candidates = mimeType === 'video/webm' ? ['video/webm;codecs=vp9', 'video/webm'] : [mimeType];
			const capabilities = candidates.map(candidate => ({
				mimeType: candidate,
				recordable: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate),
				playable: !!video.canPlayType(candidate),
			}));
			const format = service.getSupportedFormats().find(format => candidates.includes(format.mimeType));
			if (!format) {
				assert.ok(capabilities.every(capability => !capability.recordable || !capability.playable), JSON.stringify(capabilities));
				return;
			}
			assert.ok(capabilities.some(capability => capability.mimeType === format.mimeType && capability.recordable && capability.playable));
			await Promise.all([service.startRecording(format.mimeType), firstChunk.p]);
			const data = await service.stopRecording();
			assert.ok(data?.sizeBytes);

			const url = URL.createObjectURL(data.blob);
			store.add(toDisposable(() => {
				video.pause();
				video.removeAttribute('src');
				video.load();
				URL.revokeObjectURL(url);
			}));
			const decoded = new Promise<void>((resolve, reject) => {
				store.add(VSCodeEvent.once(VSCodeEvent.fromDOMEventEmitter(video, 'loadeddata'))(() => resolve()));
				store.add(VSCodeEvent.once(VSCodeEvent.fromDOMEventEmitter(video, 'error'))(() => reject(new Error(`Recorded video could not be decoded: ${video.error?.code ?? 'unknown'} ${video.error?.message ?? ''}`.trim()))));
			});
			video.muted = true;
			video.src = url;
			video.load();
			await decoded;
			await video.play();
			assert.deepStrictEqual({
				state: service.state, width: video.videoWidth, height: video.videoHeight, mimeType: data.mimeType.split(';')[0],
			}, { state: RecordingState.Idle, width: 32, height: 24, mimeType });
		}).timeout(10000);
	}
});
