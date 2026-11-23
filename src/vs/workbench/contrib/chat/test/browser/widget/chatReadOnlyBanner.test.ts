/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ChatReadOnlyBanner } from '../../../browser/widget/chatReadOnlyBanner.js';

suite('ChatReadOnlyBanner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBanner() {
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IHoverService, NullHoverService);
		instantiation.stub(IOpenerService, { open: async () => true });
		const banner = store.add(instantiation.createInstance(ChatReadOnlyBanner));
		mainWindow.document.body.appendChild(banner.domNode);
		store.add(toDisposable(() => banner.domNode.remove()));
		banner.setVisible(true);
		return banner;
	}

	test('a pending refresh cannot block or re-enable another action after switching chats', async () => {
		const banner = createBanner();
		const refresh = new DeferredPromise<void>();
		const migration = new DeferredPromise<void>();
		const calls: string[] = [];
		banner.setContent({ message: 'Couldn\'t refresh', action: { label: 'Refresh', run: () => { calls.push('refresh'); return refresh.p; } } });
		const refreshing = banner.runAction();
		banner.setContent({ message: 'Read-only', action: { label: 'Move to Copilot', run: () => { calls.push('migration'); return migration.p; } } });
		const enabledOnSwitch = banner.domNode.querySelector('a')!.getAttribute('aria-disabled');
		const migrating = banner.runAction();
		await refresh.complete();
		await refreshing;
		const afterOldRefresh = banner.domNode.querySelector('a')!.getAttribute('aria-disabled');
		await migration.complete();
		await migrating;
		assert.deepStrictEqual({ calls, enabledOnSwitch, afterOldRefresh, finished: banner.domNode.querySelector('a')!.getAttribute('aria-disabled') }, {
			calls: ['refresh', 'migration'], enabledOnSwitch: 'false', afterOldRefresh: 'true', finished: 'false',
		});
	});

	test('Refresh is keyboard accessible, coalesces repeated activations and preserves focus and announcements', async () => {
		const banner = createBanner();
		const pending = new DeferredPromise<void>();
		let calls = 0;
		const content = {
			message: 'Couldn\'t refresh this conversation. Recent messages may be missing.',
			action: { label: 'Refresh', run: () => { calls++; return pending.p; } },
		};
		banner.setContent(content);
		const link = banner.domNode.querySelector<HTMLElement>('.chat-readonly-banner-action .monaco-link')!;
		const announcement = banner.domNode.querySelector('.chat-readonly-banner-announcement')!.firstChild;
		const labelNode = link.firstChild;
		link.focus();
		link.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		banner.setContent(content);
		link.click();
		await banner.runAction();
		const running = { calls, disabled: link.getAttribute('aria-disabled'), focused: mainWindow.document.activeElement === link, sameLabel: link.firstChild === labelNode };
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({
			running, enabled: link.getAttribute('aria-disabled'), role: banner.domNode.getAttribute('role'),
			sameAnnouncement: banner.domNode.querySelector('.chat-readonly-banner-announcement')!.firstChild === announcement,
			visibleActions: banner.domNode.querySelectorAll('.chat-readonly-banner-action:not([hidden])').length,
		}, {
			running: { calls: 1, disabled: 'true', focused: true, sameLabel: true }, enabled: 'false', role: 'status',
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
		const links = [...banner.domNode.querySelectorAll<HTMLAnchorElement>('.chat-readonly-banner-action:not([hidden]) .monaco-link')];
		links[0].click();
		links[1].click();
		const actions = links.map(link => link.textContent);
		banner.dispose();
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ actions, restores }, { actions: ['Refresh', 'Restore'], restores: 1 });
	});
});
