/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { SessionReadOnlyBanner } from '../../browser/parts/sessionReadOnlyBanner.js';

suite('SessionReadOnlyBanner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBanner() {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IOpenerService, { open: async () => true });
		const banner = store.add(instantiationService.createInstance(SessionReadOnlyBanner));
		mainWindow.document.body.appendChild(banner.domNode);
		store.add(toDisposable(() => banner.domNode.remove()));
		banner.setVisible(true);
		return banner;
	}

	test('Refresh is keyboard accessible, coalesces repeated clicks and preserves focus and announcements', async () => {
		const banner = createBanner();
		const pending = new DeferredPromise<void>();
		let calls = 0;
		const content = {
			message: 'Couldn\'t refresh this conversation. Recent messages may be missing.',
			action: { label: 'Refresh', run: () => { calls++; return pending.p; } },
		};
		banner.setContent(content);
		const link = banner.domNode.querySelector<HTMLElement>('.session-readonly-banner-action .monaco-link')!;
		const announcement = banner.domNode.querySelector('.session-readonly-banner-announcement')!.firstChild;
		link.focus();
		link.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		banner.setContent(content);
		link.click();
		const running = { calls, disabled: link.getAttribute('aria-disabled'), focused: mainWindow.document.activeElement === link };
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({
			running, enabled: link.getAttribute('aria-disabled'), role: banner.domNode.getAttribute('role'),
			sameAnnouncement: banner.domNode.querySelector('.session-readonly-banner-announcement')!.firstChild === announcement,
			visibleActions: banner.domNode.querySelectorAll('.session-readonly-banner-action:not([hidden])').length,
		}, {
			running: { calls: 1, disabled: 'true', focused: true }, enabled: 'false', role: 'status',
			sameAnnouncement: true, visibleActions: 1,
		});
	});

	test('keeps archive recovery available beside Refresh and safely disposes a pending action', async () => {
		const banner = createBanner();
		const pending = new DeferredPromise<void>();
		let restores = 0;
		banner.setContent({
			message: 'Recent messages may be missing. Archived sessions are read-only.',
			action: { label: 'Refresh', run: () => pending.p },
			secondaryAction: { label: 'Restore', run: () => { restores++; } },
		});
		const links = [...banner.domNode.querySelectorAll<HTMLAnchorElement>('.session-readonly-banner-action:not([hidden]) .monaco-link')];
		links[0].click();
		links[1].click();
		const actions = links.map(link => link.textContent);
		banner.dispose();
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ actions, restores }, { actions: ['Refresh', 'Restore'], restores: 1 });
	});
});
