/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { IOpenerService } from '../../../opener/common/opener.js';
import { NullOpenerService } from '../../../opener/test/common/nullOpenerService.js';
import { ActionListItemKind, ActionListWidget, IActionListItem } from '../../browser/actionList.js';

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
});
