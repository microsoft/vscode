/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, append, EventType } from '../../browser/dom.js';
import { hideOverlaysIn, IOverlayAnchorHost, OverlayLayoutElement, registerOverlayAnchor } from '../../browser/overlayLayoutElement.js';
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

	test('an overlay follows a later anchor without reloading its iframe', async () => {
		const { container, anchors: [inlineAnchor] } = createAnchors(1);
		const overlay = store.add(new OverlayLayoutElement());
		append(container, overlay.root);
		overlay.setAnchorElement(inlineAnchor);
		const iframe = $<HTMLIFrameElement>('iframe', { srcdoc: '<!DOCTYPE html><body>Video player</body>' });
		const loaded = new Promise<void>(resolve => store.add(addDisposableListener(iframe, EventType.LOAD, () => resolve())));
		append(overlay.content, iframe);
		await loaded;
		const document = iframe.contentDocument!;
		document.body.dataset.playback = 'playing';

		const dialogAnchor = append(container, $('div'));
		dialogAnchor.style.cssText = 'width: 240px; height: 180px; margin-left: 40px; margin-top: 20px;';
		overlay.setAnchorElement(dialogAnchor);
		const expanded = overlay.content.getBoundingClientRect();
		const dialog = dialogAnchor.getBoundingClientRect();
		const expandedBoundsMatch = expanded.x === dialog.x && expanded.y === dialog.y && expanded.width === dialog.width && expanded.height === dialog.height;
		overlay.setAnchorElement(inlineAnchor);
		const restored = overlay.content.getBoundingClientRect();
		const inline = inlineAnchor.getBoundingClientRect();

		assert.deepStrictEqual({
			expandedBoundsMatch,
			restoredBoundsMatch: restored.x === inline.x && restored.y === inline.y && restored.width === inline.width && restored.height === inline.height,
			sameDocument: iframe.contentDocument === document,
			playback: iframe.contentDocument?.body.dataset.playback,
		}, { expandedBoundsMatch: true, restoredBoundsMatch: true, sameDocument: true, playback: 'playing' });
	});

	test('reanchoring does not require the state-preserving DOM move API', () => {
		const { container, anchors: [inlineAnchor] } = createAnchors(1);
		Object.defineProperty(container, 'moveBefore', { value: undefined });
		const overlay = store.add(new OverlayLayoutElement());
		append(container, overlay.root);
		overlay.setAnchorElement(inlineAnchor);
		const dialogAnchor = append(container, $('div'));

		assert.doesNotThrow(() => overlay.setAnchorElement(dialogAnchor));
		assert.strictEqual(overlay.root.parentElement, container);
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
