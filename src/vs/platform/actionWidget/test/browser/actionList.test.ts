/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { toAction } from '../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event as CommonEvent } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { IContextViewService } from '../../../contextview/browser/contextView.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IOpenerService } from '../../../opener/common/opener.js';
import { NullOpenerService } from '../../../opener/test/common/nullOpenerService.js';
import { URI } from '../../../../base/common/uri.js';
import { ActionList, ActionListItemKind, ActionListWidget, IActionListItem, IActionListOptions } from '../../browser/actionList.js';
import { AnchorPosition } from '../../../../base/common/layout.js';

interface ITestActionItem {
	readonly id: string;
	readonly checked?: boolean;
}

function action(id: string): IActionListItem<ITestActionItem> {
	return { kind: ActionListItemKind.Action, label: id, item: { id } };
}

function separator(label?: string): IActionListItem<ITestActionItem> {
	return { kind: ActionListItemKind.Separator, label };
}

function createActionListWidget(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, options: {
	readonly items?: readonly IActionListItem<ITestActionItem>[];
	readonly onFilter?: (filter: string, cancellationToken: CancellationToken) => Promise<readonly IActionListItem<ITestActionItem>[]>;
	readonly onHide?: () => void;
	readonly onSelect?: (item: ITestActionItem) => void;
	readonly listOptions?: Partial<IActionListOptions>;
}): ActionListWidget<ITestActionItem> {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(IHoverService, NullHoverService);
	instantiationService.set(IOpenerService, NullOpenerService);
	const delegate = options.onFilter
		? {
			onHide: options.onHide ?? (() => { }),
			onSelect: options.onSelect ?? (() => { }),
			onFilter: options.onFilter,
		}
		: {
			onHide: options.onHide ?? (() => { }),
			onSelect: options.onSelect ?? (() => { }),
		};

	const widget = disposables.add(instantiationService.createInstance(
		ActionListWidget<ITestActionItem>,
		'testActionList',
		false,
		options.items ?? [action('initial')],
		delegate,
		undefined,
		{ showFilter: true, ...options.listOptions },
	));

	if (widget.filterContainer) {
		document.body.appendChild(widget.filterContainer);
		disposables.add({ dispose: () => widget.filterContainer?.remove() });
	}
	// The header banner is a standalone element the caller attaches (like the
	// filter container), so the test appends it to exercise header behaviors.
	const headerContainer = widget.headerContainer;
	if (headerContainer) {
		document.body.appendChild(headerContainer);
		disposables.add({ dispose: () => headerContainer.remove() });
	}
	document.body.appendChild(widget.domNode);
	disposables.add({ dispose: () => widget.domNode.remove() });
	widget.layout(200, 200);

	return widget;
}

function typeFilter(widget: ActionListWidget<ITestActionItem>, value: string): void {
	assert.ok(widget.filterInput);
	widget.filterInput.value = value;
	widget.filterInput.dispatchEvent(new Event('input'));
}

function getVisibleRowText(widget: ActionListWidget<ITestActionItem>): string[] {
	return Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row'))
		.map(row => row.textContent ?? '')
		.filter(text => text.length > 0);
}

function withWindowInnerHeight<T>(height: number, callback: () => T): T {
	const originalDescriptor = Object.getOwnPropertyDescriptor(mainWindow, 'innerHeight');
	Object.defineProperty(mainWindow, 'innerHeight', { configurable: true, value: height });
	try {
		return callback();
	} finally {
		if (originalDescriptor) {
			Object.defineProperty(mainWindow, 'innerHeight', originalDescriptor);
		} else {
			Reflect.deleteProperty(mainWindow, 'innerHeight');
		}
	}
}

function createActionList(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, items: readonly IActionListItem<ITestActionItem>[], options?: {
	readonly listOptions?: Partial<IActionListOptions>;
	readonly anchor?: { x: number; y: number; width: number; height: number };
}): ActionList<ITestActionItem> {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(IHoverService, NullHoverService);
	instantiationService.set(IOpenerService, NullOpenerService);
	instantiationService.stub(IContextViewService, {
		layout: () => { },
		hideContextView: () => { },
		getContextViewElement: () => document.body,
	} as Partial<IContextViewService> as IContextViewService);
	instantiationService.stub(ILayoutService, {
		getContainer: () => document.body,
		mainContainer: document.body,
		activeContainer: document.body,
		onDidLayoutMainContainer: CommonEvent.None,
		onDidLayoutContainer: CommonEvent.None,
		onDidLayoutActiveContainer: CommonEvent.None,
		onDidAddContainer: CommonEvent.None,
		onDidChangeActiveContainer: CommonEvent.None,
	} as Partial<ILayoutService> as ILayoutService);

	const list = disposables.add(instantiationService.createInstance(
		ActionList<ITestActionItem>,
		'testActionList',
		false,
		items,
		{
			onHide: () => { },
			onSelect: () => { },
		},
		undefined,
		{ showFilter: true, ...options?.listOptions },
		options?.anchor ?? { x: 10, y: 150, width: 20, height: 20 },
	));

	const widget = document.createElement('div');
	widget.classList.add('action-widget');
	document.body.appendChild(widget);
	disposables.add({ dispose: () => widget.remove() });
	if (list.filterContainer) {
		widget.appendChild(list.filterContainer);
	}
	widget.appendChild(list.domNode);

	return list;
}

suite('ActionListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const eventType of ['mousemove', 'mousedown']) {
		test(`hover presentation stays suppressed until ${eventType}`, () => {
			const widget = createActionListWidget(disposables, {
				items: [action('first'), action('second'), action('third')],
				listOptions: { showFilter: false },
			});
			const row = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')[2];
			const getHoverPresentation = () => {
				const rules = Array.from(widget.domNode.querySelector('style')!.sheet!.cssRules)
					.filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
					.filter(rule => rule.selectorText.includes('.monaco-list-row:hover'));
				return {
					suppressed: widget.domNode.classList.contains('ignore-initial-hover'),
					properties: rules.flatMap(rule => Array.from(rule.style)).sort(),
				};
			};
			const initial = getHoverPresentation();

			widget.focus();
			widget.focusNext();
			row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			const afterKeyboardFocus = getHoverPresentation();

			row.dispatchEvent(new MouseEvent(eventType, { bubbles: true }));
			const afterPointerInteraction = getHoverPresentation();

			assert.deepStrictEqual({ initial, afterKeyboardFocus, afterPointerInteraction }, {
				initial: { suppressed: true, properties: [] },
				afterKeyboardFocus: { suppressed: true, properties: [] },
				afterPointerInteraction: { suppressed: false, properties: ['background-color', 'color', 'outline-color', 'outline-offset', 'outline-style', 'outline-width'] },
			});
		});
	}

	test('opening under a stationary pointer preserves keyboard focus and selection', () => {
		const selected: string[] = [];
		const widget = createActionListWidget(disposables, {
			items: [action('first'), action('second'), action('third')],
			onSelect: item => selected.push(item.id),
			listOptions: { showFilter: false },
		});
		const rows = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row');
		widget.focus();
		rows[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'first');

		widget.focusNext();
		rows[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		widget.acceptSelected();
		assert.deepStrictEqual(selected, ['second']);
	});

	test('pointer movement enables hover on the initial row and subsequent rows', () => {
		const widget = createActionListWidget(disposables, {
			items: [action('first'), action('second'), action('third')],
			listOptions: { showFilter: false },
		});
		const rows = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row');
		widget.focus();
		rows[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		rows[1].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'second');

		rows[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'third');
	});

	test('the first click selects its row without prior pointer movement', () => {
		const selected: string[] = [];
		const widget = createActionListWidget(disposables, {
			items: [action('first'), action('second')],
			onSelect: item => selected.push(item.id),
			listOptions: { showFilter: false },
		});
		widget.focus();
		const row = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
		row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		row.click();
		assert.deepStrictEqual(selected, ['second']);
	});

	test('initial pointer movement and clicks do not select disabled items', () => {
		const selected: string[] = [];
		const widget = createActionListWidget(disposables, {
			items: [action('first'), { ...action('disabled'), disabled: true }],
			onSelect: item => selected.push(item.id),
			listOptions: { showFilter: false },
		});
		widget.focus();
		const row = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
		row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		row.click();
		assert.deepStrictEqual(selected, []);
	});

	test('initial hover does not open a submenu until the pointer moves', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [action('first'), { ...action('second'), hover: { content: 'Details' } }],
			listOptions: { showFilter: false },
		});
		widget.focus();
		const row = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(500);
		assert.strictEqual(panel.style.display, 'none');

		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		await timeout(500);
		assert.notStrictEqual(panel.style.display, 'none');
	}));

	function createPersistentPreview(side: 'left' | 'right' = 'right') {
		const selected: string[] = [];
		const contents = ['first', 'second', 'third'].map(label => {
			const content = document.createElement('div');
			content.textContent = `Details for ${label}`;
			content.style.cssText = 'width: 180px; height: 180px;';
			return content;
		});
		const widget = createActionListWidget(disposables, {
			items: [
				...contents.map((content, index) => ({
					...action(['first', 'second', 'third'][index]),
					hover: { content },
				})),
				action('plain'),
			],
			onSelect: item => selected.push(item.id),
			listOptions: { showFilter: false, persistentHover: true, headerText: 'Cache hint' },
		});
		const popup = document.createElement('div');
		popup.className = 'action-widget';
		popup.style.cssText = `position: fixed; top: 120px; left: ${side === 'left' ? mainWindow.innerWidth - 320 : 40}px; width: 260px; padding: 8px;`;
		document.body.appendChild(popup);
		disposables.add({ dispose: () => popup.remove() });
		popup.appendChild(widget.domNode);
		widget.layout(120, 240);
		const rows = () => widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row');
		const hover = (index: number, clientX?: number) => {
			const row = rows()[index];
			const bounds = row.getBoundingClientRect();
			const point = { x: clientX ?? bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
			row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: point.x, clientY: point.y }));
			row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: point.x, clientY: point.y }));
			return point;
		};
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const isCenteredOnRow = (index: number) => {
			const rowBounds = rows()[index].getBoundingClientRect();
			const panelBounds = panel.getBoundingClientRect();
			return Math.abs(panelBounds.top + panelBounds.height / 2 - rowBounds.top - rowBounds.height / 2) < 1;
		};
		return { widget, popup, panel, contents, selected, rows, hover, isCenteredOnRow };
	}

	test('renders and activates a standalone toggle row', () => {
		let checked = false;
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('Sandboxing for terminal'),
				standaloneToggle: {
					label: 'Sandboxing for terminal',
					checked: false,
					onChange: value => { checked = value; },
				},
			}],
			listOptions: { showFilter: false },
		});

		widget.focus();
		widget.acceptSelected();

		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row');
		assert.deepStrictEqual({
			checked,
			standaloneClass: row?.classList.contains('has-standalone-toggle'),
			label: row?.querySelector('.title')?.textContent,
			toggleLabelCount: row?.querySelectorAll('.action-list-item-inline-toggle-label').length,
			switchChecked: row?.querySelector('.monaco-switch')?.classList.contains('checked'),
			title: row?.title,
		}, {
			checked: true,
			standaloneClass: true,
			label: 'Sandboxing for terminal',
			toggleLabelCount: 0,
			switchChecked: true,
			title: '',
		});
	});

	test('does not activate a disabled standalone toggle row', () => {
		let changeCount = 0;
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('Sandboxing for terminal'),
				standaloneToggle: {
					label: 'Sandboxing for terminal',
					title: 'Managed by your organization',
					checked: true,
					disabled: true,
					onChange: () => { changeCount++; },
				},
			}],
		});

		widget.focus();
		widget.acceptSelected();
		const toggle = widget.domNode.querySelector<HTMLElement>('.monaco-switch');

		assert.deepStrictEqual({
			changeCount,
			checked: toggle?.classList.contains('checked'),
			disabled: (toggle as HTMLButtonElement | null)?.disabled,
			title: toggle?.getAttribute('aria-label'),
		}, {
			changeCount: 0,
			checked: true,
			disabled: true,
			title: 'Managed by your organization',
		});
	});

	test('Escape from a submenu hides the action list', () => {
		let hideCount = 0;
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('parent'),
				submenuActions: [toAction({ id: 'child', label: 'Child', run: () => { } })],
			}],
			onHide: () => hideCount++,
		});

		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		const submenu = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel > .actionList');
		assert.ok(submenu);
		submenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		assert.strictEqual(hideCount, 1);
	});

	test('runs dynamic filter updates immediately', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const filters: string[] = [];
		const widget = createActionListWidget(disposables, {
			onFilter: async filter => {
				filters.push(filter);
				return [action(`server-${filter === 'ma' ? 'ranked' : filter}-result`)];
			},
		});

		typeFilter(widget, 'm');
		typeFilter(widget, 'ma');
		assert.deepStrictEqual(filters, ['m', 'ma']);
		await timeout(0);
		assert.ok(widget.domNode.textContent?.includes('server-ranked-result'));
	}));

	test('ignores stale dynamic filter results', async () => {
		const firstResult = new DeferredPromise<readonly IActionListItem<ITestActionItem>[]>();
		const secondResult = new DeferredPromise<readonly IActionListItem<ITestActionItem>[]>();
		const filters: string[] = [];
		const widget = createActionListWidget(disposables, {
			onFilter: filter => {
				filters.push(filter);
				return filter === 'm' ? firstResult.p : secondResult.p;
			},
		});

		typeFilter(widget, 'm');
		typeFilter(widget, 'ma');
		assert.deepStrictEqual(filters, ['m', 'ma']);

		firstResult.complete([action('ma-stale-result')]);
		await timeout(0);
		assert.ok(!widget.domNode.textContent?.includes('ma-stale-result'));

		secondResult.complete([action('ma-fresh-result')]);
		await timeout(0);
		assert.ok(widget.domNode.textContent?.includes('ma-fresh-result'));
	});

	test('does not filter while an IME composition is in progress', () => {
		const filters: string[] = [];
		const widget = createActionListWidget(disposables, {
			onFilter: async filter => {
				filters.push(filter);
				return [action(`result-${filter}`)];
			},
		});

		assert.ok(widget.filterInput);
		widget.filterInput.dispatchEvent(new Event('compositionstart'));
		typeFilter(widget, 'd');
		typeFilter(widget, 'deepseek');
		widget.filterInput.value = 'DeepSeek';
		widget.filterInput.dispatchEvent(new Event('compositionend'));
		// Chromium fires a trailing `input` for the committed text, which must not re-filter.
		typeFilter(widget, 'DeepSeek');

		assert.deepStrictEqual(filters, ['DeepSeek']);
	});

	test('cancels an in-flight dynamic filter when a composition starts', async () => {
		const pending = new DeferredPromise<readonly IActionListItem<ITestActionItem>[]>();
		const widget = createActionListWidget(disposables, {
			onFilter: () => pending.p,
		});

		typeFilter(widget, 'd');
		assert.ok(widget.filterInput);
		widget.filterInput.dispatchEvent(new Event('compositionstart'));

		// Resolving now must not splice/re-layout the list underneath the IME candidate window.
		pending.complete([action('stale-result')]);
		await timeout(0);
		assert.ok(!widget.domNode.textContent?.includes('stale-result'));
	});

	test('batches row width writes before reading layout', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				action('first'),
				{ ...action('second'), toolbarActions: [toAction({ id: 'toolbar', label: 'Toolbar', run: () => { } })] },
				action('third'),
			],
		});
		const rows = Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row'));
		const allRowsAutoAtRead: boolean[] = [];
		const measuredWidths = [120, 240, 180];
		for (let i = 0; i < rows.length; i++) {
			rows[i].getBoundingClientRect = () => {
				allRowsAutoAtRead.push(rows.every(row => row.style.width === 'auto'));
				return new mainWindow.DOMRect(0, 0, measuredWidths[i], 24);
			};
		}

		const width = widget.computeMaxWidth(0);

		assert.deepStrictEqual({
			width,
			allRowsAutoAtRead,
			restoredWidths: rows.map(row => row.style.width),
		}, {
			width: 268,
			allRowsAutoAtRead: [true, true, true],
			restoredWidths: ['', '', ''],
		});
	});

	test('does not double count a detail row toolbar when computing max width', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				{ ...action('detail'), detail: 'Description', toolbarActions: [toAction({ id: 'toolbar', label: 'Toolbar', run: () => { } })] },
			],
		});
		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!;
		row.getBoundingClientRect = () => new mainWindow.DOMRect(0, 0, 240, 48);

		const width = widget.computeMaxWidth(0);

		assert.deepStrictEqual({
			width,
			restoredWidth: row.style.width,
		}, {
			width: 240,
			restoredWidth: '',
		});
	});

	test('keeps detail row geometry stable when its toolbar becomes visible', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				action('plain'),
				{ ...action('detail'), detail: 'Description', toolbarActions: [toAction({ id: 'toolbar', label: 'Toolbar', run: () => { } })] },
				...Array.from({ length: 20 }, (_, index) => action(`filler-${index}`)),
			],
		});
		const wrapper = document.createElement('div');
		wrapper.classList.add('action-widget');
		widget.domNode.parentElement?.insertBefore(wrapper, widget.domNode);
		wrapper.appendChild(widget.domNode);
		disposables.add({ dispose: () => wrapper.remove() });

		const rows = Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row'));
		const detailRow = rows[1];
		const detail = detailRow.querySelector<HTMLElement>('.detail')!;
		const toolbar = detailRow.querySelector<HTMLElement>('.action-list-item-toolbar')!;
		const verticalScrollbar = widget.domNode.querySelector<HTMLElement>('.scrollbar.vertical')!;
		const initial = {
			rowHeight: detailRow.getBoundingClientRect().height,
			detailTop: detail.getBoundingClientRect().top,
			toolbarDisplay: mainWindow.getComputedStyle(toolbar).display,
			toolbarVisibility: mainWindow.getComputedStyle(toolbar).visibility,
			toolbarMarginRight: mainWindow.getComputedStyle(toolbar).marginRight,
		};
		detailRow.classList.add('focused');
		const focused = {
			rowHeight: detailRow.getBoundingClientRect().height,
			detailTop: detail.getBoundingClientRect().top,
			toolbarDisplay: mainWindow.getComputedStyle(toolbar).display,
			toolbarVisibility: mainWindow.getComputedStyle(toolbar).visibility,
			toolbarMarginRight: mainWindow.getComputedStyle(toolbar).marginRight,
			clearsScrollbar: detailRow.getBoundingClientRect().right - toolbar.getBoundingClientRect().right >= verticalScrollbar.getBoundingClientRect().width,
		};

		assert.deepStrictEqual({
			rows: rows.slice(0, 2).map(row => ({
				hasDetail: row.classList.contains('has-detail'),
				hasToolbar: row.classList.contains('has-toolbar'),
			})),
			initial,
			focused,
		}, {
			rows: [
				{ hasDetail: false, hasToolbar: false },
				{ hasDetail: true, hasToolbar: true },
			],
			initial: {
				rowHeight: 48,
				detailTop: initial.detailTop,
				toolbarDisplay: 'flex',
				toolbarVisibility: 'hidden',
				toolbarMarginRight: '10px',
			},
			focused: {
				rowHeight: 48,
				detailTop: initial.detailTop,
				toolbarDisplay: 'flex',
				toolbarVisibility: 'visible',
				toolbarMarginRight: '10px',
				clearsScrollbar: true,
			},
		});
	});

	test('keeps titled separator above first filtered match', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				separator('Provider A'),
				action('alpha'),
				separator('Provider B'),
				action('beta'),
			],
		});

		typeFilter(widget, 'alpha');

		assert.deepStrictEqual(getVisibleRowText(widget), ['Provider A', 'alpha']);
	});

	test('keeps only titled separators for sections with filtered matches', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				separator('Provider A'),
				action('alpha'),
				separator('Provider B'),
				action('beta'),
				separator('Provider C'),
				action('gamma'),
			],
		});

		typeFilter(widget, 'beta');

		assert.deepStrictEqual(getVisibleRowText(widget), ['Provider B', 'beta']);
	});

	test('excludes separators from accessible list positions after filtering', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				action('selected'),
				separator(),
				action('alpha'),
				action('beta'),
			],
		});
		const getAriaPositions = () => Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row[role="option"]')).map(row => ({
			label: row.getAttribute('aria-label'),
			setSize: row.getAttribute('aria-setsize'),
			posInSet: row.getAttribute('aria-posinset'),
		}));

		const initial = getAriaPositions();
		typeFilter(widget, 'a');
		const filtered = getAriaPositions();

		assert.deepStrictEqual({ initial, filtered }, {
			initial: [
				{ label: 'selected', setSize: '3', posInSet: '1' },
				{ label: 'alpha', setSize: '3', posInSet: '2' },
				{ label: 'beta', setSize: '3', posInSet: '3' },
			],
			filtered: [
				{ label: 'alpha', setSize: '2', posInSet: '1' },
				{ label: 'beta', setSize: '2', posInSet: '2' },
			],
		});
	});

	test('leaves room for action widget chrome when clamping dynamic height', () => withWindowInnerHeight(300, () => {
		const list = createActionList(disposables, Array.from({ length: 50 }, (_, i) => action(`item-${i}`)));

		list.layout(200);

		const filterHeight = 36;
		const widget = list.domNode.parentElement!;
		const style = mainWindow.getComputedStyle(widget);
		const toPixels = (value: string): number => Number.parseFloat(value) || 0;
		const actionWidgetVerticalChromeHeight = toPixels(style.paddingTop) + toPixels(style.paddingBottom) + toPixels(style.borderTopWidth) + toPixels(style.borderBottomWidth);
		const availableSpaceAboveAnchor = 150;
		const listHeight = parseFloat(list.domNode.style.height);
		assert.ok(listHeight + filterHeight + actionWidgetVerticalChromeHeight <= availableSpaceAboveAnchor);
	}));

	test('forced above anchor position can clamp dynamic height without the default minimum floor', () => withWindowInnerHeight(300, () => {
		const list = createActionList(disposables, Array.from({ length: 50 }, (_, i) => action(`item-${i}`)), {
			listOptions: { anchorPosition: AnchorPosition.ABOVE },
			anchor: { x: 10, y: 20, width: 20, height: 20 },
		});

		list.layout(200);

		assert.deepStrictEqual(
			{ anchorPosition: list.anchorPosition, listHeight: parseFloat(list.domNode.style.height) },
			{ anchorPosition: AnchorPosition.ABOVE, listHeight: 0 },
		);
	}));

	test('header dismiss removes the banner and requests a re-layout', () => {
		let dismissed = false;
		let layoutRequested = false;
		const widget = createActionListWidget(disposables, {
			listOptions: { headerText: 'Cache hint', headerDismiss: () => { dismissed = true; } },
		});
		disposables.add(widget.onDidRequestLayout(() => { layoutRequested = true; }));

		const header = widget.headerContainer;
		assert.ok(header, 'header banner should render when headerText + headerDismiss are set');
		const dismissButton = header!.querySelector<HTMLElement>('.action-list-header-dismiss');
		assert.ok(dismissButton, 'dismiss button should render');

		dismissButton!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

		assert.deepStrictEqual(
			{ dismissed, layoutRequested, headerCleared: widget.headerContainer === undefined, headerStillInDom: header!.isConnected },
			{ dismissed: true, layoutRequested: true, headerCleared: true, headerStillInDom: false },
		);
	});

	test('an expandable row names the panel it opens, and stops when it closes', () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'panel', expandable: true } }, action('plain')],
			listOptions: { reserveSubmenuSpace: 'always' },
		});
		const rows = () => Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row.action'));
		const state = () => rows().map(row => ({
			haspopup: row.getAttribute('aria-haspopup'),
			expanded: row.getAttribute('aria-expanded'),
		}));

		const initial = state();
		// The chevron is what opens the panel; ArrowRight does the same from the keyboard.
		rows()[0].querySelector<HTMLElement>('.action-list-submenu-indicator.has-submenu')?.click();
		const opened = state();
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel');
		const panelRole = panel?.getAttribute('role');
		const panelLabel = panel?.getAttribute('aria-label');
		// Escape inside the panel is the way back to the row.
		panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		const closed = state();

		assert.deepStrictEqual(
			{ initial, opened, closed, panelRole, panelLabel },
			{
				// The plain row opens nothing, so it says nothing.
				initial: [{ haspopup: 'dialog', expanded: 'false' }, { haspopup: null, expanded: null }],
				opened: [{ haspopup: 'dialog', expanded: 'true' }, { haspopup: null, expanded: null }],
				closed: [{ haspopup: 'dialog', expanded: 'false' }, { haspopup: null, expanded: null }],
				panelRole: 'dialog',
				panelLabel: 'auto',
			},
		);
	});

	test('the submenu gutter follows the items the list currently holds', () => {
		const expandable = (id: string): IActionListItem<ITestActionItem> => ({ ...action(id), hover: { content: 'panel', expandable: true } });
		const gutters = (widget: ActionListWidget<ITestActionItem>) =>
			Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row .action-list-submenu-indicator'))
				.map(el => el.style.display === 'none' ? 'none' : (el.style.visibility || 'shown'));

		const widget = createActionListWidget(disposables, { items: [expandable('one'), action('two')] });
		const always = createActionListWidget(disposables, {
			items: [expandable('one'), action('two')],
			listOptions: { reserveSubmenuSpace: 'always' },
		});

		const before = { byDefault: gutters(widget), always: gutters(always) };
		// The chevrons go away, so by default the gutter goes with them.
		widget.updateItems([action('one'), action('two')]);
		always.updateItems([action('one'), action('two')]);

		assert.deepStrictEqual(
			{ before, afterLosingChevrons: { byDefault: gutters(widget), always: gutters(always) } },
			{
				before: { byDefault: ['shown', 'hidden'], always: ['shown', 'hidden'] },
				afterLosingChevrons: { byDefault: ['none', 'none'], always: ['hidden', 'hidden'] },
			},
		);
	});

	test('hidden hover chevrons preserve keyboard access without reserving a gutter', () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('model'), hover: { content: 'Model details', expandable: true, showIndicator: false } }],
			listOptions: { showFilter: false, reserveSubmenuSpace: false },
		});
		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row.action')!;
		const indicator = row.querySelector<HTMLElement>('.action-list-submenu-indicator')!;
		const initial = {
			indicator: indicator.style.display,
			haspopup: row.getAttribute('aria-haspopup'),
			expanded: row.getAttribute('aria-expanded'),
		};
		widget.focus();
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const opened = {
			role: panel.getAttribute('role'),
			focused: document.activeElement === panel,
			expanded: row.getAttribute('aria-expanded'),
		};
		panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

		assert.deepStrictEqual({
			initial,
			opened,
			closed: { expanded: row.getAttribute('aria-expanded'), focusReturned: widget.domNode.contains(document.activeElement) && !panel.contains(document.activeElement) },
		}, {
			initial: { indicator: 'none', haspopup: 'dialog', expanded: 'false' },
			opened: { role: 'dialog', focused: true, expanded: 'true' },
			closed: { expanded: 'false', focusReturned: true },
		});
	});

	test('rebuilding the items in place re-measures only when the row count changed', () => {
		const widget = createActionListWidget(disposables, { items: [action('one'), action('two')] });
		const layouts: string[] = [];
		disposables.add(widget.onDidRequestLayout(() => { layouts.push(getVisibleRowText(widget).join(',')); }));

		widget.updateItems([action('one'), action('two-renamed')]);
		const afterSameCount = layouts.length;
		widget.updateItems([action('one'), action('two-renamed'), action('three')]);

		assert.deepStrictEqual(
			{ afterSameCount, afterGrowing: layouts, rows: getVisibleRowText(widget) },
			{ afterSameCount: 0, afterGrowing: ['one,two-renamed,three'], rows: ['one', 'two-renamed', 'three'] },
		);
	});

	test('rebuilding the items in place leaves focus alone when the list does not have it', () => {
		const widget = createActionListWidget(disposables, { items: [action('one'), action('two')] });
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		disposables.add({ dispose: () => outside.remove() });
		outside.focus();

		widget.updateItems([action('one'), action('two'), action('three')]);

		assert.deepStrictEqual(
			{ focusStayedOutside: document.activeElement === outside, rows: getVisibleRowText(widget) },
			{ focusStayedOutside: true, rows: ['one', 'two', 'three'] },
		);
	});

	test('shows a row hover panel once the hover delay elapses', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'Auto routes based on your task' } }, action('other')],
			listOptions: { headerText: 'Cache hint' },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		await timeout(1000);

		assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: '', text: 'Auto routes based on your task' });
	}));

	test('persistent previews follow each row immediately without selecting or taking pointer focus', () => {
		const { widget, panel, selected, hover, isCenteredOnRow } = createPersistentPreview();
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		disposables.add({ dispose: () => outside.remove() });
		outside.focus();

		hover(0);
		const first = panel.textContent;
		const firstCentered = isCenteredOnRow(0);
		hover(1);
		const second = panel.textContent;
		const secondCentered = isCenteredOnRow(1);
		const pointerFocusPreserved = document.activeElement === outside;
		widget.focus();
		widget.focusNext();

		assert.deepStrictEqual({
			first,
			second,
			keyboard: panel.textContent,
			pointerFocusPreserved,
			selected,
			centeredOnRows: [firstCentered, secondCentered, isCenteredOnRow(2)],
		}, {
			first: 'Details for first',
			second: 'Details for second',
			keyboard: 'Details for third',
			pointerFocusPreserved: true,
			selected: [],
			centeredOnRows: [true, true, true],
		});
	});

	test('persistent previews start with the focused item when the tab has no checked item', () => {
		const { widget, panel, selected } = createPersistentPreview();
		widget.focus();
		widget.showHoverForCheckedItem();

		assert.deepStrictEqual({
			content: panel.textContent,
			selected,
			focused: widget.getFocusedElement()?.item?.id,
		}, { content: 'Details for first', selected: [], focused: 'first' });
	});

	test('persistent previews remain visible over chrome, plain rows, and pointer gaps', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { widget, panel, contents, hover } = createPersistentPreview();
		hover(0);
		widget.domNode.dispatchEvent(new MouseEvent('mouseleave'));
		panel.dispatchEvent(new MouseEvent('mouseenter'));
		panel.dispatchEvent(new MouseEvent('mouseleave'));
		widget.headerContainer!.dispatchEvent(new MouseEvent('mouseenter'));
		hover(3);
		await timeout(1000);

		assert.deepStrictEqual({
			display: panel.style.display,
			content: panel.textContent,
			sameContent: panel.firstElementChild === contents[0],
		}, { display: '', content: 'Details for first', sameContent: true });
	}));

	test('persistent previews close when their source items are replaced', () => {
		const { widget, panel, hover } = createPersistentPreview();
		hover(0);
		widget.updateItems([action('replacement')]);
		assert.deepStrictEqual({ display: panel.style.display, content: panel.textContent }, { display: 'none', content: '' });
	});

	test('persistent previews retain their last row position during virtualization', () => {
		const { widget, panel, contents, hover } = createPersistentPreview();
		hover(2);
		const top = panel.getBoundingClientRect().top;
		widget.layout(24, 240);

		assert.deepStrictEqual({
			display: panel.style.display,
			sameContent: panel.firstElementChild === contents[2],
			positionRetained: Math.abs(panel.getBoundingClientRect().top - top) < 1,
		}, { display: '', sameContent: true, positionRetained: true });
	});

	test('persistent previews keep their side and width across differently sized content', () => {
		const { popup, panel, contents, hover, isCenteredOnRow } = createPersistentPreview();
		popup.style.left = `${mainWindow.innerWidth - 480}px`;
		contents[0].style.width = '260px';
		contents[1].style.width = '120px';
		hover(0);
		const first = panel.getBoundingClientRect();
		const firstCentered = isCenteredOnRow(0);
		hover(1);
		const second = panel.getBoundingClientRect();
		const parent = popup.getBoundingClientRect();

		assert.deepStrictEqual({
			firstOnLeft: Math.abs(first.right - parent.left) < 1,
			secondOnLeft: Math.abs(second.right - parent.left) < 1,
			centeredOnRows: [firstCentered, isCenteredOnRow(1)],
			widthUnchanged: first.width === second.width,
		}, { firstOnLeft: true, secondOnLeft: true, centeredOnRows: [true, true], widthUnchanged: true });
	});

	for (const side of ['left', 'right'] as const) {
		test(`pointer travel into the ${side} preview does not switch to a crossed row`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { panel, hover } = createPersistentPreview(side);
			const origin = hover(0);
			hover(1, origin.x + (side === 'right' ? 60 : -60));
			const duringTravel = panel.textContent;
			await timeout(100);
			panel.dispatchEvent(new MouseEvent('mouseenter'));
			await timeout(300);
			const afterEntering = panel.textContent;
			panel.dispatchEvent(new MouseEvent('mouseleave'));
			hover(1);

			assert.deepStrictEqual({ duringTravel, afterEntering, afterReturning: panel.textContent }, {
				duringTravel: 'Details for first',
				afterEntering: 'Details for first',
				afterReturning: 'Details for second',
			});
		}));
	}

	test('pointer travel grace is bounded across multiple crossed rows', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { panel, hover } = createPersistentPreview();
		const origin = hover(0);
		hover(1, origin.x + 60);
		await timeout(150);
		hover(2, origin.x + 80);
		const beforeExpiry = panel.textContent;
		await timeout(60);

		assert.deepStrictEqual({ beforeExpiry, afterExpiry: panel.textContent }, {
			beforeExpiry: 'Details for first',
			afterExpiry: 'Details for third',
		});
	}));

	test('keyboard navigation supersedes a pending pointer preview', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { widget, panel, hover } = createPersistentPreview();
		const origin = hover(0);
		hover(1, origin.x + 60);
		widget.focus();
		widget.focusNext();
		const immediate = panel.textContent;
		await timeout(300);

		assert.deepStrictEqual({ immediate, afterDelay: panel.textContent }, {
			immediate: 'Details for third',
			afterDelay: 'Details for third',
		});
	}));

	test('disposing a persistent preview cancels pending pointer travel', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { widget, panel, hover } = createPersistentPreview();
		const origin = hover(0);
		hover(1, origin.x + 60);
		widget.dispose();
		await timeout(300);

		assert.strictEqual(panel.textContent, 'Details for first');
	}));

	test('does not open a row hover panel once the pointer has left the list', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'Auto routes based on your task' } }, action('other')],
			listOptions: { headerText: 'Cache hint' },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		// The banner is a sibling of the list, so reaching it drags the pointer across a row.
		widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		widget.domNode.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(1000);

		assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: 'none', text: '' });
	}));

	test('dismisses an open row hover panel when the pointer reaches the header banner', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'Auto routes based on your task' } }, action('other')],
			listOptions: { headerText: 'Cache hint' },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		// Dwelling on the row long enough for the panel to open, then continuing to the banner.
		widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		await timeout(600);
		const openedWhileOnRow = panel.textContent;

		widget.domNode.dispatchEvent(new MouseEvent('mouseleave'));
		widget.headerContainer!.dispatchEvent(new MouseEvent('mouseenter'));

		assert.deepStrictEqual(
			{ openedWhileOnRow, display: panel.style.display, text: panel.textContent },
			{ openedWhileOnRow: 'Auto routes based on your task', display: 'none', text: '' },
		);
	}));

	test('header renders a "Learn more" link to the given uri', () => {
		const widget = createActionListWidget(disposables, {
			listOptions: { headerText: 'Cache hint', headerLink: { label: 'Learn more', uri: URI.parse('https://aka.ms/test') } },
		});

		const link = widget.headerContainer?.querySelector<HTMLAnchorElement>('a.monaco-link');
		assert.ok(link, 'a "Learn more" link should render in the header');
		assert.deepStrictEqual(
			{ text: link!.textContent, href: link!.getAttribute('href') },
			{ text: 'Learn more', href: 'https://aka.ms/test' },
		);
	});

	test('focuses the configured initial item when opened', () => {
		const widget = createActionListWidget(disposables, {
			items: [action('first'), action('active'), action('last')],
			listOptions: { initialFocusItemId: 'active' },
		});

		widget.focus();

		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'active');
	});

	test('opening the checked hover reveals a model in a collapsed section', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				action('pinned'),
				{
					...action('active'),
					item: { id: 'active', checked: true },
					section: 'other',
					hover: { content: 'Active model details' },
				},
			],
			listOptions: { showFilter: false, collapsedByDefault: new Set(['other']) },
		});
		widget.focus();
		widget.showHoverForCheckedItem();

		assert.deepStrictEqual({
			focused: widget.getFocusedElement()?.item?.id,
			details: widget.domNode.querySelector('.action-list-submenu-panel')?.textContent,
		}, { focused: 'active', details: 'Active model details' });
	});

	for (const activeIndex of [2, 8]) {
		test(`width measurement keeps the hover anchored to visible item ${activeIndex}`, async () => {
			const content = document.createElement('div');
			content.textContent = 'Model details';
			content.style.cssText = 'width: 120px; height: 80px;';
			const widget = createActionListWidget(disposables, {
				items: [
					...Array.from({ length: 10 }, (_, index) => index === activeIndex
						? { ...action('active'), item: { id: 'active', checked: true }, hover: { content, alignToParent: true } }
						: action(`visible-${index}`)),
					...Array.from({ length: 20 }, (_, index) => ({ ...action(`hidden-${index}`), section: 'other' })),
				],
				listOptions: { showFilter: false, collapsedByDefault: new Set(['other']) },
			});
			const popup = document.createElement('div');
			popup.className = 'action-widget';
			popup.style.cssText = 'position: fixed; top: 160px; left: 40px; width: 260px; padding: 8px;';
			document.body.appendChild(popup);
			disposables.add({ dispose: () => popup.remove() });
			popup.appendChild(widget.domNode);
			widget.layout(120, 240);
			widget.focus();
			widget.showHoverForCheckedItem();

			const settleLayout = () => new Promise<void>(resolve => {
				mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve()));
			});
			const measure = () => {
				const row = Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')).find(row => row.textContent === 'active');
				const rowBounds = row?.getBoundingClientRect();
				const listBounds = widget.domNode.getBoundingClientRect();
				const panelBounds = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!.getBoundingClientRect();
				return {
					rowVisible: !!rowBounds && rowBounds.top >= listBounds.top && rowBounds.bottom <= listBounds.bottom,
					centeredOnRow: !!rowBounds && Math.abs(rowBounds.top + rowBounds.height / 2 - panelBounds.top - panelBounds.height / 2) < 1,
					expanded: row?.getAttribute('aria-expanded'),
					focused: widget.getFocusedElement()?.item?.id,
				};
			};
			await settleLayout();
			const before = measure();
			widget.computeMaxWidth(240);
			widget.layout(120, 240);
			content.style.height = '100px';
			await settleLayout();

			const expected = { rowVisible: true, centeredOnRow: true, expanded: 'true', focused: 'active' };
			assert.deepStrictEqual({ before, after: measure() }, { before: expected, after: expected });
		});
	}

	for (const side of ['left', 'right']) {
		for (const zoom of [1, 1.25]) {
			test(`hover aligns with the outer ${side} border at ${zoom} zoom`, () => {
				const content = document.createElement('div');
				content.textContent = 'Model details';
				content.style.cssText = 'width: 120px; height: 80px;';
				const widget = createActionListWidget(disposables, {
					items: [{ ...action('active'), item: { id: 'active', checked: true }, hover: { content, alignToParent: true } }],
					listOptions: { showFilter: false },
				});
				const popup = document.createElement('div');
				popup.className = 'action-widget';
				popup.style.cssText = `position: fixed; top: 120px; left: ${side === 'left' ? (mainWindow.innerWidth - 320) / zoom : 0}px; width: 240px; padding: 8px; zoom: ${zoom};`;
				document.body.appendChild(popup);
				disposables.add({ dispose: () => popup.remove() });
				popup.appendChild(widget.domNode);
				widget.focus();
				const focusedElement = document.activeElement;

				widget.showHoverForCheckedItem();

				const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
				const parentBounds = popup.getBoundingClientRect();
				const panelBounds = panel.getBoundingClientRect();
				const gap = side === 'left' ? parentBounds.left - panelBounds.right : panelBounds.left - parentBounds.right;
				assert.deepStrictEqual({
					shown: panel.style.display !== 'none',
					aligned: Math.abs(gap) < 1,
					focusPreserved: document.activeElement === focusedElement,
				}, { shown: true, aligned: true, focusPreserved: true });
			});
		}
	}

	test('consumes initial focus before later filtering and refocusing', () => {
		const widget = createActionListWidget(disposables, {
			items: [action('match-first'), action('match-initial'), action('other')],
			listOptions: { initialFocusItemId: 'match-initial' },
		});

		widget.focus();
		widget.focusPrevious();
		typeFilter(widget, 'match');
		widget.focus();

		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'match-first');
	});

});
