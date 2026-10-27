/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OverlayLayoutElement } from '../../browser/overlayLayoutElement.js';
import { mainWindow } from '../../browser/window.js';
import { timeout } from '../../common/async.js';
import { DisposableStore, toDisposable } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('OverlayLayoutElement', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('stacks one level above the nearest ancestor with a z-index, and follows changes to its classes', async () => {
		const style = mainWindow.document.createElement('style');
		style.textContent = '.overlay-test-layer { position: relative; z-index: 5; } .overlay-test-layer.raised { z-index: 9; }';
		const layer = mainWindow.document.createElement('div');
		layer.className = 'overlay-test-layer';
		const anchor = mainWindow.document.createElement('div');
		layer.appendChild(anchor);
		mainWindow.document.head.appendChild(style);
		mainWindow.document.body.appendChild(layer);
		disposables.add(toDisposable(() => { layer.remove(); style.remove(); }));

		const overlay = disposables.add(new OverlayLayoutElement());
		overlay.setAnchorElement(anchor);
		const initial = overlay.content.style.zIndex;

		layer.classList.add('raised');
		await timeout(0);
		const raised = overlay.content.style.zIndex;

		overlay.dispose();
		layer.classList.remove('raised');
		await timeout(0);
		const afterDispose = overlay.content.style.zIndex;

		assert.deepStrictEqual({ initial, raised, afterDispose }, { initial: '6', raised: '10', afterDispose: '10' });
	});
});
