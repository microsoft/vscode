/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { BranchPicker, IBranchPickerBranch, IBranchPickerState } from '../../browser/branchPicker.js';

class RecordingActionWidgetService extends Disposable implements IActionWidgetService {
	declare readonly _serviceBrand: undefined;
	isVisible = false;
	labels: readonly string[] = [];
	filter: ((query: string) => Promise<void>) | undefined;
	private readonly filterCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private selectItem: ((label: string) => void) | undefined;
	private onHide: (() => void) | undefined;

	show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
		this.isVisible = true;
		const setItems = (items: readonly IActionListItem<T>[]) => {
			this.labels = items.map(item => item.label ?? '');
			this.selectItem = label => {
				const item = items.find(candidate => candidate.label === label)?.item;
				if (item) {
					delegate.onSelect(item);
				}
			};
		};
		setItems(items);
		const onFilter = delegate.onFilter;
		this.filter = onFilter ? async query => {
			this.filterCts.value?.cancel();
			const cts = new CancellationTokenSource();
			this.filterCts.value = cts;
			try {
				const filteredItems = await onFilter(query, cts.token);
				if (!cts.token.isCancellationRequested) {
					setItems(filteredItems);
				}
			} finally {
				if (this.filterCts.value === cts) {
					this.filterCts.clear();
				}
			}
		} : undefined;
		this.onHide = delegate.onHide;
	}

	updateItems<T>(items: readonly IActionListItem<T>[]): void {
		this.labels = items.map(item => item.label ?? '');
	}

	getFocusedElement<T>(): IActionListItem<T> | undefined {
		return undefined;
	}

	focusItemById(): void { }

	hide(): void {
		if (!this.isVisible) {
			return;
		}
		this.isVisible = false;
		this.filterCts.value?.cancel();
		this.filterCts.clear();
		this.filter = undefined;
		this.selectItem = undefined;
		const onHide = this.onHide;
		this.onHide = undefined;
		onHide?.();
	}

	select(label: string): void {
		this.selectItem?.(label);
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}

suite('BranchPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPicker() {
		const actionWidgetService = disposables.add(new RecordingActionWidgetService());
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, actionWidgetService);
		const selected: string[] = [];
		const picker = disposables.add(instantiationService.createInstance(BranchPicker, {
			user: 'test.branchPicker',
			onSelectBranch: branch => selected.push(branch),
		}));
		const container = document.createElement('div');
		picker.render(container);
		const trigger = container.querySelector<HTMLElement>('.action-label')!;
		return { picker, actionWidgetService, trigger, selected };
	}

	for (const hasReplacementFilter of [true, false]) {
		test(`cancels stale searches when the branch filter is ${hasReplacementFilter ? 'replaced' : 'removed'}`, async () => {
			const { picker, actionWidgetService, trigger, selected } = createPicker();
			const branches = new DeferredPromise<readonly IBranchPickerBranch[]>();
			const started = new DeferredPromise<CancellationToken>();
			const queries: string[] = [];
			picker.update({
				label: 'original/main', branches: [{ name: 'original/main' }], status: 'ready', canOpen: true,
				filterBranches: async (query, token) => {
					queries.push(`original:${query}`);
					void started.complete(token);
					return branches.p;
				},
			});
			picker.showPicker();
			const filtering = actionWidgetService.filter?.('release');
			const token = await started.p;

			picker.update({
				label: 'replacement/main', branches: [{ name: 'replacement/main' }], status: 'ready', canOpen: true,
				filterBranches: hasReplacementFilter ? async query => {
					queries.push(`replacement:${query}`);
					return [{ name: `replacement/${query}` }];
				} : undefined,
			});
			const updated = {
				visible: actionWidgetService.isVisible,
				expanded: trigger.getAttribute('aria-expanded'),
				cancelled: token.isCancellationRequested,
			};
			picker.showPicker();
			await branches.complete([{ name: 'original/stale' }]);
			await filtering;
			const labelsAfterStaleResults = actionWidgetService.labels;
			actionWidgetService.select('original/stale');
			const hasFilter = !!actionWidgetService.filter;
			await actionWidgetService.filter?.('release');
			actionWidgetService.select(hasReplacementFilter ? 'replacement/release' : 'replacement/main');

			assert.deepStrictEqual({
				updated,
				labelsAfterStaleResults,
				hasFilter,
				queries,
				selected,
			}, {
				updated: { visible: false, expanded: 'false', cancelled: true },
				labelsAfterStaleResults: ['replacement/main'],
				hasFilter: hasReplacementFilter,
				queries: hasReplacementFilter ? ['original:release', 'replacement:release'] : ['original:release'],
				selected: [hasReplacementFilter ? 'replacement/release' : 'replacement/main'],
			});
		});
	}

	test('reopens with search when a branch filter is added', async () => {
		const { picker, actionWidgetService, trigger, selected } = createPicker();
		const state: IBranchPickerState = {
			label: 'main', branches: [{ name: 'main' }], status: 'ready', canOpen: true,
		};
		picker.update(state);
		picker.showPicker();
		picker.update({ ...state, filterBranches: async query => [{ name: query }] });
		const updated = { visible: actionWidgetService.isVisible, expanded: trigger.getAttribute('aria-expanded') };
		picker.showPicker();
		await actionWidgetService.filter?.('release');
		actionWidgetService.select('release');

		assert.deepStrictEqual({ updated, selected }, {
			updated: { visible: false, expanded: 'false' },
			selected: ['release'],
		});
	});

	test('preserves an active search when the branch filter is unchanged', async () => {
		const { picker, actionWidgetService, trigger, selected } = createPicker();
		const branches = new DeferredPromise<readonly IBranchPickerBranch[]>();
		const started = new DeferredPromise<CancellationToken>();
		const state: IBranchPickerState = {
			label: 'main', branches: [{ name: 'main' }], status: 'ready', canOpen: true,
			filterBranches: async (_query, token) => {
				void started.complete(token);
				return branches.p;
			},
		};
		picker.update(state);
		picker.showPicker();
		const filtering = actionWidgetService.filter?.('release');
		const token = await started.p;
		picker.update({ ...state, branches: [{ name: 'main' }, { name: 'feature' }] });
		const updated = {
			visible: actionWidgetService.isVisible,
			expanded: trigger.getAttribute('aria-expanded'),
			cancelled: token.isCancellationRequested,
		};
		await branches.complete([{ name: 'release' }]);
		await filtering;
		actionWidgetService.select('release');

		assert.deepStrictEqual({ updated, selected }, {
			updated: { visible: true, expanded: 'true', cancelled: false },
			selected: ['release'],
		});
	});
});
