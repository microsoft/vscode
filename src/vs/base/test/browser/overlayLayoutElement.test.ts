/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../browser/dom.js';
import { hideOverlaysIn, IOverlayAnchorHost, registerOverlayAnchor } from '../../browser/overlayLayoutElement.js';
import { mainWindow } from '../../browser/window.js';
import { DisposableStore, toDisposable } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('Overlay anchors', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createAnchors(count: number): { readonly container: HTMLElement; readonly anchors: HTMLElement[] } {
		const container = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		const anchors = Array.from({ length: count }, () => {
			const anchor = append(container, $('div'));
			anchor.style.cssText = 'width: 10px; height: 10px;';
			return anchor;
		});

		return { container, anchors };
	}

	function createHost(): { readonly host: IOverlayAnchorHost; readonly calls: boolean[] } {
		const calls: boolean[] = [];
		return { host: { setHidden: hidden => calls.push(hidden) }, calls };
	}

	test('what draws over an anchor hides while anything hides it, and shows once nothing does', () => {
		const { container, anchors: [anchor] } = createAnchors(1);
		const { host, calls } = createHost();
		store.add(registerOverlayAnchor(anchor, host));

		const first = hideOverlaysIn(container);
		const second = hideOverlaysIn(container);
		first.dispose();
		const afterFirst = [...calls];
		second.dispose();

		assert.deepStrictEqual({ afterFirst, calls }, { afterFirst: [true], calls: [true, false] });
	});

	test('registered with another anchor while hidden, it stays hidden as long as what hid it does', () => {
		const { container, anchors: [first, second] } = createAnchors(2);
		const { host, calls } = createHost();
		const oldRegistration = registerOverlayAnchor(first, host);

		const hiding = hideOverlaysIn(container);
		const registration = store.add(registerOverlayAnchor(second, host));
		oldRegistration.dispose();
		const whileHidden = [...calls];
		hiding.dispose();
		registration.dispose();

		assert.deepStrictEqual({ whileHidden, calls }, { whileHidden: [true], calls: [true, false] });
	});

	test('disposed while hidden, it shows again, and what hid it no longer acts on it', () => {
		const { container, anchors: [anchor] } = createAnchors(1);
		const { host, calls } = createHost();
		const disposables = store.add(new DisposableStore());
		const registration = registerOverlayAnchor(anchor, host);

		const hiding = disposables.add(hideOverlaysIn(container));
		registration.dispose();
		disposables.dispose();

		assert.deepStrictEqual({ calls, disposed: disposables.isDisposed && !!hiding }, { calls: [true, false], disposed: true });
	});
});
