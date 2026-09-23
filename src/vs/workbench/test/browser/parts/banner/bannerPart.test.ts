/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IBannerItem } from '../../../../services/banner/browser/bannerService.js';
import { BannerPart } from '../../../../browser/parts/banner/bannerPart.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('BannerPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBanner(hoverService?: IHoverService) {
		const services = workbenchInstantiationService(undefined, store);
		if (hoverService) {
			services.stub(IHoverService, hoverService);
		}
		const container = append(mainWindow.document.body, $('.part.banner'));
		store.add(toDisposable(() => container.remove()));
		const banner = store.add(services.createInstance(BannerPart));
		banner.create(container);
		return { banner, container };
	}

	test('updates same-id content and actions without accumulating old DOM or losing banner focus', () => {
		const { banner, container } = createBanner();
		const item: IBannerItem = { id: 'update', icon: undefined, message: 'Update required', actions: [{ label: 'Check for Updates', href: 'command:update.checkForUpdate' }], neutral: true };
		banner.show(item);
		banner.focusNextAction();
		banner.show({ ...item, message: 'New minimum version', actions: [{ label: 'Restart to Update', href: 'command:update.restartToUpdate' }] });
		const updated = {
			message: container.querySelector('.message-container')?.textContent,
			actions: [...container.querySelectorAll('.message-actions-container a')].map(link => link.textContent),
			focused: mainWindow.document.activeElement === container,
			neutral: container.classList.contains('neutral'),
			height: banner.minimumHeight,
		};
		banner.hide('update');
		assert.deepStrictEqual({ updated, remaining: container.childElementCount, height: banner.minimumHeight }, {
			updated: { message: 'New minimum version', actions: ['Restart to Update'], focused: true, neutral: true, height: 26 },
			remaining: 0,
			height: 0,
		});
	});

	test('preserves higher-priority notices and restores the latest pending banner after hide or close', () => {
		const { banner, container } = createBanner();
		let closed = 0;
		const trust: IBannerItem = { id: 'trust', icon: undefined, message: 'Restricted Mode' };
		const update: IBannerItem = { id: 'update', icon: undefined, message: 'Update required', priority: -1, onClose: () => closed++ };
		const messages: (string | null | undefined)[] = [];
		const capture = () => messages.push(container.querySelector('.message-container')?.textContent);
		banner.show(trust);
		banner.show(update);
		capture();
		banner.show({ ...update, message: 'Updated requirement' });
		capture();
		banner.hide('trust');
		capture();
		banner.show(trust);
		banner.hide('update');
		capture();
		banner.hide('trust');
		banner.show(update);
		container.querySelector<HTMLElement>('.action-label')?.click();
		capture();
		assert.deepStrictEqual({ messages, closed, height: banner.minimumHeight }, {
			messages: ['Restricted Mode', 'Restricted Mode', 'Updated requirement', 'Restricted Mode', undefined],
			closed: 1,
			height: 0,
		});
	});

	test('only reveals the message hover when the text is truncated, so it never overlays adjacent controls', () => {
		let resolveHover: (() => Omit<IHoverOptions, 'target'>) | undefined;
		const hoverService: IHoverService = {
			...NullHoverService,
			setupDelayedHover: (_target, options): IDisposable => {
				resolveHover = typeof options === 'function' ? options : () => options;
				return Disposable.None;
			}
		};
		const { banner, container } = createBanner(hoverService);
		banner.show({ id: 'trust', icon: undefined, message: 'Restricted Mode is intended for safe code browsing' });

		const messageContainer = container.querySelector<HTMLElement>('.message-container')!;
		const contentFor = (scrollWidth: number, clientWidth: number) => {
			Object.defineProperty(messageContainer, 'scrollWidth', { value: scrollWidth, configurable: true });
			Object.defineProperty(messageContainer, 'clientWidth', { value: clientWidth, configurable: true });
			return resolveHover?.().content;
		};

		assert.deepStrictEqual({
			whenFits: contentFor(100, 100),
			whenTruncated: contentFor(200, 100),
		}, {
			whenFits: '',
			whenTruncated: 'Restricted Mode is intended for safe code browsing',
		});
		banner.hide('trust');
	});
});
