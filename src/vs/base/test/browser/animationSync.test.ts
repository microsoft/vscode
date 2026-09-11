/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { pauseCSSAnimationsWhenHidden } from '../../browser/animationSync.js';
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
});
