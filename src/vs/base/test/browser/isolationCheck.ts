/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { scheduleAtNextAnimationFrame } from '../../browser/dom.js';
import { mainWindow } from '../../browser/window.js';

/**
 * Finds global state that a top-level suite leaves behind for the suites that run after it in the same page.
 *
 * Unit test runs load many test files into one page, and the files and their order differ between runs (all tests,
 * `--runList`, `--workers`). A suite that leaves state behind can change the result of a later suite, so a test passes
 * alone but fails in a full run, or the other way around. The checks only report what they find, they never fail a
 * suite: the findings are collected for the test runner to write out.
 */
export interface IIsolationDetector<S = unknown> {
	/** A short name for the kind of state, used to group findings. */
	readonly kind: string;
	/** Takes the state before the suite runs. */
	snapshot(): S;
	/** Describes what the suite left behind compared to `before`, or what is wrong regardless of it. */
	check(before: S): string[];
	/**
	 * For a detector that only knows the result of a check after the next one, as the animation frame probe: settles what
	 * the last check left pending once all suites have run, since no later suite checks it. Its findings go to the last suite.
	 */
	finalize?(): Promise<string[]>;
}

export interface IIsolationFinding {
	readonly kind: string;
	readonly suite: string;
	readonly file: string | undefined;
	readonly details: string[];
}

const findingsKey = '__vscodeTestIsolationFindings';
const flushKey = '__vscodeTestIsolationFlush';
const maxDetails = 10;

/** The findings of the checks installed by {@link installIsolationCheck}, shared with the test runner through the global object. */
export function getIsolationFindings(): IIsolationFinding[] {
	const global = globalThis as { [findingsKey]?: IIsolationFinding[] };
	return global[findingsKey] ??= [];
}

/**
 * Settles the checks that are still pending after the last suite, see {@link IIsolationDetector.finalize}. Test runners call
 * it through the global object once all suites have run, before they read {@link getIsolationFindings}.
 */
export async function flushIsolationChecks(): Promise<void> {
	await (globalThis as { [flushKey]?: () => Promise<void> })[flushKey]?.();
}

function pushFindings(kind: string, suite: { title: string; file?: string } | undefined, details: string[]): void {
	if (details.length) {
		getIsolationFindings().push({
			kind,
			suite: suite?.title ?? '',
			file: suite?.file,
			details: details.length > maxDetails ? [...details.slice(0, maxDetails), `... and ${details.length - maxDetails} more`] : details,
		});
	}
}

function describeElement(element: Element): string {
	let description = element.tagName.toLowerCase();
	if (element.id) {
		description += `#${element.id}`;
	}
	const classes = Array.from(element.classList).slice(0, 3);
	if (classes.length) {
		description += `.${classes.join('.')}`;
	}
	return description;
}

function describePath(element: Element): string {
	const path: string[] = [];
	for (let current: Element | null = element; current && current !== element.ownerDocument.body && path.length < 4; current = current.parentElement) {
		path.unshift(describeElement(current));
	}
	return path.join(' > ');
}

/** Elements added to `document.body` and not removed, such as a widget's container. */
export const leftoverDomDetector: IIsolationDetector<ReadonlySet<Element>> = {
	kind: 'dom',
	snapshot: () => new Set(Array.from(mainWindow.document.body.children)),
	check: before => Array.from(mainWindow.document.body.children)
		// aria.ts adds one container for screen reader announcements to the page the first time it is used, by design.
		.filter(child => !before.has(child) && child.tagName !== 'SCRIPT' && !child.classList.contains('monaco-aria-container'))
		.map(child => `left ${describeElement(child)} in body`),
};

/** A focused element other than the body, which changes focus and keyboard behavior for later suites. */
export const focusDetector: IIsolationDetector<Element | null> = {
	kind: 'focus',
	snapshot: () => mainWindow.document.activeElement,
	check: before => {
		const active = mainWindow.document.activeElement;
		if (!active || active === mainWindow.document.body || active === mainWindow.document.documentElement || active === before) {
			return [];
		}
		return [`left focus on ${describePath(active)}${active.isConnected ? '' : ' (detached)'}`];
	},
};

interface IScrollPosition {
	readonly page: readonly [number, number];
	readonly body: readonly [number, number];
	readonly root: readonly [number, number];
}

function getScrollPosition(): IScrollPosition {
	const document = mainWindow.document;
	return {
		page: [mainWindow.scrollX, mainWindow.scrollY],
		body: [document.body.scrollLeft, document.body.scrollTop],
		root: [document.documentElement.scrollLeft, document.documentElement.scrollTop],
	};
}

/**
 * The page scrolled by the suite, for example by focusing an element it appended below the fold. Later suites that
 * position against page coordinates then measure from a different origin.
 */
export const scrollDetector: IIsolationDetector<IScrollPosition> = {
	kind: 'scroll',
	snapshot: getScrollPosition,
	check: before => {
		const after = getScrollPosition();
		return (['page', 'body', 'root'] as const)
			.filter(key => after[key][0] !== before[key][0] || after[key][1] !== before[key][1])
			.map(key => `left the ${key === 'page' ? 'page' : key === 'body' ? 'body' : 'document element'} scrolled to (${after[key][0]}, ${after[key][1]}), it was (${before[key][0]}, ${before[key][1]})`);
	},
};
/**
 * The real pointer over the page after the suite when it was not before, or over an element the suite added. Either way
 * `:hover` styles apply in the layouts of later suites. A real pointer only hovers the page where the window can
 * receive it, as under Xvfb on Linux once a suite activates the window, so this reports nothing where it never does.
 */
export const hoverDetector: IIsolationDetector<ReadonlySet<Element>> = {
	kind: 'hover',
	snapshot: () => new Set(Array.from(mainWindow.document.querySelectorAll(':hover'))),
	check: before => {
		const document = mainWindow.document;
		const hovered = Array.from(document.querySelectorAll(':hover')).filter(element => !before.has(element));
		const innermost = hovered.at(-1);
		if (!innermost) {
			return [];
		}
		if (innermost === document.body || innermost === document.documentElement) {
			return ['left the real pointer over the page'];
		}
		return [`left the pointer over ${describePath(innermost)}`];
	},
};

function captureTimeGlobals() {
	return {
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout,
		setInterval: globalThis.setInterval,
		clearInterval: globalThis.clearInterval,
		Date: globalThis.Date,
		'performance.now': globalThis.performance?.now,
		requestAnimationFrame: globalThis.requestAnimationFrame,
		cancelAnimationFrame: globalThis.cancelAnimationFrame,
	};
}

/** The time globals when the runner loads this module, before any test file. */
const originalTimeGlobals = captureTimeGlobals();

/** Names of the time globals that are currently not the original ones, for example because fake timers are installed. */
export function getReplacedTimeGlobals(): string[] {
	const current = captureTimeGlobals();
	return (Object.keys(originalTimeGlobals) as (keyof typeof originalTimeGlobals)[]).filter(name => current[name] !== originalTimeGlobals[name]);
}

/**
 * Fake timers (sinon, `pushGlobalTimeApi`) that a suite installed and did not restore. Every later suite then runs on a
 * clock that nobody advances, and `dom.ts` requests its animation frames from a fake that never runs them.
 */
export const fakeTimersDetector: IIsolationDetector<ReturnType<typeof captureTimeGlobals>> = {
	kind: 'timers',
	snapshot: () => captureTimeGlobals(),
	check: before => {
		// Report what this suite changed, even when an earlier suite had already replaced the same global.
		const current = captureTimeGlobals();
		const replaced = (Object.keys(originalTimeGlobals) as (keyof typeof originalTimeGlobals)[])
			.filter(name => current[name] !== before[name] && current[name] !== originalTimeGlobals[name]);
		return replaced.length ? [`left fake ${replaced.join(', ')} installed`] : [];
	},
};

export interface IAnimationFrameQueueProbeHost {
	/** Schedules `runner` through the queue under test, `dom.ts`'s `scheduleAtNextAnimationFrame`. */
	scheduleAtNextAnimationFrame(runner: () => void): void;
	/** Requests a frame from the real `requestAnimationFrame`, bypassing the queue. */
	requestNativeAnimationFrame(callback: () => void): void;
	/** Whether fake time globals are installed, so the queue would request its frame from a fake. */
	hasFakeTimers(): boolean;
	/** Resolves after `ms`, on the real clock. */
	timeout(ms: number): Promise<void>;
}

interface IAnimationFrameProbe {
	scheduledRan: boolean;
	nativeRan: boolean;
}

/** How long {@link IIsolationDetector.finalize} waits for a native frame: the hidden Electron test window paints about once a second. */
const finalizeFrameTimeout = 1500;

/**
 * A stuck animation frame queue in `dom.ts`. `scheduleAtNextAnimationFrame` requests one native frame per window and sets
 * a flag until that frame runs. When the frame was requested from a fake `requestAnimationFrame` that is removed without
 * running it, the flag stays set and no runner scheduled later in the page runs again.
 *
 * At the end of a suite this schedules a probe through `dom.ts` and then requests a native frame itself. Both frames run in
 * request order, so if the native frame ran by the end of the next suite but the probe did not, the queue was already stuck
 * when the probe was scheduled: the suite reporting it inherited it from an earlier suite. If no native frame runs, as in a
 * window that does not paint, the probe stays pending and reports nothing. The probe of the last suite has no later
 * check, so `finalize` waits for one more native frame and settles it.
 *
 * Not a default detector: the probe puts a runner in the `dom.ts` queue between suites, which could change when the runners
 * of the next suite run, so runners add it only for reporting runs.
 */
export function createAnimationFrameQueueDetector(host: IAnimationFrameQueueProbeHost): IIsolationDetector<void> {
	let pending: IAnimationFrameProbe | undefined;
	let reportedStuck = false;

	/** Settles the pending probe if its native frame ran. Returns whether it did, and what to report. */
	const settle = (stuckFinding: string): { settled: boolean; findings: string[] } => {
		if (!pending || !pending.nativeRan) {
			return { settled: !pending, findings: [] };
		}
		const findings: string[] = [];
		if (!pending.scheduledRan) {
			if (!reportedStuck) {
				reportedStuck = true;
				findings.push(stuckFinding);
			}
		} else {
			reportedStuck = false;
		}
		pending = undefined;
		return { settled: true, findings };
	};

	return {
		kind: 'animationFrame',
		snapshot: () => undefined,
		check: () => {
			const { settled, findings } = settle('scheduleAtNextAnimationFrame runners stopped running before this suite started: a native frame ran but the runner scheduled at the end of the previous suite did not');
			if (!settled) {
				return findings;
			}
			if (host.hasFakeTimers()) {
				// The queue would request its frame from the fake, which is what gets it stuck.
				return findings;
			}
			const next: IAnimationFrameProbe = { scheduledRan: false, nativeRan: false };
			host.scheduleAtNextAnimationFrame(() => next.scheduledRan = true);
			host.requestNativeAnimationFrame(() => next.nativeRan = true);
			pending = next;
			return findings;
		},
		finalize: async () => {
			if (pending && !pending.nativeRan) {
				// Frames run in request order, so once this one runs, so has the probe's.
				await Promise.race([new Promise<void>(resolve => host.requestNativeAnimationFrame(resolve)), host.timeout(finalizeFrameTimeout)]);
			}
			const { findings } = settle('scheduleAtNextAnimationFrame runners stopped running by the end of the last suite: a native frame ran but the runner scheduled at the end of this suite did not');
			pending = undefined;
			return findings;
		},
	};
}

export const animationFrameQueueDetector = createAnimationFrameQueueDetector({
	scheduleAtNextAnimationFrame: runner => scheduleAtNextAnimationFrame(mainWindow, runner),
	requestNativeAnimationFrame: callback => originalTimeGlobals.requestAnimationFrame.call(mainWindow, callback),
	hasFakeTimers: () => getReplacedTimeGlobals().length > 0,
	timeout: ms => new Promise(resolve => originalTimeGlobals.setTimeout.call(globalThis, resolve, ms)),
});

export const defaultIsolationDetectors: readonly IIsolationDetector[] = [leftoverDomDetector, focusDetector, hoverDetector, scrollDetector, fakeTimersDetector];

/**
 * Runs `detectors` around every top-level suite of `root` and records what each suite leaves behind in
 * {@link getIsolationFindings}. Install it before the test files are loaded, as `installRegistryLeakCheck`.
 */
export function installIsolationCheck(root: Mocha.Suite, detectors: readonly IIsolationDetector[] = defaultIsolationDetectors): void {
	const snapshots = new WeakMap<Mocha.Suite, unknown[]>();
	const checked = new WeakSet<Mocha.Suite>();
	let lastChecked: Mocha.Suite | undefined;

	(globalThis as { [flushKey]?: () => Promise<void> })[flushKey] = async () => {
		for (const detector of detectors) {
			if (!detector.finalize) {
				continue;
			}
			let details: string[];
			try {
				details = await detector.finalize();
			} catch (error) {
				details = [`finalize failed: ${error}`];
			}
			pushFindings(detector.kind, lastChecked, details);
		}
	};

	// Mocha emits 'suite' when a suite is added, before its definition runs, so this hook runs before the suite's own hooks.
	root.on('suite', (suite: Mocha.Suite) => {
		if (suite.parent !== root) {
			return;
		}
		suite.beforeAll('Isolation check: snapshot', () => {
			snapshots.set(suite, detectors.map(detector => {
				try {
					return detector.snapshot();
				} catch {
					return undefined;
				}
			}));
		});
	});

	// Once a test file is loaded, its suites have registered their own hooks, so this hook runs after their cleanup.
	root.on('post-require', () => {
		for (const suite of root.suites) {
			if (checked.has(suite)) {
				continue;
			}
			checked.add(suite);
			suite.afterAll('Isolation check', () => {
				const before = snapshots.get(suite);
				snapshots.delete(suite);
				if (!before) {
					return;
				}
				lastChecked = suite;
				detectors.forEach((detector, index) => {
					let details: string[];
					try {
						details = detector.check(before[index]);
					} catch (error) {
						details = [`check failed: ${error}`];
					}
					pushFindings(detector.kind, suite, details);
				});
			});
		}
	});
}
