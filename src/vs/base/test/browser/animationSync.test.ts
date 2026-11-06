/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { pauseCSSAnimationsWhenHidden, synchronizeCSSAnimations } from '../../browser/animationSync.js';
import { mainWindow } from '../../browser/window.js';
import { toDisposable } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

async function waitForAnimationFrames(count: number): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
	}
}

suite('Animation Sync', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('continues observing an element after temporary DOM detachment', async () => {
		assert.strictEqual(typeof mainWindow.IntersectionObserver, 'function');

		const host = mainWindow.document.createElement('div');
		const element = mainWindow.document.createElement('div');
		host.appendChild(element);
		store.add(toDisposable(() => host.remove()));
		store.add(pauseCSSAnimationsWhenHidden(element, { pausedClass: 'paused' }));

		await waitForAnimationFrames(5);
		const detached = element.classList.contains('paused');
		mainWindow.document.body.appendChild(host);
		await waitForAnimationFrames(5);
		const attached = element.classList.contains('paused');

		assert.deepStrictEqual({ detached, attached }, { detached: true, attached: false });
	});

	test('synchronization does not resume intentionally paused CSS animations', () => {
		const style = mainWindow.document.createElement('style');
		style.textContent = '@keyframes animation-sync-paused-test { from { opacity: 0; } to { opacity: 1; } }';
		mainWindow.document.head.appendChild(style);
		store.add(toDisposable(() => style.remove()));
		const element = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		store.add(toDisposable(() => element.remove()));
		element.style.animation = 'animation-sync-paused-test 1s linear infinite paused';
		synchronizeCSSAnimations(element);
		assert.deepStrictEqual(element.getAnimations().map(animation => ({
			state: animation.playState, start: animation.startTime,
		})), [{ state: 'paused', start: null }]);
	});

	test('reports visibility transitions and stops reporting after disposal', async () => {
		const host = mainWindow.document.createElement('div');
		const element = host.appendChild(mainWindow.document.createElement('div'));
		store.add(toDisposable(() => host.remove()));
		const visible: boolean[] = [];
		const observer = store.add(pauseCSSAnimationsWhenHidden(element, {
			pausedClass: 'paused',
			onDidChangeVisibility: value => visible.push(value),
		}));
		await waitForAnimationFrames(5);
		mainWindow.document.body.appendChild(host);
		await waitForAnimationFrames(5);
		host.remove();
		await waitForAnimationFrames(5);
		mainWindow.document.body.appendChild(host);
		await waitForAnimationFrames(5);
		observer.dispose();
		host.remove();
		await waitForAnimationFrames(5);
		assert.deepStrictEqual(visible, [false, true, false, true]);
	});

	test('resynchronizes native CSS animations after they are revealed', async () => {
		const style = mainWindow.document.createElement('style');
		style.textContent = '@keyframes animation-sync-running-test { from { opacity: 0; } to { opacity: 1; } } .animation-sync-running-test { animation: animation-sync-running-test 1s linear infinite; width: 10px; height: 10px; } .animation-sync-running-test.paused { animation-play-state: paused; }';
		mainWindow.document.head.appendChild(style);
		store.add(toDisposable(() => style.remove()));
		const host = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		host.style.cssText = 'position: fixed; top: 0; left: 0; width: 100px; height: 100px; overflow: hidden;';
		store.add(toDisposable(() => host.remove()));
		const element = host.appendChild(mainWindow.document.createElement('div'));
		element.className = 'animation-sync-running-test';
		element.style.marginTop = '200px';
		store.add(pauseCSSAnimationsWhenHidden(element, { pausedClass: 'paused' }));
		await waitForAnimationFrames(5);
		const hidden = element.getAnimations().map(animation => animation.playState);
		element.style.marginTop = '0';
		await waitForAnimationFrames(5);
		assert.deepStrictEqual({
			hidden,
			revealed: element.getAnimations().map(animation => ({ state: animation.playState, start: animation.startTime })),
		}, {
			hidden: ['paused'],
			revealed: [{ state: 'running', start: 0 }],
		});
	});
});
