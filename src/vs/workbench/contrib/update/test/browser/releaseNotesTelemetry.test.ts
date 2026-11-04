/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow } from '../../../../../base/browser/dom.js';
import { safeSetInnerHtml } from '../../../../../base/browser/domSanitize.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITelemetryData, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { CapturingTelemetryService } from '../../../../../platform/telemetry/test/common/testTelemetryService.js';
import { indexReleaseNotesContent, initializeReleaseNotesTelemetry, ReleaseNotesTelemetry } from '../../browser/releaseNotesTelemetry.js';

suite('Release notes telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let now: number;
	let telemetry: CapturingTelemetryService<ITelemetryData>;
	let tracker: ReleaseNotesTelemetry;
	let availability: 'ready' | 'hidden' | 'unavailable';

	setup(() => {
		now = 0;
		availability = 'ready';
		telemetry = new CapturingTelemetryService<ITelemetryData>();
		tracker = store.add(new ReleaseNotesTelemetry('1.146.0', 'stable', 'command', {
			now: () => now,
			getTryout: () => ({ id: 'editor.smart-diff', kind: availability, hasSetup: availability === 'unavailable' }),
		}, telemetry));
		tracker.manifest = {
			regions: [
				{ index: 0, kind: 'highlights', parentIndex: -1, headingLevel: 0, endIndex: -1 },
				{ index: 1, kind: 'highlight', parentIndex: 0, headingLevel: 0, endIndex: -1 },
				{ index: 2, kind: 'note', parentIndex: -1, headingLevel: 3, endIndex: -1 },
			],
			links: [{ index: 0, contentIndex: 1, targetKind: 'command' }],
			tryouts: [{ index: 0, linkIndex: 0, contentIndex: 1 }],
		};
	});

	function sample(contents = [0, 1], tryouts: number[] = []): void {
		assert.strictEqual(tracker.receive({ type: 'releaseNotesTelemetrySample', documentId: 'test', contents, tryouts, depth: 25, isScrollable: true }), true);
	}

	function advance(milliseconds: number): void {
		const until = now + milliseconds;
		while (now < until) {
			now = Math.min(until, now + 250);
			tracker.tick();
		}
	}

	function events(name: string): ITelemetryData[] {
		return telemetry.events.filter(event => event.eventName === `releaseNotes.${name}`).map(event => event.data);
	}

	function counters(name: string): object[] {
		return events(name).map(data => ({
			...(name === 'contentEngagement' ? { contentIndex: data.contentIndex, visitCount: data.visitCount, qualifiedExposure: data.qualifiedExposure } : {}),
			visibleMs: data.visibleMs, activeReadingMs: data.activeReadingMs,
		}));
	}

	test('distinguishes actual exposure, tab resumption, and reopened instances', () => {
		sample();
		advance(500);
		assert.strictEqual(events('shown').length, 0);
		tracker.setVisibility(true, true);
		advance(500);
		tracker.setVisibility(false, false);
		advance(500);
		tracker.setVisibility(true, true);
		tracker.finish('closed');
		const reopened = store.add(new ReleaseNotesTelemetry('1.146.0', 'stable', 'command', { now: () => now, getTryout: () => undefined }, telemetry));
		reopened.receive({ type: 'releaseNotesTelemetrySample', contents: [], tryouts: [], depth: 0, isScrollable: false });
		reopened.setVisibility(true, true);
		assert.deepStrictEqual({
			exposures: events('shown').length,
			distinctInstances: new Set(events('shown').map(data => data.viewInstanceId)).size,
			firstDepth: events('shown')[0].initialDepthBucket,
			reading: counters('engagement'),
		}, {
			exposures: 2, distinctInstances: 2, firstDepth: 25,
			reading: [{ visibleMs: 500, activeReadingMs: 500 }],
		});
	});

	test('accumulates short visits and revisits without adding overlapping highlight time to page time', () => {
		sample();
		tracker.setVisibility(true, true);
		advance(1000);
		sample([]);
		advance(500);
		sample();
		advance(2000);
		tracker.finish('closed');
		assert.deepStrictEqual({
			content: counters('contentEngagement'),
			page: counters('engagement'),
		}, {
			content: [
				{ contentIndex: 0, visitCount: 1, qualifiedExposure: false, visibleMs: 1000, activeReadingMs: 1000 },
				{ contentIndex: 1, visitCount: 1, qualifiedExposure: false, visibleMs: 1000, activeReadingMs: 1000 },
				{ contentIndex: 0, visitCount: 2, qualifiedExposure: true, visibleMs: 3000, activeReadingMs: 3000 },
				{ contentIndex: 1, visitCount: 2, qualifiedExposure: true, visibleMs: 3000, activeReadingMs: 3000 },
			],
			page: [{ visibleMs: 3500, activeReadingMs: 3500 }],
		});
	});

	test('qualifies sections at exactly two continuous active seconds', () => {
		sample([2]);
		tracker.setVisibility(true, true);
		advance(1000);
		tracker.activity();
		advance(999);
		const before = events('sectionShown').length;
		advance(1);
		sample([]);
		sample([2]);
		advance(2000);
		assert.deepStrictEqual({ before, after: events('sectionShown').length, content: counters('contentEngagement') }, {
			before: 0, after: 1,
			content: [{ contentIndex: 2, visitCount: 1, qualifiedExposure: true, visibleMs: 2000, activeReadingMs: 2000 }],
		});
	});

	test('a focused-window pause resets continuous qualification rather than combining two visits', () => {
		sample([2]);
		tracker.setVisibility(true, true);
		advance(1500);
		tracker.setVisibility(true, false);
		advance(500);
		tracker.setVisibility(true, true);
		advance(1999);
		const before = events('sectionShown').length;
		advance(1);
		assert.deepStrictEqual({ before, after: events('sectionShown').length }, { before: 0, after: 1 });
	});

	test('stops active reading at the idle boundary and ignores suspended-renderer gaps', () => {
		sample();
		tracker.setVisibility(true, true);
		advance(60_500);
		now += 120_000;
		tracker.tick();
		tracker.finish('closed');
		const last = events('engagement').at(-1);
		assert.deepStrictEqual({ visibleMs: last?.visibleMs, activeReadingMs: last?.activeReadingMs }, { visibleMs: 60_500, activeReadingMs: 60_000 });
	});

	test('does not backfill activity collected while usage telemetry is disabled', () => {
		sample();
		tracker.setVisibility(true, true);
		advance(1000);
		telemetry.telemetryLevel = TelemetryLevel.ERROR;
		tracker.tick();
		const before = telemetry.events.length;
		advance(5000);
		tracker.checkbox(false);
		const disabled = telemetry.events.length;
		telemetry.telemetryLevel = TelemetryLevel.USAGE;
		tracker.tick();
		advance(1000);
		tracker.finish('closed');
		assert.deepStrictEqual({ disabledCountChanged: before !== disabled, page: counters('engagement') }, {
			disabledCountChanged: false,
			page: [{ visibleMs: 2000, activeReadingMs: 2000 }],
		});
	});

	test('rejects forged fields and indexes without recording sensitive payloads', () => {
		sample();
		tracker.setVisibility(true, true);
		const invalid = [
			{ type: 'releaseNotesTelemetrySample', contents: [512], tryouts: [], depth: 20, isScrollable: true },
			{ type: 'releaseNotesTelemetrySample', contents: [], tryouts: [], depth: Infinity, isScrollable: true },
			{ type: 'releaseNotesTelemetryLink', index: 0, href: 'sensitive' },
			{ type: 'releaseNotesTelemetryActivity', text: 'sensitive' },
		].map(message => tracker.receive(message));
		assert.deepStrictEqual({ invalid, interactions: events('interaction'), containsSensitive: JSON.stringify(telemetry.events).includes('sensitive') }, {
			invalid: [false, false, false, false], interactions: [], containsSensitive: false,
		});
	});

	test('records ready and unavailable tryout exposure but never hidden affordances', () => {
		tracker.manifest = { ...tracker.manifest, tryouts: [{ index: 7, linkIndex: 0, contentIndex: 1 }] };
		sample([], [7]);
		tracker.setVisibility(true, true);
		advance(2500);
		availability = 'unavailable';
		advance(2500);
		availability = 'hidden';
		advance(2500);
		assert.deepStrictEqual(events('tryoutShown').map(data => ({ availability: data.availability, hasSetup: data.hasSetup })), [
			{ availability: 'ready', hasSetup: false }, { availability: 'unavailable', hasSetup: true },
		]);
	});

	test('attributes a validated tryout activation to its individual highlight and existing run', () => {
		sample();
		tracker.setVisibility(true, true);
		tracker.tryout(0, 'run', '01234567-89ab-4cde-8fab-0123456789ab');
		const { schemaVersion, viewInstanceId, notesVersion, notesRevision, contentVariant, ...data } = events('interaction')[0];
		assert.deepStrictEqual(data, {
			action: 'tryoutRun', contentIndex: 1, sectionIndex: -1, linkIndex: 0, targetKind: 'command',
			tryoutId: 'editor.smart-diff', availability: 'ready', runId: '01234567-89ab-4cde-8fab-0123456789ab',
		});
	});

	test('indexes marked and table highlights deterministically without preserving forged identities', () => {
		const container = $('div');
		safeSetInnerHtml(container, '<div class="release-notes-highlights" data-release-notes-content-index="444"><ul><li>First <a href="#editor" data-release-notes-link-index="33">Details</a></li><li>Second</li></ul></div><h2 id="editor">Editor</h2><h3>One note</h3><p><a href="https://example.com">Read</a></p><table class="highlights-table"><tr><td>Legacy</td></tr></table>', {
			allowedAttributes: { augment: ['class', 'data-release-notes-content-index', 'data-release-notes-link-index'] },
		});
		const manifest = indexReleaseNotesContent(container);
		const repeated = indexReleaseNotesContent(container);
		assert.deepStrictEqual({
			kinds: manifest.regions.map(region => [region.kind, region.parentIndex]),
			links: manifest.links,
			same: JSON.stringify(manifest) === JSON.stringify(repeated),
		}, {
			kinds: [['highlights', -1], ['highlight', 0], ['highlight', 0], ['section', -1], ['note', 3], ['highlights', 4], ['highlight', 5]],
			links: [{ index: 0, contentIndex: 1, targetKind: 'anchor' }, { index: 1, contentIndex: 4, targetKind: 'external' }],
			same: true,
		});
	});

	test('waits for the presented sample and pauses while a replacement frame is loading', () => {
		tracker.setVisibility(true, true);
		tracker.waitForPresentation();
		advance(3000);
		const before = events('shown').length;
		tracker.receive({ type: 'releaseNotesTelemetrySample', contents: [2], tryouts: [], depth: 100, isScrollable: true });
		advance(1000);
		tracker.waitForPresentation();
		advance(3000);
		sample([2]);
		advance(1000);
		tracker.finish('closed');
		const last = events('engagement').at(-1);
		assert.deepStrictEqual({
			before, shown: events('shown').map(data => data.initialDepthBucket),
			visibleMs: last?.visibleMs, activeReadingMs: last?.activeReadingMs,
		}, { before: 0, shown: [100], visibleMs: 2000, activeReadingMs: 2000 });
	});

	test('attributes identical setting URIs to their exact validated occurrence', () => {
		const uri = 'code-setting://editor.wordWrap';
		tracker.manifest = {
			...tracker.manifest,
			links: [{ index: 0, contentIndex: 1, targetKind: 'other', settingUri: uri }, { index: 1, contentIndex: 2, targetKind: 'other', settingUri: uri }],
			tryouts: [],
		};
		sample([2]);
		tracker.setVisibility(true, true);
		const results = [tracker.setting(uri, 1), tracker.setting(uri, 0), tracker.setting(uri, undefined), tracker.setting(uri, 2), tracker.setting('code-setting://other', 1)];
		assert.deepStrictEqual({
			results,
			interactions: events('interaction').map(data => ({ action: data.action, linkIndex: data.linkIndex, contentIndex: data.contentIndex })),
		}, {
			results: [true, true, false, false, false],
			interactions: [{ action: 'setting', linkIndex: 1, contentIndex: 2 }, { action: 'setting', linkIndex: 0, contentIndex: 1 }],
		});
	});

	test('serialized webview sampling measures actual heading regions and normalized bottom reach, then disposes', async () => {
		const iframe = $<HTMLIFrameElement>('iframe');
		iframe.style.cssText = 'position:fixed;top:0;left:0;width:600px;height:300px';
		mainWindow.document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));
		const document = iframe.contentDocument!;
		const window = getWindow(document.body);
		document.body.style.margin = '0';
		for (const id of ['first', 'second']) {
			const heading = $('h2', { id }, id);
			heading.style.cssText = 'height:30px;margin:0';
			const paragraph = $('p', undefined, id);
			paragraph.style.cssText = 'height:400px;margin:0';
			document.body.append(heading, paragraph);
		}
		const manifest = indexReleaseNotesContent(document.body);
		const messages: object[] = [];
		const initialize: typeof initializeReleaseNotesTelemetry = new Function(`return (${initializeReleaseNotesTelemetry.toString()});`)();
		const dispose = initialize(document, window, 'test', manifest.regions, { postMessage: message => messages.push(message) });
		store.add(toDisposable(dispose));
		window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'releaseNotesTelemetryMeasure', documentId: 'test' } }));
		await timeout(50);
		window.scrollTo(0, document.documentElement.scrollHeight);
		await timeout(50);
		const last = messages.at(-1);
		dispose();
		const count = messages.length;
		window.scrollTo(0, 0);
		await timeout(50);
		assert.deepStrictEqual({ initial: messages[0], last, stopped: count === messages.length }, {
			initial: { type: 'releaseNotesTelemetrySample', documentId: 'test', contents: [0], tryouts: [], depth: 0, isScrollable: true },
			last: { type: 'releaseNotesTelemetrySample', documentId: 'test', contents: [1], tryouts: [], depth: 100, isScrollable: true },
			stopped: true,
		});
	});

	test('does not sample a hidden pending frame before the host handshake and restored scroll position', async () => {
		const iframe = $<HTMLIFrameElement>('iframe');
		iframe.style.cssText = 'position:fixed;top:0;left:0;width:600px;height:300px;visibility:hidden';
		mainWindow.document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));
		const document = iframe.contentDocument!;
		const window = getWindow(document.body);
		document.body.style.cssText = 'margin:0;height:1200px';
		const messages: object[] = [];
		const initialize: typeof initializeReleaseNotesTelemetry = new Function(`return (${initializeReleaseNotesTelemetry.toString()});`)();
		store.add(toDisposable(initialize(document, window, 'restored', [], { postMessage: message => messages.push(message) })));
		window.dispatchEvent(new window.Event('resize'));
		window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'releaseNotesTelemetryMeasure', documentId: 'stale' } }));
		await timeout(50);
		const before = messages.length;
		window.scrollTo(0, document.documentElement.scrollHeight);
		iframe.style.visibility = 'visible';
		window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'releaseNotesTelemetryMeasure', documentId: 'restored' } }));
		await timeout(50);
		assert.deepStrictEqual({ before, first: messages[0] }, {
			before: 0,
			first: { type: 'releaseNotesTelemetrySample', documentId: 'restored', contents: [], tryouts: [], depth: 100, isScrollable: true },
		});
	});
});
