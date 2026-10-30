/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
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
		return store.add(instantiation.createInstance(ChatReadOnlyBanner, undefined));
	}

	test('a pending refresh cannot block or re-enable another action after switching chats', async () => {
		const banner = createBanner();
		const refresh = new DeferredPromise<void>();
		const migration = new DeferredPromise<void>();
		const calls: string[] = [];
		banner.setAction({ label: 'Refresh', run: () => { calls.push('refresh'); return refresh.p; } });
		const refreshing = banner.runAction();
		banner.setAction({ label: 'Move to Copilot', run: () => { calls.push('migration'); return migration.p; } });
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

	test('repeated updates do not re-enable or announce a running Refresh action', async () => {
		const banner = createBanner();
		const pending = new DeferredPromise<void>();
		let calls = 0;
		const action = { label: 'Refresh', run: () => { calls++; return pending.p; } };
		banner.setAction(action);
		const node = banner.domNode.querySelector('a')!.firstChild;
		const refreshing = banner.runAction();
		banner.setAction(action);
		await banner.runAction();
		const running = { calls, disabled: banner.domNode.querySelector('a')!.getAttribute('aria-disabled'), sameNode: banner.domNode.querySelector('a')!.firstChild === node };
		await pending.complete();
		await refreshing;
		assert.deepStrictEqual(running, { calls: 1, disabled: 'true', sameNode: true });
	});
});
