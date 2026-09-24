/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IBannerItem } from '../../../../services/banner/browser/bannerService.js';
import { BannerPart } from '../../../../browser/parts/banner/bannerPart.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('Managed plugins banner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBanner() {
		const services = workbenchInstantiationService(undefined, store);
		const container = append(mainWindow.document.body, $('.part.banner'));
		store.add(toDisposable(() => container.remove()));
		const banner = store.add(services.createInstance(BannerPart));
		banner.create(container);
		return { banner, container };
	}

	test('updates same-id content and actions without accumulating old DOM or losing banner focus', () => {
		const { banner, container } = createBanner();
		const item: IBannerItem = { id: 'plugins', icon: undefined, message: 'Required plugins unavailable', actions: [{ label: 'Retry', href: 'command:retry' }], neutral: true };
		banner.show(item);
		banner.focusNextAction();
		banner.show({ ...item, message: 'Installing required plugins', actions: [] });
		const updated = {
			message: container.querySelector('.message-container')?.textContent,
			actions: container.querySelectorAll('.message-actions-container a').length,
			focused: mainWindow.document.activeElement === container,
			neutral: container.classList.contains('neutral'),
			height: banner.minimumHeight,
		};
		banner.hide('plugins');
		assert.deepStrictEqual({ updated, remaining: container.childElementCount, height: banner.minimumHeight }, {
			updated: { message: 'Installing required plugins', actions: 0, focused: true, neutral: true, height: 26 },
			remaining: 0,
			height: 0,
		});
	});

	test('preserves higher-priority notices and restores the latest pending banner', () => {
		const { banner, container } = createBanner();
		let closed = 0;
		const trust: IBannerItem = { id: 'trust', icon: undefined, message: 'Restricted Mode' };
		const plugins: IBannerItem = { id: 'plugins', icon: undefined, message: 'Required plugins unavailable', priority: -2, onClose: () => closed++ };
		const messages: (string | null | undefined)[] = [];
		const capture = () => messages.push(container.querySelector('.message-container')?.textContent);
		banner.show(trust);
		banner.show(plugins);
		capture();
		banner.show({ ...plugins, message: 'Installing required plugins' });
		capture();
		banner.hide('trust');
		capture();
		banner.show({ id: 'update', icon: undefined, message: 'Update required', priority: -1 });
		capture();
		banner.hide('update');
		capture();
		container.querySelector<HTMLElement>('.action-label')?.click();
		capture();
		assert.deepStrictEqual({ messages, closed, height: banner.minimumHeight }, {
			messages: ['Restricted Mode', 'Restricted Mode', 'Installing required plugins', 'Update required', 'Installing required plugins', undefined],
			closed: 1,
			height: 0,
		});
	});
});
