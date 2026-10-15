/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProgressService, Progress } from '../../../../../platform/progress/common/progress.js';
import { TimelinePane } from '../../browser/timelinePane.js';
import { ITimelineService, Timeline, TimelineEditable, TimelineRequest } from '../../common/timeline.js';

interface TestTimelinePane {
	clear: TimelinePane['clear'];
	loadTimelineForSource: TimelinePane['loadTimelineForSource'];
	onProvidersChanged: TimelinePane['onProvidersChanged'];
	onEditableChanged: TimelinePane['onEditableChanged'];
	loadMore: TimelinePane['loadMore'];
	refresh: TimelinePane['refresh'];
	pendingRequests: TimelinePane['pendingRequests'];
	timelinesBySource: TimelinePane['timelinesBySource'];
	excludedSources: TimelinePane['excludedSources'];
	readonly message: TimelinePane['message'];
}

suite('TimelinePane', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.file('/timeline.txt');

	function createPane() {
		const results = new Map<string, Promise<Timeline | undefined>>();
		const requests: TimelineRequest[] = [];
		const treeCalls: string[] = [];
		let editable: TimelineEditable | undefined;
		let children: Parameters<TimelinePane['tree']['setChildren']>[1] = [];
		const pane: TestTimelinePane = Object.assign(Object.create(TimelinePane.prototype), {
			uri,
			pendingRequests: new Map(),
			timelinesBySource: new Map(),
			excludedSources: new Set(),
			_maxItemCount: 20,
			_visibleItemCount: 0,
			_pendingRefresh: false,
			_isEmpty: true,
			$container: document.createElement('div'),
			$message: document.createElement('div'),
			isBodyVisible: () => true,
			updateFilename: () => { },
			configurationService: new TestConfigurationService(),
			contextKeyService: new MockContextKeyService(),
			labelService: upcastPartial<ILabelService>({ getUriBasenameLabel: () => 'timeline.txt' }),
			progressService: upcastPartial<IProgressService>({ withProgress: (_options, task) => task(Progress.None) }),
			tree: new class extends mock<TimelinePane['tree']>() {
				override setChildren(_element: null, elements: Parameters<TimelinePane['tree']['setChildren']>[1]): void {
					treeCalls.push('setChildren');
					children = [...elements ?? []];
				}
				override rerender(element?: Parameters<TimelinePane['tree']['rerender']>[0]): void {
					treeCalls.push(element ? `rerender ${element.handle}` : 'rerender');
				}
				override hasElement(): boolean {
					return true;
				}
				override domFocus(): void {
					treeCalls.push('domFocus');
				}
			},
			timelineService: upcastPartial<ITimelineService>({
				get editable() { return editable; },
				getSources: () => [...results.keys()].map(id => ({ id, label: id })),
				getTimeline: (source, uri, options, tokenSource) => {
					const request = { source, uri, options, tokenSource, result: results.get(source)! };
					requests.push(request);
					return request;
				},
			}),
		});
		store.add({ dispose: () => pane.clear(true) });
		return {
			pane, results, requests, treeCalls,
			setEditable: (value: TimelineEditable | undefined) => { editable = value; },
			getLoadMore: () => {
				const element = [...children ?? []].find(child => child.element.handle === 'vscode-command:loadMore')!.element;
				return element as Parameters<TimelinePane['loadMore']>[0];
			},
		};
	}

	async function addPageableProvider(pane: TestTimelinePane, results: Map<string, Promise<Timeline | undefined>>) {
		results.set('B', Promise.resolve({
			source: 'B',
			items: [{ handle: 'B|first', source: 'B', label: 'First item', timestamp: 1 }],
			paging: { cursor: 'next' },
		}));
		pane.loadTimelineForSource('B', uri, true);
		await timeout(0);
	}

	test('removing a pending provider releases pagination for a surviving provider', async () => {
		const { pane, results, requests, getLoadMore } = createPane();
		await addPageableProvider(pane, results);
		const deferred = new DeferredPromise<Timeline | undefined>();
		results.set('A', deferred.p);
		pane.loadTimelineForSource('A', uri, true);
		const removedRequest = requests[requests.length - 1];

		results.delete('A');
		pane.onProvidersChanged({ removed: ['A'] });
		assert.strictEqual(getLoadMore().loading, false);
		// The extension host discards results from a disposed provider.
		await deferred.complete(undefined);
		await timeout(0);

		const loadMore = getLoadMore();
		assert.strictEqual(loadMore.loading, false);
		assert.strictEqual(removedRequest.tokenSource.token.isCancellationRequested, true);
		results.set('B', new DeferredPromise<Timeline | undefined>().p);
		pane.loadMore(loadMore);
		assert.deepStrictEqual(requests.map(request => [request.source, request.options.cursor]), [['B', undefined], ['A', undefined], ['B', 'next']]);
	});

	for (const hasStaleItems of [false, true]) {
		test(`late ${hasStaleItems ? 'nonempty' : 'undefined'} result cannot affect a replacement provider request`, async () => {
			const { pane, results, requests, getLoadMore } = createPane();
			await addPageableProvider(pane, results);
			const oldResult = new DeferredPromise<Timeline | undefined>();
			results.set('A', oldResult.p);
			pane.loadTimelineForSource('A', uri, true);
			pane.onProvidersChanged({ removed: ['A'] });

			const replacementResult = new DeferredPromise<Timeline | undefined>();
			results.set('A', replacementResult.p);
			pane.onProvidersChanged({ added: ['A'] });
			const replacementRequest = requests[requests.length - 1];
			pane.refresh();
			await oldResult.complete(hasStaleItems ? {
				source: 'A', items: [{ handle: 'A|stale', source: 'A', label: 'Stale item', timestamp: 3 }],
			} : undefined);
			await timeout(0);

			assert.strictEqual(pane.pendingRequests.get('A')?.request, replacementRequest);
			assert.strictEqual(pane.timelinesBySource.has('A'), false);
			assert.strictEqual(getLoadMore().loading, true);

			await replacementResult.complete({
				source: 'A', items: [{ handle: 'A|replacement', source: 'A', label: 'Replacement item', timestamp: 2 }],
			});
			await timeout(0);
			assert.deepStrictEqual(pane.timelinesBySource.get('A')?.items.map(item => item.handle), ['A|replacement']);
			assert.strictEqual(getLoadMore().loading, false);
		});
	}

	test('re-renders the edited item and defers refreshing until editing ends', async () => {
		const { pane, results, treeCalls, setEditable } = createPane();
		await addPageableProvider(pane, results);
		const editable: TimelineEditable = { item: { source: 'B', handle: 'B|first' }, data: { validationMessage: () => null, onFinish: async () => { } } };
		const record = (action: () => void) => {
			treeCalls.length = 0;
			action();
			return [...treeCalls];
		};

		assert.deepStrictEqual({
			start: record(() => { setEditable(editable); pane.onEditableChanged(); }),
			cancel: record(() => { setEditable(undefined); pane.onEditableChanged(); }),
			refreshWhileEditing: record(() => { setEditable(editable); pane.onEditableChanged(); pane.refresh(); }),
			finish: record(() => { setEditable(undefined); pane.onEditableChanged(); }),
		}, {
			start: ['rerender B|first'],
			cancel: ['rerender B|first', 'domFocus'],
			refreshWhileEditing: ['rerender B|first'],
			finish: ['setChildren', 'domFocus'],
		});
	});

	test('explains why the timeline is empty', () => {
		const { pane, results } = createPane();
		const messageFor = (sources: string[], excludedSources: string[]) => {
			results.clear();
			for (const source of sources) {
				results.set(source, Promise.resolve(undefined));
			}
			pane.excludedSources = new Set(excludedSources);
			pane.refresh();
			return pane.message;
		};

		assert.deepStrictEqual({
			noProviders: messageFor([], []),
			noProvidersWithStaleFilter: messageFor([], ['git']),
			staleFilterWithOtherProvider: messageFor(['other'], ['git']),
			allProvidersFiltered: messageFor(['git'], ['git']),
			someProvidersFiltered: messageFor(['git', 'other'], ['git']),
		}, {
			noProviders: 'No timeline information was provided. Source Control has not been configured.',
			noProvidersWithStaleFilter: 'No timeline information was provided. Source Control has not been configured.',
			staleFilterWithOtherProvider: 'No timeline information was provided. Source Control has not been configured.',
			allProvidersFiltered: 'All timeline sources have been filtered out. Source Control has not been configured.',
			someProvidersFiltered: 'No filtered timeline information was provided. Source Control has not been configured.',
		});
	});
});
