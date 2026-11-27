/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import type { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { DeferredPromise, retry, timeout } from '../../../../../../base/common/async.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Color } from '../../../../../../base/common/color.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { asCssVariableName } from '../../../../../../platform/theme/common/colorUtils.js';
import { focusBorder } from '../../../../../../platform/theme/common/colors/baseColors.js';
import { buttonSeparator } from '../../../../../../platform/theme/common/colors/inputColors.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { agentsCIBannerButtonBackground, agentsCIBannerButtonForeground, agentsCIBannerButtonHoverBackground } from '../../../../../common/agentsColors.js';
import { ColorThemeData } from '../../../../../services/themes/common/colorThemeData.js';
import '../../../../../browser/media/style.css';
import { ISessionInputBanner, SessionInputBannerWidget } from '../../../browser/sessionInputBanners/sessionInputBannerWidget.js';

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

	test('pauses the working border while it is outside the viewport', async () => {
		const host = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		host.style.cssText = 'position: fixed; top: 0; left: 0; width: 400px; height: 100px; overflow: hidden;';
		disposables.add(toDisposable(() => host.remove()));
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		const contextMenuService = upcastPartial<IContextMenuService>({ showContextMenu() { } });
		const widget = disposables.add(new SessionInputBannerWidget({
			icon: Codicon.warning,
			accent: true,
			text: '2 Checks Failing',
			ariaLabel: '2 Checks Failing',
			actions: [],
		}, hoverService, contextMenuService));
		host.appendChild(widget.domNode);
		widget.setWorking(true);

		// Under reduced motion the border has no animation, but its paused state is still tracked.
		const reduced = mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const waitForBorder = (state: 'running' | 'paused') => retry(async () => assert.deepStrictEqual({
			paused: widget.domNode.classList.contains('session-input-banner-anim-paused'),
			animations: widget.domNode.getAnimations({ subtree: true }).map(animation => animation.playState),
		}, {
			paused: state === 'paused',
			animations: reduced ? [] : [state, state],
		}), 10, 100);
		await waitForBorder('running');
		// Refreshing an already working banner must keep its visibility tracking.
		widget.setWorking(true);
		widget.domNode.style.marginTop = '200px';
		await waitForBorder('paused');
	});

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
					{ label: 'Reveal Checks', run() { } },
					{ label: 'Reveal Comments', run() { } },
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
			dropdownLabels: ['Fix Checks', 'Address Comments', 'Reveal Checks', 'Reveal Comments'],
		});
	});

	function renderCISplitButton(scheme: ColorScheme, themeClass: string) {
		const theme = ColorThemeData.createUnloadedThemeForThemeType(scheme);
		const host = mainWindow.document.createElement('div');
		host.classList.add('monaco-workbench', themeClass);
		for (const color of [focusBorder, buttonSeparator, agentsCIBannerButtonBackground, agentsCIBannerButtonForeground, agentsCIBannerButtonHoverBackground]) {
			const value = theme.getColor(color);
			if (value) {
				host.style.setProperty(asCssVariableName(color), value.toString());
			}
		}
		mainWindow.document.body.appendChild(host);
		disposables.add(toDisposable(() => host.remove()));
		const hoverService = upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		});
		const contextMenuService = upcastPartial<IContextMenuService>({ showContextMenu() { } });
		const widget = disposables.add(new SessionInputBannerWidget({
			icon: Codicon.warning,
			accent: true,
			text: 'Checks and comments',
			ariaLabel: 'Checks and comments',
			actions: [{
				label: 'Fix Checks & Address Comments',
				primary: true,
				dropdownActions: [{ label: 'Fix Checks', run() { } }],
				run() { },
			}],
		}, hoverService, contextMenuService));
		host.appendChild(widget.domNode);
		return {
			host,
			buttons: [...widget.domNode.querySelectorAll<HTMLElement>('.monaco-button-dropdown > .monaco-button')],
			separator: widget.domNode.querySelector<HTMLElement>('.monaco-button-dropdown-separator')!,
		};
	}

	for (const [scheme, themeClass] of [
		[ColorScheme.DARK, 'vs-dark'],
		[ColorScheme.LIGHT, 'vs'],
		[ColorScheme.HIGH_CONTRAST_DARK, 'hc-black'],
		[ColorScheme.HIGH_CONTRAST_LIGHT, 'hc-light'],
	] as const) {
		test(`CI split button text and separator contrast in ${scheme}`, () => {
			const { host, buttons, separator } = renderCISplitButton(scheme, themeClass);
			const separatorColor = Color.Format.CSS.parse(mainWindow.getComputedStyle(separator.firstElementChild!).backgroundColor)!;
			const separatorBackground = Color.Format.CSS.parse(mainWindow.getComputedStyle(separator).backgroundColor)!;
			const restStyles = mainWindow.getComputedStyle(buttons[0]);
			const restForeground = Color.Format.CSS.parse(restStyles.color)!;
			const restBackground = Color.Format.CSS.parse(restStyles.backgroundColor)!;
			host.style.setProperty(asCssVariableName(agentsCIBannerButtonForeground), '#00ff00');

			assert.deepStrictEqual({
				separatorOpacity: mainWindow.getComputedStyle(separator).opacity,
				separatorContrast: separatorColor.getContrastRatio(separatorBackground) >= 3,
				restTextContrast: restForeground.getContrastRatio(restBackground) >= 4.5,
				customSeparator: mainWindow.getComputedStyle(separator.firstElementChild!).backgroundColor,
			}, {
				separatorOpacity: '1',
				separatorContrast: true,
				restTextContrast: true,
				customSeparator: 'rgb(0, 255, 0)',
			});
		});

		test(`CI split button focus contrast in ${scheme}`, function () {
			if (!mainWindow.document.hasFocus()) {
				this.skip();
			}

			const { host, buttons } = renderCISplitButton(scheme, themeClass);
			const focusStates = buttons.map(button => {
				button.focus();
				const style = mainWindow.getComputedStyle(button);
				const outline = Color.Format.CSS.parse(style.outlineColor)!;
				const background = Color.Format.CSS.parse(style.backgroundColor)!;
				const foreground = Color.Format.CSS.parse(style.color)!;
				return {
					focused: mainWindow.document.activeElement === button,
					focusVisible: button.matches(':focus-visible'),
					outlineStyle: style.outlineStyle,
					outlineWidth: style.outlineWidth,
					outlineContrast: outline.getContrastRatio(background) >= 3,
					textContrast: foreground.getContrastRatio(background) >= 4.5,
				};
			});
			host.style.setProperty(asCssVariableName(agentsCIBannerButtonForeground), '#00ff00');

			assert.deepStrictEqual({
				focusStates,
				customFocus: mainWindow.getComputedStyle(buttons[1]).outlineColor,
			}, {
				focusStates: Array(2).fill({ focused: true, focusVisible: true, outlineStyle: 'solid', outlineWidth: '1px', outlineContrast: true, textContrast: true }),
				customFocus: 'rgb(0, 255, 0)',
			});
		});
	}
});
