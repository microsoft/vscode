/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { createAnimationFrameQueueDetector, fakeTimersDetector, focusDetector, leftoverDomDetector, scrollDetector } from './isolationCheck.js';

suite('Isolation check', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports elements left in the body, but not those that were there before', () => {
		const existing = mainWindow.document.createElement('div');
		mainWindow.document.body.append(existing);
		const before = leftoverDomDetector.snapshot();
		const leftover = mainWindow.document.createElement('div');
		leftover.id = 'leftover';
		leftover.className = 'monaco-workbench extra';
		mainWindow.document.body.append(leftover);
		const findings = leftoverDomDetector.check(before);
		leftover.remove();
		existing.remove();
		assert.deepStrictEqual({ findings, restored: leftoverDomDetector.check(before) }, {
			findings: ['left div#leftover.monaco-workbench.extra in body'],
			restored: [],
		});
	});

	test('reports focus left on an element, but not on the body or an element that had focus before', () => {
		const container = mainWindow.document.createElement('div');
		container.className = 'list';
		const input = mainWindow.document.createElement('input');
		container.append(input);
		mainWindow.document.body.append(container);
		const before = focusDetector.snapshot();
		input.focus();
		const findings = focusDetector.check(before);
		const stillFocused = focusDetector.check(focusDetector.snapshot());
		input.blur();
		container.remove();
		assert.deepStrictEqual({ findings, stillFocused, restored: focusDetector.check(before) }, {
			findings: ['left focus on div.list > input'],
			stillFocused: [],
			restored: [],
		});
	});

	test('reports a page the suite scrolled, but not one that was already scrolled', () => {
		const body = mainWindow.document.body;
		const filler = mainWindow.document.createElement('div');
		filler.style.height = '10000px';
		body.append(filler);
		const scrollTop = body.scrollTop;
		const rootScrollTop = mainWindow.document.documentElement.scrollTop;
		const scroll = (top: number) => {
			body.scrollTop = top;
			mainWindow.document.documentElement.scrollTop = top;
		};
		try {
			// Start from the top, whatever an earlier suite left.
			scroll(0);
			const before = scrollDetector.snapshot();
			scroll(120);
			const scrolled = scrollDetector.check(before).length > 0;
			const unchanged = scrollDetector.check(scrollDetector.snapshot());
			scroll(0);
			assert.deepStrictEqual({ scrolled, unchanged, restored: scrollDetector.check(before) }, { scrolled: true, unchanged: [], restored: [] });
		} finally {
			body.scrollTop = scrollTop;
			mainWindow.document.documentElement.scrollTop = rootScrollTop;
			filler.remove();
		}
	});

	test('puts back the scroll position from before the suite', () => {
		const body = mainWindow.document.body;
		const filler = mainWindow.document.createElement('div');
		filler.style.height = '10000px';
		body.append(filler);
		const scrollTop = body.scrollTop;
		const rootScrollTop = mainWindow.document.documentElement.scrollTop;
		const scroll = (top: number) => {
			body.scrollTop = top;
			mainWindow.document.documentElement.scrollTop = top;
		};
		try {
			scroll(0);
			const before = scrollDetector.snapshot();
			scroll(120);
			const scrolled = scrollDetector.check(before).length > 0;
			scrollDetector.reset!(before);
			assert.deepStrictEqual({ scrolled, reset: scrollDetector.check(before) }, { scrolled: true, reset: [] });
		} finally {
			body.scrollTop = scrollTop;
			mainWindow.document.documentElement.scrollTop = rootScrollTop;
			filler.remove();
		}
	});

	test('reports fake timers that a suite installed and did not restore', () => {
		const realSetTimeout = globalThis.setTimeout;
		const realDate = globalThis.Date;
		const before = fakeTimersDetector.snapshot();
		globalThis.setTimeout = (() => 0) as unknown as typeof globalThis.setTimeout;
		globalThis.Date = class extends realDate { } as DateConstructor;
		let findings: string[];
		let stillInstalled: string[];
		try {
			findings = fakeTimersDetector.check(before);
			stillInstalled = fakeTimersDetector.check(fakeTimersDetector.snapshot());
		} finally {
			globalThis.setTimeout = realSetTimeout;
			globalThis.Date = realDate;
		}
		assert.deepStrictEqual({ findings, stillInstalled, restored: fakeTimersDetector.check(before) }, {
			findings: ['left fake setTimeout, Date installed'],
			stillInstalled: [],
			restored: [],
		});
	});

	test('reports a fake timer installed over one that an earlier suite left', () => {
		const realSetTimeout = globalThis.setTimeout;
		let findings: string[];
		try {
			globalThis.setTimeout = (() => 0) as unknown as typeof globalThis.setTimeout;
			const before = fakeTimersDetector.snapshot();
			globalThis.setTimeout = (() => 1) as unknown as typeof globalThis.setTimeout;
			findings = fakeTimersDetector.check(before);
		} finally {
			globalThis.setTimeout = realSetTimeout;
		}
		assert.deepStrictEqual(findings, ['left fake setTimeout installed']);
	});

	suite('animation frame queue', () => {
		const stuckFinding = 'scheduleAtNextAnimationFrame runners stopped running before this suite started: a native frame ran but the runner scheduled at the end of the previous suite did not';

		/**
		 * A queue and native frames that run only when the test says so, so each `check` sees exactly the frames
		 * that ran since the previous one. A stuck queue keeps its runners, like `dom.ts` once its flag is stuck.
		 */
		function createProbeHost() {
			let queued: (() => void)[] = [];
			let native: (() => void)[] = [];
			const host = {
				stuck: false,
				fakeTimers: false,
				requests: 0,
				/** Expires the pending `timeout`, as the real clock would. */
				expireTimeout: () => { },
				timeout: () => new Promise<void>(resolve => host.expireTimeout = resolve),
				scheduleAtNextAnimationFrame: (runner: () => void) => { host.requests++; queued.push(runner); },
				requestNativeAnimationFrame: (callback: () => void) => { host.requests++; native.push(callback); },
				hasFakeTimers: () => host.fakeTimers,
				/** Runs one frame: the queue's runners unless it is stuck, then the native callbacks, in request order. */
				runFrame: () => {
					const runners = host.stuck ? [] : queued;
					const callbacks = native;
					if (!host.stuck) {
						queued = [];
					}
					native = [];
					runners.forEach(runner => runner());
					callbacks.forEach(callback => callback());
				},
			};
			return host;
		}

		test('reports nothing while the queue runs its runners', () => {
			const host = createProbeHost();
			const detector = createAnimationFrameQueueDetector(host);
			const findings: string[][] = [];
			for (let i = 0; i < 3; i++) {
				findings.push(detector.check());
				host.runFrame();
			}
			assert.deepStrictEqual(findings, [[], [], []]);
		});

		test('reports a stuck queue on the first check after a native frame ran without the probe', () => {
			const host = createProbeHost();
			const detector = createAnimationFrameQueueDetector(host);
			const first = detector.check();
			host.stuck = true;
			host.runFrame();
			assert.deepStrictEqual({ first, second: detector.check() }, { first: [], second: [stuckFinding] });
		});

		test('reports nothing while no native frame runs, as in a window that does not paint', () => {
			const host = createProbeHost();
			host.stuck = true;
			const detector = createAnimationFrameQueueDetector(host);
			assert.deepStrictEqual([detector.check(), detector.check(), detector.check()], [[], [], []]);
		});

		test('reports a stuck queue once until it recovers, then again when it gets stuck again', () => {
			const host = createProbeHost();
			const detector = createAnimationFrameQueueDetector(host);
			const findings: string[][] = [detector.check()];
			host.stuck = true;
			for (let i = 0; i < 3; i++) {
				host.runFrame();
				findings.push(detector.check());
			}
			host.stuck = false;
			host.runFrame();
			findings.push(detector.check());
			host.runFrame();
			findings.push(detector.check());
			host.stuck = true;
			host.runFrame();
			findings.push(detector.check());
			assert.deepStrictEqual(findings, [[], [stuckFinding], [], [], [], [], [stuckFinding]]);
		});

		test('does not schedule a probe while fake timers are installed', () => {
			const host = createProbeHost();
			const detector = createAnimationFrameQueueDetector(host);
			host.fakeTimers = true;
			const withFakes = detector.check();
			const requestsWithFakes = host.requests;
			host.fakeTimers = false;
			const afterFakes = detector.check();
			host.runFrame();
			assert.deepStrictEqual({ withFakes, requestsWithFakes, afterFakes, requestsAfterFakes: host.requests, next: detector.check() }, {
				withFakes: [], requestsWithFakes: 0, afterFakes: [], requestsAfterFakes: 2, next: [],
			});
		});

		test('finalize reports a queue that got stuck in the last suite, once a native frame runs', async () => {
			const host = createProbeHost();
			const detector = createAnimationFrameQueueDetector(host);
			detector.check();
			host.stuck = true;
			const finalized = detector.finalize!();
			host.runFrame();
			assert.deepStrictEqual({ findings: await finalized, again: await detector.finalize!() }, {
				findings: ['scheduleAtNextAnimationFrame runners stopped running by the end of the last suite: a native frame ran but the runner scheduled at the end of this suite did not'],
				again: [],
			});
		});

		test('finalize reports nothing for a healthy queue, or when no native frame runs before the timeout', async () => {
			const healthy = createProbeHost();
			const healthyDetector = createAnimationFrameQueueDetector(healthy);
			healthyDetector.check();
			const healthyFindings = healthyDetector.finalize!();
			healthy.runFrame();

			const unpainted = createProbeHost();
			unpainted.stuck = true;
			const unpaintedDetector = createAnimationFrameQueueDetector(unpainted);
			unpaintedDetector.check();
			const unpaintedFindings = unpaintedDetector.finalize!();
			unpainted.expireTimeout();

			assert.deepStrictEqual({ healthy: await healthyFindings, unpainted: await unpaintedFindings }, { healthy: [], unpainted: [] });
		});

		test('finalize does not report a stuck queue again that a check already reported', async () => {
			const host = createProbeHost();
			const detector = createAnimationFrameQueueDetector(host);
			detector.check();
			host.stuck = true;
			host.runFrame();
			const reported = detector.check();
			host.runFrame();
			assert.deepStrictEqual({ reported, finalized: await detector.finalize!() }, { reported: [stuckFinding], finalized: [] });
		});
	});
});
