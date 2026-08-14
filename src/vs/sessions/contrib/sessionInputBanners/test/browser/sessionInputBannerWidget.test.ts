/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ISessionInputBanner, SessionInputBannerWidget } from '../../browser/sessionInputBannerWidget.js';

suite('SessionInputBannerWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('waits for readiness and delays the model-loading progress border', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const ready = new DeferredPromise<boolean>();
		const actionFinished = new DeferredPromise<void>();
		let primaryRuns = 0;
		let secondaryRuns = 0;
		const banner: ISessionInputBanner = {
			icon: Codicon.commentDiscussion,
			accent: false,
			text: '1 comment',
			ariaLabel: '1 comment',
			actions: [
				{
					label: 'Address Comments',
					primary: true,
					waitUntilReady: () => ready.p,
					run: () => {
						primaryRuns++;
						return actionFinished.p;
					},
				},
				{
					label: 'Reveal',
					run: () => { secondaryRuns++; },
				},
			],
		};
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		const widget = disposables.add(new SessionInputBannerWidget(banner, hoverService));
		const [primaryButton, secondaryButton] = widget.domNode.querySelectorAll<HTMLElement>('.session-input-banner-action');

		primaryButton.click();
		secondaryButton.click();
		await timeout(999);

		assert.deepStrictEqual({
			primaryRuns,
			secondaryRuns,
			primaryDisabled: primaryButton.getAttribute('aria-disabled'),
			secondaryDisabled: secondaryButton.getAttribute('aria-disabled'),
			ariaBusy: widget.domNode.getAttribute('aria-busy'),
			working: widget.domNode.classList.contains('working'),
		}, {
			primaryRuns: 0,
			secondaryRuns: 1,
			primaryDisabled: 'true',
			secondaryDisabled: 'false',
			ariaBusy: 'true',
			working: false,
		});

		await timeout(1);
		assert.strictEqual(widget.domNode.classList.contains('working'), true);

		ready.complete(true);
		await timeout(0);
		assert.deepStrictEqual({
			primaryRuns,
			primaryDisabled: primaryButton.getAttribute('aria-disabled'),
			ariaBusy: widget.domNode.getAttribute('aria-busy'),
			working: widget.domNode.classList.contains('working'),
		}, {
			primaryRuns: 1,
			primaryDisabled: 'true',
			ariaBusy: 'false',
			working: false,
		});

		actionFinished.complete();
		await timeout(0);
		assert.strictEqual(primaryButton.getAttribute('aria-disabled'), 'false');
	}));
});
