/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
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
		const contextMenuService = upcastPartial<IContextMenuService>({ showContextMenu() { } });
		const widget = disposables.add(new SessionInputBannerWidget(banner, hoverService, contextMenuService));
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

	test('does not run a primary action whose readiness resolves after disposal', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const ready = new DeferredPromise<boolean>();
		let primaryRuns = 0;
		const banner: ISessionInputBanner = {
			icon: Codicon.commentDiscussion,
			accent: false,
			text: '1 comment',
			ariaLabel: '1 comment',
			actions: [{
				label: 'Address Comments',
				primary: true,
				waitUntilReady: () => ready.p,
				run: () => { primaryRuns++; },
			}],
		};
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		const contextMenuService = upcastPartial<IContextMenuService>({ showContextMenu() { } });
		const widget = new SessionInputBannerWidget(banner, hoverService, contextMenuService);
		const primaryButton = widget.domNode.querySelector<HTMLElement>('.session-input-banner-action')!;

		primaryButton.click();
		await timeout(0);

		// The banner is replaced (e.g. its comments disappeared) while readiness
		// is still pending; the continuation must not act on stale state.
		widget.dispose();
		ready.complete(true);
		await timeout(0);

		assert.strictEqual(primaryRuns, 0);
	}));

	test('does not run a primary action whose banner is replaced while readiness is pending', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const ready = new DeferredPromise<boolean>();
		let primaryRuns = 0;
		let inputFocusCount = 0;
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		const contextMenuService = upcastPartial<IContextMenuService>({ showContextMenu() { } });
		const widget = disposables.add(new SessionInputBannerWidget({
			id: 'old',
			icon: Codicon.warning,
			accent: true,
			text: '2 Checks Failing',
			ariaLabel: '2 Checks Failing',
			actions: [{
				label: 'Fix Checks',
				primary: true,
				waitUntilReady: () => ready.p,
				run: () => { primaryRuns++; },
			}],
			focusAfterDismiss: () => inputFocusCount++,
		}, hoverService, contextMenuService));

		document.body.appendChild(widget.domNode);
		disposables.add(toDisposable(() => widget.domNode.remove()));
		const primaryButton = widget.domNode.querySelector<HTMLElement>('.session-input-banner-action');
		primaryButton?.focus();
		primaryButton?.click();
		await timeout(0);
		widget.setBanners([{
			id: 'new',
			icon: Codicon.commentDiscussion,
			accent: false,
			text: '1 PR Comment',
			ariaLabel: '1 PR Comment',
			actions: [],
		}]);
		ready.complete(true);
		await timeout(0);

		assert.deepStrictEqual({ primaryRuns, inputFocusCount }, { primaryRuns: 0, inputFocusCount: 1 });
	}));

	test('runs a pending primary action after the same banner is refreshed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const ready = new DeferredPromise<boolean>();
		let runText: string | undefined;
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		const contextMenuService = upcastPartial<IContextMenuService>({ showContextMenu() { } });
		const banner = (text: string): ISessionInputBanner => ({
			id: 'same',
			icon: Codicon.warning,
			accent: true,
			text,
			ariaLabel: text,
			actions: [{
				id: 'fixCI',
				label: 'Fix Checks',
				primary: true,
				waitUntilReady: () => ready.p,
				run: () => { runText = text; },
			}],
		});
		const widget = disposables.add(new SessionInputBannerWidget(banner('2 Checks Failing'), hoverService, contextMenuService));

		widget.domNode.querySelector<HTMLElement>('.session-input-banner-action')?.click();
		await timeout(0);
		widget.setBanners([banner('3 Checks Failing')]);
		ready.complete(true);
		await timeout(0);

		assert.strictEqual(runText, '3 Checks Failing');
	}));

	test('resolves a dropdown action from the current banner state', async () => {
		let menuAction: IAction | undefined;
		let runText: string | undefined;
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		const contextMenuService = upcastPartial<IContextMenuService>({
			showContextMenu(delegate) {
				menuAction = delegate.getActions?.()[0];
			}
		});
		const banner = (text: string): ISessionInputBanner => ({
			id: 'same',
			icon: Codicon.warning,
			accent: true,
			text,
			ariaLabel: text,
			actions: [{
				id: 'combined',
				label: 'Fix Checks & Address Comments',
				primary: true,
				dropdownActions: [{
					id: 'fixCI',
					label: 'Fix Checks',
					primary: true,
					run: () => { runText = text; },
				}],
				run() { },
			}],
		});
		const widget = disposables.add(new SessionInputBannerWidget(banner('old'), hoverService, contextMenuService));
		widget.domNode.querySelector<HTMLElement>('.monaco-dropdown-button')?.click();

		widget.setBanners([banner('new')]);
		await menuAction?.run();

		assert.strictEqual(runText, 'new');
	});

	test('navigates carousel items and preserves one banner surface', () => {
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		const contextMenuService = upcastPartial<IContextMenuService>({ showContextMenu() { } });
		const widget = disposables.add(new SessionInputBannerWidget([{
			id: 'pr-1',
			icon: Codicon.warning,
			accent: true,
			text: '2 Checks Failing',
			ariaLabel: 'Item 1 of 2, #101, 2 Checks Failing',
			reference: { label: '#101', hover: 'Pull Request #101: First' },
			actions: [],
		}, {
			id: 'pr-2',
			icon: Codicon.commentDiscussion,
			accent: false,
			text: '3 PR Comments',
			ariaLabel: 'Item 2 of 2, #102, 3 PR Comments',
			reference: { label: '#102', hover: 'Pull Request #102: Second' },
			actions: [],
		}], hoverService, contextMenuService));

		widget.domNode.querySelector<HTMLElement>('.session-input-banner-navigation-button.next')?.click();

		assert.deepStrictEqual({
			rootIsSingleBanner: widget.domNode.matches('.session-input-banner'),
			position: widget.domNode.querySelector('.session-input-banner-position')?.textContent,
			reference: widget.domNode.querySelector('.session-input-banner-reference')?.textContent,
			text: widget.domNode.querySelector('.session-input-banner-text')?.textContent,
			accent: widget.domNode.classList.contains('accent-orange'),
		}, {
			rootIsSingleBanner: true,
			position: '2/2',
			reference: '#102',
			text: '3 PR Comments',
			accent: false,
		});
	});

	test('preserves dismiss focus across updates and returns to input after the final item', () => {
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		const contextMenuService = upcastPartial<IContextMenuService>({ showContextMenu() { } });
		let inputFocusCount = 0;
		const banner = (id: string): ISessionInputBanner => ({
			id,
			icon: Codicon.commentDiscussion,
			accent: false,
			text: '1 PR Comment',
			ariaLabel: '1 PR Comment',
			actions: [],
			dismissTooltip: 'Hide this item',
			dismiss() { },
			focusAfterDismiss: () => inputFocusCount++,
		});
		const widget = disposables.add(new SessionInputBannerWidget([banner('first'), banner('second')], hoverService, contextMenuService));
		document.body.appendChild(widget.domNode);
		disposables.add(toDisposable(() => widget.domNode.remove()));
		const dismiss = widget.domNode.querySelector<HTMLElement>('.session-input-banner-dismiss');
		dismiss?.focus();

		widget.setBanners([banner('second')]);
		const focusPreserved = document.activeElement === widget.domNode.querySelector('.session-input-banner-dismiss');
		widget.setBanners([]);

		assert.deepStrictEqual({ focusPreserved, inputFocusCount }, { focusPreserved: true, inputFocusCount: 1 });
	});

	test('renders only the combined work action as a split button', () => {
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		let dropdownLabels: readonly string[] = [];
		const contextMenuService = upcastPartial<IContextMenuService>({
			showContextMenu(delegate) {
				dropdownLabels = (delegate.getActions?.() ?? []).map(action => action.label);
			}
		});
		const widget = disposables.add(new SessionInputBannerWidget({
			icon: Codicon.warning,
			accent: true,
			text: '2 Checks Failing | 3 PR Comments',
			ariaLabel: '#101, 2 Checks Failing, 3 PR Comments',
			actions: [{
				label: 'Fix Checks & Address Comments',
				primary: true,
				dropdownActions: [
					{ label: 'Fix Checks', primary: true, run() { } },
					{ label: 'Address Comments', primary: true, run() { } },
				],
				run() { },
			}],
		}, hoverService, contextMenuService));

		const dropdownButtons = widget.domNode.querySelectorAll<HTMLElement>('.monaco-dropdown-button');
		dropdownButtons[0].click();

		assert.deepStrictEqual({
			splitButtonCount: widget.domNode.querySelectorAll('.monaco-button-dropdown').length,
			primaryLabels: [...widget.domNode.querySelectorAll('.monaco-button-dropdown > .monaco-button:first-child')].map(element => element.textContent),
			dropdownLabels,
		}, {
			splitButtonCount: 1,
			primaryLabels: ['Fix Checks & Address Comments'],
			dropdownLabels: ['Fix Checks', 'Address Comments'],
		});
	});
});
