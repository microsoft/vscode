/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { $, addDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { CapturingTelemetryService } from '../../../../../platform/telemetry/test/common/testTelemetryService.js';
import { indexReleaseNotesContent, initializeReleaseNotesTelemetry, ReleaseNotesTelemetry } from '../../browser/releaseNotesTelemetry.js';

suite('Release notes highlights video telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sample = { type: 'releaseNotesTelemetrySample', contents: [], tryouts: [], depth: 0, isScrollable: true, highlightsVideoVisible: true };

	function createTracker() {
		const service = new CapturingTelemetryService<{ action?: string; errorCode?: string; interactionCount?: number }>();
		const tracker = store.add(new ReleaseNotesTelemetry('1.147.0', 'stable', 'command', { now: () => 0, getTryout: () => undefined }, service));
		tracker.metadata.highlightsVideoVariant = 'video';
		tracker.manifest = { regions: [], links: [], tryouts: [], highlightsVideo: true };
		tracker.setVisibility(true, true);
		return { service, tracker, events: () => service.events.filter(event => event.eventName === 'releaseNotes.highlightsVideo').map(event => event.data) };
	}

	test('deduplicates visible exposure and bounded playback diagnostics per document', () => {
		const { tracker, events } = createTracker();
		tracker.receive(sample);
		tracker.receive(sample);
		for (let i = 0; i < 2; i++) {
			tracker.receive({ type: 'releaseNotesTelemetryVideo', action: 'played' });
			tracker.receive({ type: 'releaseNotesTelemetryVideo', action: 'ended' });
			tracker.receive({ type: 'releaseNotesTelemetryVideo', action: 'error', errorCode: 3 });
		}
		assert.deepStrictEqual(events().map(({ action, errorCode }) => ({ action, errorCode })), [
			{ action: 'shown', errorCode: 'none' },
			{ action: 'played', errorCode: 'none' },
			{ action: 'ended', errorCode: 'none' },
			{ action: 'error', errorCode: 'decode' },
		]);
	});

	test('rejects invalid messages and video messages for text-only documents', () => {
		const { tracker, events } = createTracker();
		tracker.receive(sample);
		const invalid = [
			{ action: 'play' },
			{ action: 'played', errorCode: 1 },
			{ action: 'error', errorCode: NaN },
			{ action: 'error', errorCode: 0 },
			{ action: 'error', errorCode: 5 },
			{ action: 'error', errorCode: 2.5 },
			{ action: 'error', errorCode: 2, url: 'https://example.com/private' },
		].map(message => tracker.receive({ type: 'releaseNotesTelemetryVideo', ...message }));
		tracker.metadata.highlightsVideoVariant = 'text';
		const text = tracker.receive({ type: 'releaseNotesTelemetryVideo', action: 'played' });
		tracker.manifest = { regions: [], links: [], tryouts: [] };
		const missing = tracker.receive(sample);
		assert.deepStrictEqual({ invalid, text, missing, actions: events().map(event => event.action) }, {
			invalid: Array(7).fill(false), text: false, missing: false, actions: ['shown'],
		});
	});

	test('does not report video events before presentation, when hidden, without consent, or after disposal', () => {
		const { tracker, service, events } = createTracker();
		tracker.receive({ type: 'releaseNotesTelemetryVideo', action: 'played' });
		tracker.setVisibility(false, false);
		tracker.receive(sample);
		tracker.receive({ type: 'releaseNotesTelemetryVideo', action: 'ended' });
		service.telemetryLevel = TelemetryLevel.NONE;
		tracker.setVisibility(true, true);
		tracker.receive({ type: 'releaseNotesTelemetryVideo', action: 'played' });
		tracker.dispose();
		service.telemetryLevel = TelemetryLevel.USAGE;
		tracker.receive({ type: 'releaseNotesTelemetryVideo', action: 'error', errorCode: 2 });
		assert.deepStrictEqual(events(), []);
	});

	test('video links have separate attribution and cannot inflate generic engagement counts', () => {
		const { tracker, service } = createTracker();
		const document = new mainWindow.DOMParser().parseFromString('<h2>Highlights</h2><details class="release-highlights-video"><video></video><a href="https://example.com/transcript">Transcript</a></details><a href="https://code.visualstudio.com/docs">Documentation</a>', 'text/html');
		tracker.manifest = indexReleaseNotesContent(document.body);
		tracker.receive({ ...sample, highlightsVideoVisible: false });
		tracker.receive({ type: 'releaseNotesTelemetryLink', index: 0 });
		tracker.receive({ type: 'releaseNotesTelemetryLink', index: 1 });
		tracker.finish('closed');
		assert.deepStrictEqual({
			targets: tracker.manifest.links.map(link => link.targetKind),
			counts: service.events.filter(event => event.eventName === 'releaseNotes.engagement').map(event => event.data.interactionCount),
		}, { targets: ['highlightsVideo', 'documentation'], counts: [1] });
	});

	for (const serialized of [false, true]) {
		test(`samples the real disclosure without autoplay or synthetic playback (${serialized ? 'serialized' : 'direct'})`, async () => {
			const url = mainWindow.URL.createObjectURL(new Blob(['<!DOCTYPE html><body><details class="release-highlights-video" open><summary>Watch release highlights</summary><video width="320" height="120" preload="none"></video></details></body>'], { type: 'text/html' }));
			store.add(toDisposable(() => mainWindow.URL.revokeObjectURL(url)));
			const iframe = $<HTMLIFrameElement>('iframe', { src: url });
			const loaded = new DeferredPromise<void>();
			store.add(addDisposableListener(iframe, 'load', () => loaded.complete()));
			iframe.style.cssText = 'position:fixed;top:0;left:0;width:600px;height:300px';
			mainWindow.document.body.appendChild(iframe);
			store.add(toDisposable(() => iframe.remove()));
			await loaded.p;
			const document = iframe.contentDocument!;
			const window = getWindow(document.body);
			const disclosure = document.querySelector('details')!;
			const video = document.querySelector('video')!;
			const messages: object[] = [];
			const initialize: typeof initializeReleaseNotesTelemetry = serialized ? new Function(`return (${initializeReleaseNotesTelemetry.toString()});`)() : initializeReleaseNotesTelemetry;
			const dispose = initialize(document, window, 'video-document', [], { postMessage: message => messages.push(message) }, [], true);
			store.add(toDisposable(dispose));
			const render = async () => {
				window.dispatchEvent(new window.Event('resize'));
				await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
			};
			const visible = () => messages.filter((message): message is { highlightsVideoVisible: boolean } => 'highlightsVideoVisible' in message).at(-1)?.highlightsVideoVisible;
			await render();
			const beforePresentation = messages.length;
			window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'releaseNotesTelemetryMeasure', documentId: 'stale-document' } }));
			await render();
			const stalePresentation = messages.length;
			window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'releaseNotesTelemetryMeasure', documentId: 'video-document' } }));
			await render();
			const expanded = visible();
			disclosure.open = false;
			await render();
			const collapsed = visible();
			disclosure.open = true;
			await render();
			video.dispatchEvent(new window.Event('playing'));
			video.dispatchEvent(new window.Event('ended'));
			video.dispatchEvent(new window.Event('error'));
			dispose();
			assert.deepStrictEqual({
				beforePresentation, stalePresentation, expanded, collapsed, reexpanded: visible(),
				paused: video.paused,
				playbackMessages: messages.filter((message): message is { type: 'releaseNotesTelemetryVideo' } => 'type' in message && message.type === 'releaseNotesTelemetryVideo').length,
			}, { beforePresentation: 0, stalePresentation: 0, expanded: true, collapsed: false, reexpanded: true, paused: true, playbackMessages: 0 });
		});
	}
});
