/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OverlayLayoutElement, syncToAnchor } from '../../browser/overlayLayoutElement.js';
import { sharedMutationObserver } from '../../browser/dom.js';
import { mainWindow } from '../../browser/window.js';
import { timeout } from '../../common/async.js';
import { toDisposable } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('OverlayLayoutElement', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('syncToAnchor', () => {

		let container: HTMLElement;
		let anchor: HTMLElement;

		setup(() => {
			container = document.createElement('div');
			mainWindow.document.body.appendChild(container);

			anchor = document.createElement('div');
			anchor.style.position = 'absolute';
			anchor.style.left = '30px';
			anchor.style.top = '40px';
			anchor.style.width = '200px';
			anchor.style.height = '100px';
			container.appendChild(anchor);
		});

		teardown(() => {
			container.remove();
		});

		function rectOf(element: HTMLElement) {
			const rect = element.getBoundingClientRect();
			return [rect.left, rect.top, rect.width, rect.height].map(Math.round);
		}

		function createElement(styles: Partial<CSSStyleDeclaration>): HTMLElement {
			const element = document.createElement('div');
			Object.assign(element.style, styles);
			container.appendChild(element);
			return element;
		}

		test('moves and resizes a fixed element onto its anchor', () => {
			const element = createElement({ position: 'fixed', left: '0px', top: '0px', width: '10px', height: '10px' });
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), rectOf(anchor));
		});

		test('places an element that has no position or size yet', () => {
			const element = createElement({ position: 'fixed' });
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), rectOf(anchor));
		});

		test('accounts for the containing block of an absolutely positioned element', () => {
			const parent = createElement({ position: 'absolute', left: '7px', top: '11px', width: '500px', height: '500px' });
			const element = document.createElement('div');
			element.style.position = 'absolute';
			parent.appendChild(element);
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), rectOf(anchor));
		});

		test('does not touch an element that already matches its anchor', () => {
			const element = createElement({ position: 'fixed' });
			syncToAnchor(element, anchor);
			const before = element.getAttribute('style');
			syncToAnchor(element, anchor);
			assert.strictEqual(element.getAttribute('style'), before);
		});

		test('ignores anchors that are not rendered', () => {
			const element = createElement({ position: 'fixed', left: '1px', top: '2px', width: '3px', height: '4px' });
			anchor.style.display = 'none';
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), [1, 2, 3, 4]);

			anchor.remove();
			syncToAnchor(element, anchor);
			assert.deepStrictEqual(rectOf(element), [1, 2, 3, 4]);
		});
	});

	suite('manual anchor sync', () => {

		let container: HTMLElement;
		let anchor: HTMLElement;

		setup(() => {
			container = document.createElement('div');
			mainWindow.document.body.appendChild(container);

			anchor = document.createElement('div');
			anchor.style.position = 'absolute';
			anchor.style.left = '30px';
			anchor.style.top = '40px';
			anchor.style.width = '200px';
			anchor.style.height = '100px';
			container.appendChild(anchor);
		});

		teardown(() => {
			container.remove();
		});

		function rectOf(element: HTMLElement) {
			const rect = element.getBoundingClientRect();
			return [rect.left, rect.top, rect.width, rect.height].map(Math.round);
		}

		function nextFrames(count = 3): Promise<void> {
			return new Promise(resolve => {
				const step = () => count-- > 0 ? mainWindow.requestAnimationFrame(step) : resolve();
				step();
			});
		}

		/**
		 * Simulates a browser that does not apply the anchor-based styles.
		 */
		function breakAnchorStyles(overlay: OverlayLayoutElement): void {
			for (const property of ['top', 'left', 'width', 'height']) {
				overlay.content.style.removeProperty(property);
			}
		}

		function createOverlay(): OverlayLayoutElement {
			const overlay = store.add(new OverlayLayoutElement(true));
			container.appendChild(overlay.root);
			return overlay;
		}

		test('keeps a visible overlay on its anchor', async () => {
			const overlay = createOverlay();
			overlay.setAnchorElement(anchor);
			breakAnchorStyles(overlay);

			await nextFrames();
			assert.deepStrictEqual(rectOf(overlay.content), rectOf(anchor));

			anchor.style.width = '120px';
			anchor.style.left = '50px';
			await nextFrames();
			assert.deepStrictEqual(rectOf(overlay.content), rectOf(anchor));
		});

		test('pauses while the overlay is hidden and resumes when it is shown', async () => {
			const overlay = createOverlay();
			overlay.content.style.visibility = 'hidden';
			overlay.setAnchorElement(anchor);
			breakAnchorStyles(overlay);

			await nextFrames();
			const before = overlay.content.getAttribute('style');
			assert.notDeepStrictEqual(rectOf(overlay.content), rectOf(anchor));

			await nextFrames();
			assert.strictEqual(overlay.content.getAttribute('style'), before);

			overlay.content.style.visibility = 'visible';
			await nextFrames();
			assert.deepStrictEqual(rectOf(overlay.content), rectOf(anchor));
		});

		test('stops after dispose', async () => {
			const overlay = createOverlay();
			overlay.setAnchorElement(anchor);
			overlay.dispose();
			container.appendChild(overlay.root);
			breakAnchorStyles(overlay);
			const before = overlay.content.getAttribute('style');

			await nextFrames();
			assert.strictEqual(overlay.content.getAttribute('style'), before);
		});
	});

	suite('manual anchor sync scheduling', () => {

		let container: HTMLElement;
		let anchor: HTMLElement;
		let pending: Set<() => void>;
		let scheduled: number;

		setup(() => {
			container = document.createElement('div');
			mainWindow.document.body.appendChild(container);

			anchor = document.createElement('div');
			anchor.style.position = 'absolute';
			anchor.style.width = '200px';
			anchor.style.height = '100px';
			container.appendChild(anchor);

			pending = new Set();
			scheduled = 0;
		});

		teardown(() => {
			container.remove();
		});

		function scheduleFrame(_targetWindow: Window, runner: () => void) {
			scheduled++;
			pending.add(runner);
			return toDisposable(() => pending.delete(runner));
		}

		function runFrame(): void {
			const runners = [...pending];
			pending.clear();
			runners.forEach(runner => runner());
		}

		/**
		 * Lets the mutation observer see style changes.
		 */
		function flushMutations(): Promise<void> {
			return timeout(0);
		}

		function createOverlay(): OverlayLayoutElement {
			const overlay = store.add(new OverlayLayoutElement(true, scheduleFrame));
			container.appendChild(overlay.root);
			return overlay;
		}

		test('keeps exactly one frame scheduled while visible', () => {
			const overlay = createOverlay();
			overlay.setAnchorElement(anchor);
			assert.strictEqual(pending.size, 1);

			runFrame();
			runFrame();
			assert.strictEqual(pending.size, 1);

			overlay.setAnchorElement(anchor);
			assert.strictEqual(pending.size, 1);
		});

		test('stops scheduling frames while hidden and resumes when shown', async () => {
			const overlay = createOverlay();
			overlay.setAnchorElement(anchor);
			runFrame();
			assert.strictEqual(pending.size, 1);

			overlay.content.style.visibility = 'hidden';
			await flushMutations();
			assert.strictEqual(pending.size, 0);

			const scheduledWhileHidden = scheduled;
			overlay.setAnchorElement(anchor);
			await flushMutations();
			assert.strictEqual(pending.size, 0);
			assert.strictEqual(scheduled, scheduledWhileHidden);

			overlay.content.style.visibility = 'visible';
			await flushMutations();
			assert.strictEqual(pending.size, 1);

			overlay.setAnchorElement(anchor);
			assert.strictEqual(pending.size, 1);
		});

		test('does not wait for frames or observe the overlay after dispose', async () => {
			const overlay = createOverlay();
			overlay.content.style.visibility = 'hidden';
			overlay.setAnchorElement(anchor);
			await flushMutations();
			assert.ok(sharedMutationObserver.mutationObservers.has(overlay.content));

			overlay.dispose();
			const scheduledBeforeShow = scheduled;
			overlay.content.style.visibility = 'visible';
			await flushMutations();

			assert.strictEqual(pending.size, 0);
			assert.strictEqual(scheduled, scheduledBeforeShow);
			assert.ok(!sharedMutationObserver.mutationObservers.has(overlay.content));
		});

		test('does not schedule frames when manual sync is off', () => {
			const overlay = store.add(new OverlayLayoutElement(false, scheduleFrame));
			container.appendChild(overlay.root);
			overlay.setAnchorElement(anchor);
			assert.strictEqual(scheduled, 0);
		});
	});
});
