/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
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
import { ActionList, ActionListItemKind, ActionListWidget, IActionListItem } from '../../browser/actionList.js';

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
}): ActionListWidget<ITestActionItem> {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(IHoverService, NullHoverService);
	instantiationService.set(IOpenerService, NullOpenerService);
	const delegate = options.onFilter
		? {
			onHide: () => { },
			onSelect: () => { },
			onFilter: options.onFilter,
		}
		: {
			onHide: () => { },
			onSelect: () => { },
		};

	const widget = disposables.add(instantiationService.createInstance(
		ActionListWidget<ITestActionItem>,
		'testActionList',
		false,
		options.items ?? [action('initial')],
		delegate,
		undefined,
		{ showFilter: true },
	));

	if (widget.filterContainer) {
		document.body.appendChild(widget.filterContainer);
		disposables.add({ dispose: () => widget.filterContainer?.remove() });
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

function createActionList(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, items: readonly IActionListItem<ITestActionItem>[]): ActionList<ITestActionItem> {
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
		{ showFilter: true },
		{ x: 10, y: 150, width: 20, height: 20 },
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
});
