/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
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
import { TestAccessibilityService } from '../../../accessibility/test/common/testAccessibilityService.js';
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

function createWidget(disposables: DisposableStore, motionReduced = true) {
	const instantiationService = disposables.add(new TestInstantiationService());
	const contextView = new FakeContextViewService();
	const onDidChangeReducedMotion = disposables.add(new Emitter<void>());
	instantiationService.stub(IContextViewService, contextView as IContextViewService);
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(IHoverService, NullHoverService);
	instantiationService.set(IOpenerService, NullOpenerService);
	instantiationService.set(IAccessibilityService, new class extends TestAccessibilityService {
		override onDidChangeReducedMotion = onDidChangeReducedMotion.event;
		override isMotionReduced(): boolean { return motionReduced; }
	}());
	instantiationService.stub(ILayoutService, { getContainer: () => document.body, mainContainer: document.body, onDidChangeMainContainer: () => ({ dispose: () => { } }) } as unknown as ILayoutService);

	const widget = disposables.add(instantiationService.createInstance(TabbedActionListWidget));
	return {
		widget,
		contextView,
		setMotionReduced: (reduced: boolean) => {
			motionReduced = reduced;
			onDidChangeReducedMotion.fire();
		},
	};
}

function createCollapsibleWidget(disposables: DisposableStore, motionReduced = true, collapsed = false) {
	const result = createWidget(disposables, motionReduced);
	const { widget, contextView } = result;
	const anchor = document.createElement('div');
	anchor.style.cssText = 'position: fixed; top: 400px; width: 120px; height: 20px;';
	document.body.appendChild(anchor);
	disposables.add({ dispose: () => anchor.remove() });
	const button = document.createElement('button');
	button.textContent = 'Toggle';
	const hover = document.createElement('div');
	hover.style.height = '100px';
	widget.show<ITestItem>({
		user: 'test',
		anchor,
		tabs: [{ id: 'Local' }, { id: 'Remote' }],
		initialTab: 'Local',
		sizingTab: 'Local',
		width: 300,
		createActionList: () => ({
			items: ['a', 'b', 'c', 'd'].map(id => ({
				...action(id),
				hover: collapsed ? undefined : { content: hover, alignToParent: true, preserveVerticalPosition: true },
			})),
			listOptions: { anchorPosition: AnchorPosition.ABOVE, persistentHover: true },
		}),
		isBodyCollapsed: () => collapsed,
		renderFooter: container => {
			container.style.height = '20px';
			container.appendChild(button);
			return { dispose: () => button.remove() };
		},
		focusFooter: () => button.focus(),
		delegate: { onSelect: () => { }, onHide: () => { } },
	});
	contextView.getContextViewElement().style.cssText = 'position: fixed; bottom: 32px; left: 20px;';
	const popup = contextView.getContextViewElement().querySelector<HTMLElement>('.action-widget')!;
	const body = popup.querySelector<HTMLElement>('.tabbed-action-list-body')!;
	return {
		...result,
		popup,
		body,
		button,
		setCollapsed: (next: boolean) => {
			collapsed = next;
			widget.refreshActiveList();
		},
	};
}

function settleLayout(): Promise<void> {
	return new Promise(resolve => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve())));
}

function createSearchableWidget(disposables: DisposableStore, itemIds: readonly string[]) {
	const { widget, contextView } = createWidget(disposables);
	const anchor = document.createElement('div');
	document.body.appendChild(anchor);
	disposables.add({ dispose: () => anchor.remove() });
	const selected: string[] = [];
	const tabChanges: string[] = [];
	disposables.add(widget.onDidChangeTab(tab => tabChanges.push(tab)));
	widget.show<ITestItem>({
		user: 'test',
		anchor,
		tabs: [{ id: 'Local' }, { id: 'Remote' }],
		initialTab: 'Local',
		filterInTabBar: true,
		createActionList: () => ({
			items: itemIds.map(action),
			listOptions: {
				showFilter: true,
				focusFilterOnOpen: true,
				filterAsCombobox: true,
				initialFilterValue: 'match',
			},
		}),
		delegate: {
			onSelect: item => {
				selected.push(item.id);
				widget.hide();
			},
			onHide: () => { },
		},
	});
	const input = contextView.getContextViewElement().querySelector<HTMLInputElement>('input');
	assert.ok(input);
	return { widget, input, selected, tabChanges };
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

	test('items receive pointer input immediately after opening', () => {
		const { widget, contextView } = createWidget(disposables);
		const anchor = document.createElement('button');
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });
		const selected: string[] = [];

		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [{ id: 'Local' }, { id: 'Remote' }],
			initialTab: 'Local',
			createActionList: () => ({ items: [action('first'), action('second')] }),
			delegate: { onSelect: item => selected.push(item.id), onHide: () => { } },
		});
		const container = contextView.getContextViewElement();
		container.style.cssText = 'position: fixed; top: 20px; left: 20px; z-index: 10000;';
		const row = container.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
		const bounds = row.getBoundingClientRect();
		assert.ok(row.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)));
		row.click();
		assert.deepStrictEqual(selected, ['second']);
		widget.hide();
	});

	for (const matches of [['first match'], ['first match', 'second match']]) {
		test(`tab-bar search accepts after ArrowDown with ${matches.length} matching results`, () => {
			const { widget, input, selected } = createSearchableWidget(disposables, [...matches, 'other']);
			const down = new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true });
			input.dispatchEvent(down);
			const inputFocusedAfterNavigation = document.activeElement === input;
			const enter = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
			input.dispatchEvent(enter);

			assert.deepStrictEqual({
				inputFocusedAfterNavigation,
				downPrevented: down.defaultPrevented,
				enterPrevented: enter.defaultPrevented,
				selected,
				visible: widget.isVisible,
			}, {
				inputFocusedAfterNavigation: true,
				downPrevented: true,
				enterPrevented: true,
				selected: [matches[matches.length - 1]],
				visible: false,
			});
		});
	}

	test('tab-bar search keeps text editing and IME keys out of popup navigation', () => {
		const { widget, input, selected, tabChanges } = createSearchableWidget(disposables, ['first match', 'second match']);
		const events = [
			{ key: 'ArrowLeft', keyCode: 37 },
			{ key: 'ArrowRight', keyCode: 39 },
			{ key: 'Home', keyCode: 36 },
			{ key: 'End', keyCode: 35 },
			{ key: 'ArrowLeft', keyCode: 37, shiftKey: true },
			{ key: 'ArrowDown', keyCode: 40, shiftKey: true },
			{ key: 'a', keyCode: 65, metaKey: true },
			{ key: 'Enter', keyCode: 13, isComposing: true },
			{ key: 'Enter', keyCode: 229 },
		].map(init => {
			const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
			input.dispatchEvent(event);
			return event;
		});
		input.dispatchEvent(new Event('compositionstart'));
		for (const init of [{ key: 'Enter', keyCode: 13 }, { key: 'Escape', keyCode: 27 }]) {
			const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
			input.dispatchEvent(event);
			events.push(event);
		}
		input.dispatchEvent(new Event('compositionend'));
		const visibleBeforeEscape = widget.isVisible;
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));

		assert.deepStrictEqual({
			prevented: events.filter(event => event.defaultPrevented).map(event => event.key),
			tabChanges,
			selected,
			visibleBeforeEscape,
			visibleAfterEscape: widget.isVisible,
		}, {
			prevented: [],
			tabChanges: [],
			selected: [],
			visibleBeforeEscape: true,
			visibleAfterEscape: false,
		});
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

	for (const focusPanel of [false, true]) {
		test(`Escape from a detail ${focusPanel ? 'panel' : 'button'} returns to the list before dismissing the picker`, async () => {
			const { widget, contextView } = createWidget(disposables);
			const anchor = document.createElement('div');
			document.body.appendChild(anchor);
			disposables.add({ dispose: () => anchor.remove() });
			const button = document.createElement('button');
			button.textContent = 'Pin Model';
			widget.show<ITestItem>({
				user: 'test',
				anchor,
				tabs: [{ id: 'Models' }],
				initialTab: 'Models',
				showCheckedItemHover: true,
				createActionList: () => ({
					items: [{
						...action('model'),
						item: { id: 'model', checked: true },
						hover: { content: button, expandable: true },
					}],
					listOptions: { persistentHover: true },
				}),
				delegate: { onSelect: () => { }, onHide: () => { } },
			});
			const popup = contextView.getContextViewElement();
			const panel = popup.querySelector<HTMLElement>('.action-list-submenu-panel')!;
			const focusTarget = focusPanel ? panel : button;
			focusTarget.focus();
			focusTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			const afterFirstEscape = {
				visible: widget.isVisible,
				panelHidden: panel.style.display === 'none',
				listFocused: popup.querySelector('.monaco-list') === document.activeElement,
			};
			document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));

			assert.deepStrictEqual({ afterFirstEscape, visibleAfterSecondEscape: widget.isVisible }, {
				afterFirstEscape: { visible: true, panelHidden: true, listFocused: true },
				visibleAfterSecondEscape: false,
			});
		});
	}

	for (const motionReduced of [false, true]) {
		test(`refresh preserves the focused detail control and moves its row with reduced motion ${motionReduced}`, async () => {
			const { widget, contextView } = createWidget(disposables, motionReduced);
			const anchor = document.createElement('div');
			anchor.style.cssText = 'position: fixed; top: 400px; left: 20px; width: 100px; height: 20px;';
			document.body.appendChild(anchor);
			disposables.add({ dispose: () => anchor.remove() });
			const content = document.createElement('div');
			const button = document.createElement('button');
			button.textContent = 'Pin Model';
			content.appendChild(button);
			let pinned = false;
			widget.show<ITestItem>({
				user: 'test',
				anchor,
				tabs: [{ id: 'Models' }],
				initialTab: 'Models',
				showCheckedItemHover: true,
				createActionList: () => {
					const model = { ...action('model'), item: { id: 'model', checked: true }, hover: { content, expandable: true, preserveVerticalPosition: true } };
					const others = ['one', 'two', 'three'].map(action);
					return { items: pinned ? [model, ...others] : [...others, model], listOptions: { showFilter: false, persistentHover: true } };
				},
				delegate: { onSelect: () => { }, onHide: () => { } },
			});
			button.focus();
			const popup = contextView.getContextViewElement();
			const panel = popup.querySelector<HTMLElement>('.action-list-submenu-panel')!;
			const before = panel.getBoundingClientRect();
			pinned = true;
			widget.refreshActiveList({ focusItemId: 'model', preserveHover: true, animateItemMove: true });
			const moved = Array.from(popup.querySelectorAll<HTMLElement>('.monaco-list-row')).find(row => row.textContent === 'model')!;
			const animations = moved.getAnimations();
			const animated = animations.length > 0;
			animations.forEach(animation => animation.finish());
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve())));
			const after = panel.getBoundingClientRect();

			assert.deepStrictEqual({
				visible: widget.isVisible,
				sameContent: panel.contains(content),
				buttonFocused: document.activeElement === button,
				stationary: Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1,
				animated,
			}, {
				visible: true,
				sameContent: true,
				buttonFocused: true,
				stationary: true,
				animated: !motionReduced && !mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches,
			});
			widget.hide();
		});
	}

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

	test('opening with a collapsed body focuses the footer without animating', () => {
		const { body, button } = createCollapsibleWidget(disposables, false, true);
		body.querySelector<HTMLElement>('.monaco-button')!.focus();

		assert.deepStrictEqual({
			height: body.offsetHeight,
			inert: body.inert,
			visibility: mainWindow.getComputedStyle(body).visibility,
			focused: document.activeElement === button,
			animations: body.getAnimations().length,
		}, { height: 0, inert: true, visibility: 'hidden', focused: true, animations: 0 });
	});

	for (const motionReduced of [false, true]) {
		test(`collapsing and expanding preserves focus, sizing and hover placement with reduced motion ${motionReduced}`, async () => {
			const { widget, popup, body, button, setCollapsed } = createCollapsibleWidget(disposables, motionReduced);
			await settleLayout();
			const initialHeight = popup.offsetHeight;
			const bodyHeight = body.offsetHeight;
			const list = body.querySelector<HTMLElement>('.actionList')!;
			const listHeight = list.offsetHeight;

			setCollapsed(true);
			const collapseAnimated = body.getAnimations().length > 0;
			body.getAnimations().forEach(animation => animation.finish());
			await settleLayout();
			const collapsed = {
				height: popup.offsetHeight,
				bodyHeight: body.offsetHeight,
				inert: body.inert,
				focused: document.activeElement === button,
				visibility: mainWindow.getComputedStyle(body).visibility,
			};

			setCollapsed(false);
			const expandAnimated = body.getAnimations().length > 0;
			const panel = popup.querySelector<HTMLElement>('.action-list-submenu-panel')!;
			const hoverDeferred = panel.style.display === 'none';
			body.getAnimations().forEach(animation => animation.finish());
			await settleLayout();
			const panelBounds = panel.getBoundingClientRect();
			const rowBounds = body.querySelector<HTMLElement>('.monaco-list-row[aria-expanded="true"]')!.getBoundingClientRect();
			assert.deepStrictEqual({
				collapseAnimated,
				expandAnimated,
				hoverDeferred,
				hoverCentered: Math.abs(panelBounds.top + panelBounds.height / 2 - rowBounds.top - rowBounds.height / 2) < 1,
				hoverAligned: Math.abs(panelBounds.left - popup.getBoundingClientRect().right) < 1,
				collapsed,
				expanded: {
					height: popup.offsetHeight,
					bodyHeight: body.offsetHeight,
					listHeight: list.offsetHeight,
					inert: body.inert,
					focused: document.activeElement === button,
					visibility: mainWindow.getComputedStyle(body).visibility,
					visible: widget.isVisible,
				},
			}, {
				collapseAnimated: !motionReduced,
				expandAnimated: !motionReduced,
				hoverDeferred: !motionReduced,
				hoverCentered: true,
				hoverAligned: true,
				collapsed: { height: initialHeight - bodyHeight, bodyHeight: 0, inert: true, focused: true, visibility: 'hidden' },
				expanded: { height: initialHeight, bodyHeight, listHeight, inert: false, focused: true, visibility: 'visible', visible: true },
			});
		});
	}

	test('reversing a collapse continues from its current height and keeps reanchoring', async () => {
		const { body, contextView, setCollapsed } = createCollapsibleWidget(disposables, false);
		const initialHeight = body.offsetHeight;
		setCollapsed(true);
		const [collapse] = body.getAnimations();
		collapse.pause();
		collapse.currentTime = 100;
		const halfwayHeight = body.offsetHeight;
		const layoutCount = contextView.layoutCount;
		await settleLayout();
		const reanchored = contextView.layoutCount > layoutCount;

		setCollapsed(false);
		const [expand] = body.getAnimations();
		const fromHeight = Number.parseFloat(String((expand.effect as KeyframeEffect).getKeyframes()[0].height));
		expand.finish();
		await settleLayout();
		assert.deepStrictEqual({
			intermediateHeight: halfwayHeight > 0 && halfwayHeight < initialHeight,
			reanchored,
			cancelled: collapse.playState,
			fromHeight,
			finalHeight: body.offsetHeight,
			animating: body.classList.contains('animating'),
		}, {
			intermediateHeight: true,
			reanchored: true,
			cancelled: 'idle',
			fromHeight: halfwayHeight,
			finalHeight: initialHeight,
			animating: false,
		});
	});

	test('enabling reduced motion finishes an active collapse immediately', () => {
		const { body, setCollapsed, setMotionReduced } = createCollapsibleWidget(disposables, false);
		const initialHeight = body.offsetHeight;
		setCollapsed(true);
		setMotionReduced(true);
		const collapsedHeight = body.offsetHeight;
		setCollapsed(false);

		assert.deepStrictEqual({
			collapsedHeight,
			expandedHeight: body.offsetHeight,
			animations: body.getAnimations().length,
			animating: body.classList.contains('animating'),
		}, { collapsedHeight: 0, expandedHeight: initialHeight, animations: 0, animating: false });
	});

	test('hiding the popup cancels its active collapse animation', () => {
		const { widget, body, setCollapsed } = createCollapsibleWidget(disposables, false);
		setCollapsed(true);
		const [animation] = body.getAnimations();
		widget.hide();

		assert.deepStrictEqual({
			visible: widget.isVisible,
			playState: animation.playState,
			animations: body.getAnimations().length,
		}, { visible: false, playState: 'idle', animations: 0 });
	});

	test('resizing a collapsed footer does not corrupt the expanded popup height', async () => {
		const { popup, body, button, setCollapsed } = createCollapsibleWidget(disposables, true, true);
		await settleLayout();
		const content = body.querySelector<HTMLElement>('.tabbed-action-list-body-content')!;
		const expandedHeight = popup.offsetHeight + content.offsetHeight;
		const collapsedHeight = popup.offsetHeight;
		button.parentElement!.style.height = '80px';
		await settleLayout();
		const resizedHeight = popup.offsetHeight;
		setCollapsed(false);

		assert.deepStrictEqual({
			resizedHeight,
			expandedHeight: popup.offsetHeight,
			focused: document.activeElement === button,
		}, { resizedHeight: collapsedHeight + 60, expandedHeight, focused: true });
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
		const heightsAcrossTabs = (sizingTab: string | undefined, sizingItemIds = ['a', 'b', 'c', 'd', 'e', 'f']) => {
			const { widget } = createWidget(disposables);
			widget.show<ITestItem>({
				user: 'test',
				anchor,
				tabs: [{ id: 'Copilot' }, { id: 'Ollama' }],
				initialTab: 'Ollama',
				sizingTab,
				createActionList: tab => ({
					items: tab === 'Copilot'
						? sizingItemIds.map(action)
						: [action('only')],
				}),
				delegate: { onSelect: () => { }, onHide: () => { } },
			});
			const onShortTab = listHeight();
			widget.refreshActiveList();
			const afterRefresh = listHeight();
			document.querySelectorAll<HTMLElement>('.tabbed-action-list-tabstrip .monaco-button')[0].click();
			const onSizingTab = listHeight();
			widget.hide();
			return { onShortTab, afterRefresh, onSizingTab };
		};

		const unsized = heightsAcrossTabs(undefined);
		const sized = heightsAcrossTabs('Copilot');
		const empty = heightsAcrossTabs('Copilot', []);

		// Clamping depends on the room around the anchor, which differs between the two
		// renders here, so compare how each tab is sized rather than the pixels.
		assert.deepStrictEqual(
			{
				resizesWithoutASizingTab: unsized.onShortTab < unsized.onSizingTab,
				shortTabTakesTheSizingTabsHeight: sized.onShortTab > unsized.onShortTab,
				emptySizingTab: [empty.onShortTab, empty.afterRefresh],
			},
			{
				resizesWithoutASizingTab: true,
				shortTabTakesTheSizingTabsHeight: true,
				emptySizingTab: [unsized.onShortTab, unsized.onShortTab],
			},
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

	test('refreshing pins preserves collapsed sizing across tabs and search', async () => {
		const { widget, contextView } = createWidget(disposables);
		const anchor = document.createElement('div');
		anchor.style.cssText = 'position: fixed; top: 400px; width: 120px; height: 20px;';
		document.body.appendChild(anchor);
		disposables.add({ dispose: () => anchor.remove() });
		const content = document.createElement('button');
		content.textContent = 'Unpin Model';
		let pinned = true;
		let searching = false;

		widget.show<ITestItem>({
			user: 'test',
			anchor,
			tabs: [{ id: 'Copilot' }, { id: 'Other' }],
			initialTab: 'Copilot',
			sizingTab: 'Copilot',
			showCheckedItemHover: true,
			createActionList: (tab, forSizing) => {
				const model = {
					...action('model'),
					item: { id: 'model', checked: true },
					section: pinned ? undefined : 'other',
					hover: { content, expandable: true },
				};
				return {
					items: searching && !forSizing ? ['one', 'two', 'three', 'four', 'five', 'six'].map(action) : tab === 'Copilot' ? [
						...(pinned ? [{ kind: ActionListItemKind.Separator, label: 'Pinned' }, model] : []),
						action('suggested'),
						{ ...action('other-models'), section: 'other', isSectionToggle: true },
						...(pinned ? [] : [model]),
						...['one', 'two', 'three'].map(id => ({ ...action(id), section: 'other' })),
					] : [action('provider-model')],
					listOptions: { collapsedByDefault: new Set(['other']), anchorPosition: AnchorPosition.ABOVE, persistentHover: true },
				};
			},
			delegate: { onSelect: () => { }, onHide: () => { } },
		});

		const listHeight = () => contextView.getContextViewElement().querySelector<HTMLElement>('.actionList')!.offsetHeight;
		const initialHeight = listHeight();
		const toggleOther = () => {
			const row = Array.from(contextView.getContextViewElement().querySelectorAll<HTMLElement>('.monaco-list-row'))
				.find(row => row.textContent === 'other-models');
			assert.ok(row);
			row.click();
		};
		content.focus();
		pinned = false;
		widget.refreshActiveList({ focusItemId: 'model', preserveHover: true });
		toggleOther();
		await Promise.resolve();
		const afterUnpin = listHeight();
		const tabHeights = [];
		for (const index of [1, 0]) {
			contextView.getContextViewElement().querySelectorAll<HTMLElement>('.tabbed-action-list-tabstrip .monaco-button')[index].click();
			tabHeights.push(listHeight());
		}
		searching = true;
		widget.refreshActiveList();
		const searchHeight = listHeight();
		pinned = true;
		widget.refreshActiveList();
		const afterPin = listHeight();
		widget.hide();

		assert.deepStrictEqual({ afterUnpin, tabHeights, searchHeight, afterPin }, {
			afterUnpin: initialHeight / 2,
			tabHeights: [initialHeight / 2, initialHeight / 2],
			searchHeight: initialHeight / 2,
			afterPin: initialHeight,
		});
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
