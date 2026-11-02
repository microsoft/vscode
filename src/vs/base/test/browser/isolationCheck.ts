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
}

export interface IIsolationFinding {
	readonly kind: string;
	readonly suite: string;
	readonly file: string | undefined;
	readonly details: string[];
}

const findingsKey = '__vscodeTestIsolationFindings';
const maxDetails = 10;

/** The findings of the checks installed by {@link installIsolationCheck}, shared with the test runner through the global object. */
export function getIsolationFindings(): IIsolationFinding[] {
	const global = globalThis as { [findingsKey]?: IIsolationFinding[] };
	return global[findingsKey] ??= [];
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

/** An element the suite added that is still under the real pointer, so `:hover` styles apply to it in later layouts. */
export const hoverDetector: IIsolationDetector<ReadonlySet<Element>> = {
	kind: 'hover',
	snapshot: () => new Set(Array.from(mainWindow.document.querySelectorAll(':hover'))),
	check: before => {
		const hovered = Array.from(mainWindow.document.querySelectorAll(':hover')).filter(element => !before.has(element));
		const innermost = hovered.at(-1);
		return innermost ? [`left the pointer over ${describePath(innermost)}`] : [];
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

interface IAnimationFrameProbe {
	scheduledRan: boolean;
	nativeRan: boolean;
}

let pendingAnimationFrameProbe: IAnimationFrameProbe | undefined;
let reportedStuckAnimationFrames = false;

/**
 * A stuck animation frame queue in `dom.ts`. `scheduleAtNextAnimationFrame` requests one native frame per window and sets
 * a flag until that frame runs. When the frame was requested from a fake `requestAnimationFrame` that is removed without
 * running it, the flag stays set and no runner scheduled later in the page runs again.
 *
 * At the end of a suite this schedules a probe through `dom.ts` and then requests a native frame itself. Both frames run in
 * request order, so if the native frame ran by the end of the next suite but the probe did not, the queue was already stuck
 * when the probe was scheduled: the suite reporting it inherited it from an earlier suite. If no native frame runs, as in a
 * window that does not paint, the probe stays pending and reports nothing.
 *
 * Not a default detector: the probe puts a runner in the `dom.ts` queue between suites, which could change when the runners
 * of the next suite run, so runners add it only for reporting runs.
 */
export const animationFrameQueueDetector: IIsolationDetector<void> = {
	kind: 'animationFrame',
	snapshot: () => undefined,
	check: () => {
		const findings: string[] = [];
		const probe = pendingAnimationFrameProbe;
		if (probe && !probe.nativeRan) {
			return findings;
		}
		if (probe && !probe.scheduledRan) {
			if (!reportedStuckAnimationFrames) {
				reportedStuckAnimationFrames = true;
				findings.push('scheduleAtNextAnimationFrame runners stopped running before this suite started: a native frame ran but the runner scheduled at the end of the previous suite did not');
			}
		} else if (probe) {
			reportedStuckAnimationFrames = false;
		}
		if (getReplacedTimeGlobals().length) {
			// dom.ts would request the frame from the fake, which is what gets the queue stuck.
			pendingAnimationFrameProbe = undefined;
			return findings;
		}
		const next: IAnimationFrameProbe = { scheduledRan: false, nativeRan: false };
		scheduleAtNextAnimationFrame(mainWindow, () => next.scheduledRan = true);
		originalTimeGlobals.requestAnimationFrame.call(mainWindow, () => next.nativeRan = true);
		pendingAnimationFrameProbe = next;
		return findings;
	},
};

export const defaultIsolationDetectors: readonly IIsolationDetector[] = [leftoverDomDetector, focusDetector, hoverDetector, fakeTimersDetector];

/**
 * Runs `detectors` around every top-level suite of `root` and records what each suite leaves behind in
 * {@link getIsolationFindings}. Install it before the test files are loaded, as `installRegistryLeakCheck`.
 */
export function installIsolationCheck(root: Mocha.Suite, detectors: readonly IIsolationDetector[] = defaultIsolationDetectors): void {
	const snapshots = new WeakMap<Mocha.Suite, unknown[]>();
	const checked = new WeakSet<Mocha.Suite>();

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
				detectors.forEach((detector, index) => {
					let details: string[];
					try {
						details = detector.check(before[index]);
					} catch (error) {
						details = [`check failed: ${error}`];
					}
					if (details.length) {
						getIsolationFindings().push({
							kind: detector.kind,
							suite: suite.title,
							file: suite.file,
							details: details.length > maxDetails ? [...details.slice(0, maxDetails), `... and ${details.length - maxDetails} more`] : details,
						});
					}
				});
			});
		}
	});
}
