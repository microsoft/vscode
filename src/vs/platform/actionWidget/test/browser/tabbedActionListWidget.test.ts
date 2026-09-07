/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextViewDelegate, IContextViewService } from '../../../contextview/browser/contextView.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IOpenerService } from '../../../opener/common/opener.js';
import { NullOpenerService } from '../../../opener/test/common/nullOpenerService.js';
import { ActionListItemKind, IActionListItem } from '../../browser/actionList.js';
import { TabbedActionListWidget } from '../../browser/tabbedActionListWidget.js';
import { IAccessibilityService } from '../../../accessibility/common/accessibility.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { AnchorPosition } from '../../../../base/common/layout.js';
import { mainWindow } from '../../../../base/browser/window.js';

interface ITestItem {
	readonly id: string;
	readonly checked?: boolean;
}

function action(id: string): IActionListItem<ITestItem> {
	return { kind: ActionListItemKind.Action, label: id, item: { id } };
}

/**
 * Minimal fake `IContextViewService` that captures the most recent delegate
 * and synchronously calls `render()` so we can drive the widget without a
 * real DOM-backed context view.
 */
class FakeContextViewService implements Partial<IContextViewService> {
	declare readonly _serviceBrand: undefined;

	layoutCount = 0;

	private _container: HTMLElement | undefined;
	private _activeDelegate: IContextViewDelegate | undefined;
	private _activeRenderDisposables: { dispose(): void } | undefined;

	get isVisible(): boolean {
		return !!this._activeDelegate;
	}

	showContextView(delegate: IContextViewDelegate): { close: () => void } {
		// Tear down any previous render before showing a new one.
		this.hideContextView();
		this._activeDelegate = delegate;
		this._container = document.createElement('div');
		document.body.appendChild(this._container);
		const result = delegate.render(this._container);
		if (result && typeof (result as { dispose?: () => void }).dispose === 'function') {
			this._activeRenderDisposables = result as { dispose(): void };
		}
		return { close: () => this.hideContextView() };
	}

	hideContextView(): void {
		const delegate = this._activeDelegate;
		const renderDisposables = this._activeRenderDisposables;
		const container = this._container;
		this._activeDelegate = undefined;
		this._activeRenderDisposables = undefined;
		this._container = undefined;
		// Notify the delegate first so its `onHide` runs against the still-
		// mounted DOM, mirroring the real `ContextView` order. The widget
		// uses this to fire its consumer `onHide` callback.
		delegate?.onHide?.();
		renderDisposables?.dispose();
		container?.remove();
	}

	getContextViewElement(): HTMLElement {
		return this._container ?? document.body;
	}

	layout(): void {
		this.layoutCount++;
	}
}

function createWidget(disposables: DisposableStore, motionReduced = true): { widget: TabbedActionListWidget; contextView: FakeContextViewService } {
	const instantiationService = disposables.add(new TestInstantiationService());
	const contextView = new FakeContextViewService();
	instantiationService.stub(IContextViewService, contextView as IContextViewService);
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(IHoverService, NullHoverService);
	instantiationService.set(IOpenerService, NullOpenerService);
	instantiationService.stub(IAccessibilityService, { isMotionReduced: () => motionReduced } as IAccessibilityService);
	instantiationService.stub(ILayoutService, { getContainer: () => document.body, mainContainer: document.body, onDidChangeMainContainer: () => ({ dispose: () => { } }) } as unknown as ILayoutService);

	const widget = disposables.add(instantiationService.createInstance(TabbedActionListWidget));
	return { widget, contextView };
}

suite('TabbedActionListWidget', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('construct + dispose without crashing', () => {
		const { widget } = createWidget(disposables);
		assert.strictEqual(widget.isVisible, false);
	});

	test('show() makes the popup visible and hide() dismisses it', () => {
		const { widget } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [{ id: 'Local' }, { id: 'Remote' }],
			initialTab: 'Local',
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});
		assert.strictEqual(widget.isVisible, true);

		widget.hide();
		assert.strictEqual(widget.isVisible, false);
	});

	for (const scenario of [
		{ showCheckedItemHover: true, checked: true, shown: true },
		{ showCheckedItemHover: false, checked: true, shown: false },
		{ showCheckedItemHover: true, checked: false, shown: false },
	]) {
		test(`checked hover on open: ${JSON.stringify(scenario)}`, () => {
			const { widget, contextView } = createWidget(disposables);
			const anchor = document.createElement('div');
			document.body.appendChild(anchor);
			disposables.add({ dispose: () => anchor.remove() });
			let renders = 0;
			widget.show<ITestItem>({
				user: 'test',
				anchor,
				tabs: [{ id: 'Models' }],
				initialTab: 'Models',
				showCheckedItemHover: scenario.showCheckedItemHover,
				createActionList: () => ({
					items: [action('first'), {
						...action('active'),
						item: { id: 'active', checked: scenario.checked },
						hover: {
							expandable: true,
							content: () => {
								renders++;
								const content = document.createElement('div');
								content.textContent = 'Active model details';
								return content;
							},
						},
					}],
				}),
				delegate: { onSelect: () => { }, onHide: () => { } },
			});
			const panel = contextView.getContextViewElement().querySelector<HTMLElement>('.action-list-submenu-panel')!;
			assert.deepStrictEqual({
				shown: panel.style.display !== 'none',
				renders,
				focusInPanel: panel.contains(document.activeElement),
			}, { shown: scenario.shown, renders: scenario.shown ? 1 : 0, focusInPanel: false });
			widget.hide();
		});
	}

	test('refresh keeps the popup open when rebuilding removes the focused card control', async () => {
		const { widget, contextView } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });
		const control = document.createElement('button');
		control.textContent = 'Configure';
		let refreshed = false;
		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [{ id: 'Models' }],
			initialTab: 'Models',
			showCheckedItemHover: true,
			createActionList: () => {
				if (refreshed) {
					control.remove();
				}
				return {
					items: [{
						...action('active'),
						item: { id: 'active', checked: true },
						hover: refreshed ? undefined : { content: control, expandable: true },
					}],
					listOptions: { persistentHover: true },
				};
			},
			delegate: { onSelect: () => { }, onHide: () => { } },
		});
		const popup = contextView.getContextViewElement();
		control.focus();
		refreshed = true;
		widget.refreshActiveList();
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			visible: widget.isVisible,
			focusInPopup: popup.contains(document.activeElement),
			cardClosed: popup.querySelector<HTMLElement>('.action-list-submenu-panel')?.style.display === 'none',
		}, { visible: true, focusInPopup: true, cardClosed: true });
		widget.hide();
	});

	test('buildItems is called with the initial tab', () => {
		const { widget } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		const calls: string[] = [];
		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [{ id: 'Local' }, { id: 'Remote' }],
			initialTab: 'Remote',
			createActionList: (tab) => {
				calls.push(tab);
				return { items: [action(tab)] };
			},
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		assert.deepStrictEqual(calls, ['Remote']);
	});

	test('popup class names are re-read on tab switch, not replayed from show()', () => {
		const { widget } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		let dimmed = false;
		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [{ id: 'Local' }, { id: 'Remote' }],
			initialTab: 'Local',
			widgetClassNames: tab => ['picker', `tab-${tab}`, ...(dimmed ? ['dimmed'] : [])],
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		const classes = () => {
			const popup = document.querySelector('.action-widget:not(.action-list-submenu-panel)');
			return [...(popup?.classList ?? [])].filter(name => name !== 'action-widget').sort();
		};

		const onShow = classes();
		// State the popup reports changes while it stays open.
		dimmed = true;
		widget.refreshActiveList();
		const afterRefresh = classes();
		// Switching tabs re-renders the popup, which must not bring back the old state.
		document.querySelectorAll<HTMLElement>('.tabbed-action-list-tabstrip .monaco-button')[1].click();
		const afterTabSwitch = classes();

		assert.deepStrictEqual(
			{ onShow, afterRefresh, afterTabSwitch },
			{
				onShow: ['picker', 'tab-Local'],
				afterRefresh: ['dimmed', 'picker', 'tab-Local'],
				afterTabSwitch: ['dimmed', 'picker', 'tab-Remote'],
			},
		);
	});

	test('switching tabs animates them between their old and new widths', () => {
		const { widget } = createWidget(disposables, /* motionReduced */ false);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		// Only the active tab is labelled, so a switch resizes both the tab being left
		// and the one being entered.
		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [
				{ id: 'Local', label: 'Local models', icon: Codicon.deviceDesktop },
				{ id: 'Remote', label: 'Remote models', icon: Codicon.cloud },
			],
			initialTab: 'Local',
			tabLabels: 'active',
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		const tabs = () => [...document.querySelectorAll<HTMLElement>('.tabbed-action-list-tabstrip .monaco-button')];
		// Keyframes serialize their width to fewer decimals than a measurement carries.
		const round = (width: number) => Math.round(width * 100) / 100;
		const widthsBefore = tabs().map(tab => round(tab.getBoundingClientRect().width));

		// The widths are captured on the way in, so the press has to precede the click
		// exactly as a real one does.
		tabs()[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		tabs()[1].click();

		// Reading the widths back now would only report the animation's current frame. What
		// matters is that each rebuilt tab starts from the width its predecessor had.
		const startWidths = tabs().map(tab => {
			const [animation] = tab.getAnimations();
			return animation
				? round(parseFloat(String((animation.effect as KeyframeEffect).getKeyframes()[0].width)))
				: undefined;
		});

		assert.deepStrictEqual(startWidths, widthsBefore);
		// Leave nothing mounted: later tests read the popup out of the document.
		widget.hide();
	});

	test('switching tabs does not animate when motion is reduced', () => {
		const { widget } = createWidget(disposables, /* motionReduced */ true);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [
				{ id: 'Local', label: 'Local models', icon: Codicon.deviceDesktop },
				{ id: 'Remote', label: 'Remote models', icon: Codicon.cloud },
			],
			initialTab: 'Local',
			tabLabels: 'active',
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		const tabs = () => [...document.querySelectorAll<HTMLElement>('.tabbed-action-list-tabstrip .monaco-button')];
		tabs()[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		tabs()[1].click();

		assert.deepStrictEqual(tabs().filter(tab => tab.getAnimations().length > 0), []);
		widget.hide();
	});

	test('a tab that loses its label keeps it until it has finished shrinking', async () => {
		const { widget } = createWidget(disposables, /* motionReduced */ false);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [
				{ id: 'Local', label: 'Local models', icon: Codicon.deviceDesktop },
				{ id: 'Remote', label: 'Remote models', icon: Codicon.cloud },
			],
			initialTab: 'Local',
			tabLabels: 'active',
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		const tabs = () => {
			// Other tests may still have a popup mounted, and each popup also has a submenu
			// panel that carries the same class, so read the newest one that has tabs.
			const popups = [...document.querySelectorAll<HTMLElement>('.action-widget')]
				.filter(popup => popup.querySelector('.tabbed-action-list-tabstrip'));
			const popup = popups[popups.length - 1];
			return [...popup.querySelectorAll<HTMLElement>('.tabbed-action-list-tabstrip .monaco-button')];
		};
		tabs()[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		tabs()[1].click();

		const outgoing = tabs()[0];
		const whileShrinking = {
			keepsLabel: outgoing.textContent?.includes('Local models') ?? false,
			marked: outgoing.classList.contains('label-collapsing'),
		};

		// The label is put back from the animation's finish event, which is dispatched on a
		// later turn than `finish()` itself.
		const animations = outgoing.getAnimations();
		animations.forEach(animation => animation.finish());
		await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual(
			{
				whileShrinking,
				afterShrinking: {
					keepsLabel: outgoing.textContent?.includes('Local models') ?? false,
					marked: outgoing.classList.contains('label-collapsing'),
				},
			},
			{
				whileShrinking: { keepsLabel: true, marked: true },
				afterShrinking: { keepsLabel: false, marked: false },
			},
		);
		widget.hide();
	});

	test('the sizing tab decides the list height, whichever tab the popup opens on', () => {
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		const listHeight = () => parseFloat(document.querySelector<HTMLElement>('.action-widget .actionList')?.style.height ?? '0');

		// Opens on the short tab on purpose: the height has to come from the sizing tab
		// regardless of which tab the popup happens to open on.
		const heightsAcrossTabs = (sizingTab: string | undefined) => {
			const { widget } = createWidget(disposables);
			widget.show<ITestItem>({
				user: 'test',
				anchor,
				tabs: [{ id: 'Copilot' }, { id: 'Ollama' }],
				initialTab: 'Ollama',
				sizingTab,
				createActionList: tab => ({
					items: tab === 'Copilot'
						? ['a', 'b', 'c', 'd', 'e', 'f'].map(action)
						: [action('only')],
				}),
				delegate: { onSelect: () => { }, onHide: () => { } },
			});
			const onShortTab = listHeight();
			document.querySelectorAll<HTMLElement>('.tabbed-action-list-tabstrip .monaco-button')[0].click();
			const onSizingTab = listHeight();
			widget.hide();
			return { onShortTab, onSizingTab };
		};

		const unsized = heightsAcrossTabs(undefined);
		const sized = heightsAcrossTabs('Copilot');

		// Clamping depends on the room around the anchor, which differs between the two
		// renders here, so compare how each tab is sized rather than the pixels.
		assert.deepStrictEqual(
			{
				resizesWithoutASizingTab: unsized.onShortTab < unsized.onSizingTab,
				shortTabTakesTheSizingTabsHeight: sized.onShortTab > unsized.onShortTab,
			},
			{ resizesWithoutASizingTab: true, shortTabTakesTheSizingTabsHeight: true },
		);
	});

	test('a collapsed section in the sizing tab is left out of the fixed height', () => {
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		const listHeight = () => parseFloat(document.querySelector<HTMLElement>('.action-widget .actionList')?.style.height ?? '0');

		// The sizing tab keeps most of its models behind a collapsed "other" section, so
		// only the two rows on screen should count towards the height.
		const heightWithSection = (collapsed: boolean) => {
			const { widget } = createWidget(disposables);
			widget.show<ITestItem>({
				user: 'test',
				anchor,
				tabs: [{ id: 'Copilot' }, { id: 'Ollama' }],
				initialTab: 'Ollama',
				sizingTab: 'Copilot',
				createActionList: tab => tab === 'Copilot'
					? {
						items: [
							action('promoted'),
							{ ...action('other-models'), isSectionToggle: true, section: 'other' },
							...['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ ...action(id), section: 'other' })),
						],
						listOptions: collapsed ? { collapsedByDefault: new Set(['other']) } : undefined,
					}
					: { items: [action('only')] },
				delegate: { onSelect: () => { }, onHide: () => { } },
			});
			const height = listHeight();
			widget.hide();
			return height;
		};

		assert.deepStrictEqual(
			{ collapsedIsShorter: heightWithSection(true) < heightWithSection(false) },
			{ collapsedIsShorter: true },
		);
	});

	for (const initialFooterHeight of [20, 80]) {
		test(`resizing the footer preserves the fixed popup height when opened with a ${initialFooterHeight}px footer`, async () => {
			const { widget, contextView } = createWidget(disposables);
			const anchor = document.createElement('div');
			anchor.style.cssText = 'position: fixed; top: 400px; width: 120px; height: 20px;';
			document.body.appendChild(anchor);
			disposables.add({ dispose: () => anchor.remove() });
			const button = document.createElement('button');
			button.textContent = 'Toggle';
			let currentFooterHeight = initialFooterHeight;

			const show = () => widget.show<ITestItem>({
				user: 'test',
				anchor,
				tabs: [{ id: 'Copilot' }, { id: 'Other' }],
				initialTab: 'Copilot',
				sizingTab: 'Copilot',
				width: 300,
				createActionList: tab => ({
					items: (tab === 'Copilot' ? ['a', 'b', 'c', 'd', 'e', 'f'] : ['other']).map(action),
					listOptions: { anchorPosition: AnchorPosition.ABOVE },
				}),
				renderFooter: container => {
					container.style.height = `${currentFooterHeight}px`;
					container.appendChild(button);
					return { dispose: () => button.remove() };
				},
				delegate: { onSelect: () => { }, onHide: () => { } },
			});
			show();

			const settleLayout = () => new Promise<void>(resolve => {
				mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve()));
			});
			await settleLayout();
			const popup = contextView.getContextViewElement().querySelector<HTMLElement>('.action-widget')!;
			const list = popup.querySelector<HTMLElement>('.actionList')!;
			const footer = popup.querySelector<HTMLElement>('.tabbed-action-list-footer')!;
			const initialHeight = popup.offsetHeight;
			const initialListHeight = list.offsetHeight;
			button.focus();

			const otherFooterHeight = initialFooterHeight === 20 ? 80 : 20;
			const heights = [otherFooterHeight, initialFooterHeight, 100, otherFooterHeight];
			const states = [];
			for (const height of heights) {
				const layoutCount = contextView.layoutCount;
				currentFooterHeight = height;
				footer.style.height = `${height}px`;
				await settleLayout();
				states.push({
					height: popup.offsetHeight,
					listHeight: list.offsetHeight,
					footerHeight: footer.offsetHeight,
					focused: document.activeElement === button,
					reanchored: contextView.layoutCount > layoutCount,
				});
			}

			const tabHeights = [];
			for (const index of [1, 0]) {
				contextView.getContextViewElement().querySelectorAll<HTMLElement>('.tabbed-action-list-tabstrip .monaco-button')[index].click();
				await settleLayout();
				tabHeights.push(contextView.getContextViewElement().querySelector<HTMLElement>('.action-widget')!.offsetHeight);
			}
			widget.hide();
			show();
			await settleLayout();
			const reopenedHeight = contextView.getContextViewElement().querySelector<HTMLElement>('.action-widget')!.offsetHeight;

			assert.deepStrictEqual({ states, tabHeights, reopenedHeight }, {
				states: heights.map(footerHeight => ({
					height: initialHeight,
					listHeight: initialListHeight + initialFooterHeight - footerHeight,
					footerHeight,
					focused: true,
					reanchored: true,
				})),
				tabHeights: [initialHeight, initialHeight],
				reopenedHeight: initialHeight + currentFooterHeight - initialFooterHeight,
			});
			widget.hide();
		});
	}

	test('hide() then show() resets visibility cleanly', () => {
		const { widget } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		const showOnce = () => widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [{ id: 'Local' }],
			initialTab: 'Local',
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		showOnce();
		widget.hide();
		assert.strictEqual(widget.isVisible, false);
		showOnce();
		assert.strictEqual(widget.isVisible, true);
		widget.hide();
	});

	test('onDidHide fires when the popup dismisses', () => {
		const { widget, contextView } = createWidget(disposables);
		const anchor = document.createElement('div');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });

		let hidden = 0;
		disposables.add(widget.onDidHide(() => { hidden++; }));
		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [{ id: 'Local' }],
			initialTab: 'Local',
			createActionList: () => ({ items: [action('a')] }),
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		// Simulate an external dismissal (e.g. user clicked outside).
		contextView.hideContextView();
		assert.strictEqual(hidden, 1, `expected onDidHide to fire once, got ${hidden}; widget visible: ${widget.isVisible}`);
		assert.strictEqual(widget.isVisible, false);
	});
});
