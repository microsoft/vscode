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
	readonly listOptions?: Partial<IActionListOptions>;
}): ActionListWidget<ITestActionItem> {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(IHoverService, NullHoverService);
	instantiationService.set(IOpenerService, NullOpenerService);
	const delegate = options.onFilter
		? {
			onHide: options.onHide ?? (() => { }),
			onSelect: () => { },
			onFilter: options.onFilter,
		}
		: {
			onHide: options.onHide ?? (() => { }),
			onSelect: () => { },
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
			switchChecked: row?.querySelector('.action-list-inline-switch')?.classList.contains('checked'),
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
		const toggle = widget.domNode.querySelector<HTMLElement>('.action-list-inline-switch');

		assert.deepStrictEqual({
			changeCount,
			checked: toggle?.classList.contains('checked'),
			disabled: toggle?.getAttribute('aria-disabled'),
			title: toggle?.getAttribute('aria-label'),
		}, {
			changeCount: 0,
			checked: true,
			disabled: 'true',
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

	test('shows a row hover panel once the hover delay elapses', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'Auto routes based on your task' } }, action('other')],
			listOptions: { headerText: 'Cache hint' },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(1000);

		assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: '', text: 'Auto routes based on your task' });
	}));

	test('does not open a row hover panel once the pointer has left the list', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'Auto routes based on your task' } }, action('other')],
			listOptions: { headerText: 'Cache hint' },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		// The banner is a sibling of the list, so reaching it drags the pointer across a row.
		widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
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
		widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
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
