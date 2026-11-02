/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../browser/window.js';

export interface IIsolationResetOptions {
	/**
	 * How long to let work that a suite left scheduled run before resetting, in milliseconds. A late callback that
	 * throws then fails the suite that scheduled it, rather than a later one.
	 */
	readonly settleMs?: number;
	/** Moves the real pointer off the page, where the runner can, so `:hover` does not carry over to the next suite. */
	readonly resetPointer?: () => Promise<void>;
}

export interface IIsolationResetStats {
	suites: number;
	totalMs: number;
	maxMs: number;
	removedElements: number;
	blurredElements: number;
}

const statsKey = '__vscodeTestIsolationResetStats';

/** What {@link installIsolationReset} did, shared with the test runner through the global object. */
export function getIsolationResetStats(): IIsolationResetStats {
	const global = globalThis as { [statsKey]?: IIsolationResetStats };
	return global[statsKey] ??= { suites: 0, totalMs: 0, maxMs: 0, removedElements: 0, blurredElements: 0 };
}

// Captured before any test file can install fake timers.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realRequestAnimationFrame = mainWindow.requestAnimationFrame.bind(mainWindow);
const realNow = performance.now.bind(performance);

/**
 * Waits `settleMs`, then for the next frame, but no longer than another `settleMs` where frames are slow, as in a window
 * that does not paint, then for one more task, so that what the frame or the timers scheduled runs as well.
 */
function settle(settleMs: number): Promise<void> {
	return new Promise(resolve => {
		realSetTimeout(() => {
			let done = false;
			const finish = () => {
				if (!done) {
					done = true;
					realSetTimeout(resolve, 0);
				}
			};
			realRequestAnimationFrame(finish);
			realSetTimeout(finish, settleMs);
		}, settleMs);
	});
}

function isKeptElement(element: Element): boolean {
	// aria.ts adds one container for screen reader announcements to the page the first time it is used, by design.
	return element.tagName === 'SCRIPT' || element.classList.contains('monaco-aria-container');
}

/**
 * Resets page state that suites commonly leave behind after every top-level suite of `root`, so the next suite starts
 * from the same page whatever ran before it: the result of a test then does not depend on which files a run includes
 * (all tests, `--runList`, `--workers`) or their order.
 *
 * After a suite and its own cleanup, this lets work the suite left scheduled run for up to one frame, then removes the
 * elements the suite added to the body, moves focus back to the body and moves the real pointer off the page. Install it
 * after the isolation check, so the check still reports what each suite left behind before it is reset.
 */
export function installIsolationReset(root: Mocha.Suite, options: IIsolationResetOptions = {}): void {
	const settleMs = options.settleMs ?? 20;
	const bodyBefore = new WeakMap<Mocha.Suite, ReadonlySet<Element>>();
	const installed = new WeakSet<Mocha.Suite>();

	// Mocha emits 'suite' when a suite is added, before its definition runs, so this hook runs before the suite's own hooks.
	root.on('suite', (suite: Mocha.Suite) => {
		if (suite.parent !== root) {
			return;
		}
		suite.beforeAll('Isolation reset: snapshot', () => {
			bodyBefore.set(suite, new Set(Array.from(mainWindow.document.body.children)));
		});
	});

	// Once a test file is loaded, its suites have registered their own hooks, so this hook runs after their cleanup.
	root.on('post-require', () => {
		for (const suite of root.suites) {
			if (installed.has(suite)) {
				continue;
			}
			installed.add(suite);
			suite.afterAll('Isolation reset', async () => {
				const start = realNow();
				const stats = getIsolationResetStats();

				// Settle first: a callback that runs late can still add elements or take focus.
				await settle(settleMs);

				const before = bodyBefore.get(suite);
				bodyBefore.delete(suite);
				if (before) {
					for (const child of Array.from(mainWindow.document.body.children)) {
						if (!before.has(child) && !isKeptElement(child)) {
							child.remove();
							stats.removedElements++;
						}
					}
				}

				const active = mainWindow.document.activeElement;
				if (active && active !== mainWindow.document.body && active !== mainWindow.document.documentElement) {
					(active as HTMLElement).blur?.();
					stats.blurredElements++;
				}

				await options.resetPointer?.();

				const elapsed = realNow() - start;
				stats.suites++;
				stats.totalMs += elapsed;
				stats.maxMs = Math.max(stats.maxMs, elapsed);
			});
		}
	});
}
