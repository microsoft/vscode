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
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProgressService, Progress } from '../../../../../platform/progress/common/progress.js';
import { TimelinePane } from '../../browser/timelinePane.js';
import { ITimelineService, Timeline, TimelineRequest } from '../../common/timeline.js';

suite('TimelinePane', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.file('/timeline.txt');

	function createPane() {
		const results = new Map<string, Promise<Timeline | undefined>>();
		const requests: TimelineRequest[] = [];
		let children: Parameters<TimelinePane['tree']['setChildren']>[1] = [];
		const pane: TimelinePane = Object.assign(Object.create(TimelinePane.prototype), {
			uri,
			pendingRequests: new Map(),
			timelinesBySource: new Map(),
			excludedSources: new Set(),
			_maxItemCount: 20,
			_visibleItemCount: 0,
			_pendingRefresh: false,
			_isEmpty: true,
			$message: document.createElement('div'),
			isBodyVisible: () => true,
			updateFilename: () => { },
			configurationService: new TestConfigurationService(),
			labelService: upcastPartial<ILabelService>({ getUriBasenameLabel: () => 'timeline.txt' }),
			progressService: upcastPartial<IProgressService>({ withProgress: (_options, task) => task(Progress.None) }),
			tree: new class extends mock<TimelinePane['tree']>() {
				override setChildren(_element: null, elements: Parameters<TimelinePane['tree']['setChildren']>[1]): void {
					children = [...elements ?? []];
				}
				override rerender(): void { }
			},
			timelineService: upcastPartial<ITimelineService>({
				getSources: () => [...results.keys()].map(id => ({ id, label: id })),
				getTimeline: (source, uri, options, tokenSource) => {
					const request = { source, uri, options, tokenSource, result: results.get(source)! };
					requests.push(request);
					return request;
				},
			}),
		});
		store.add({ dispose: () => pane['clear'](true) });
		return {
			pane, results, requests,
			getLoadMore: () => {
				const element = [...children ?? []].find(child => child.element.handle === 'vscode-command:loadMore')!.element;
				return element as Parameters<TimelinePane['loadMore']>[0];
			},
		};
	}

	async function addPageableProvider(pane: TimelinePane, results: Map<string, Promise<Timeline | undefined>>) {
		results.set('B', Promise.resolve({
			source: 'B',
			items: [{ handle: 'B|first', source: 'B', label: 'First item', timestamp: 1 }],
			paging: { cursor: 'next' },
		}));
		pane['loadTimelineForSource']('B', uri, true);
		await timeout(0);
	}

	test('removing a pending provider releases pagination for a surviving provider', async () => {
		const { pane, results, requests, getLoadMore } = createPane();
		await addPageableProvider(pane, results);
		const deferred = new DeferredPromise<Timeline | undefined>();
		results.set('A', deferred.p);
		pane['loadTimelineForSource']('A', uri, true);
		const removedRequest = requests[requests.length - 1];

		results.delete('A');
		pane['onProvidersChanged']({ removed: ['A'] });
		assert.strictEqual(getLoadMore().loading, false);
		// The extension host discards results from a disposed provider.
		await deferred.complete(undefined);
		await timeout(0);

		const loadMore = getLoadMore();
		assert.strictEqual(loadMore.loading, false);
		assert.strictEqual(removedRequest.tokenSource.token.isCancellationRequested, true);
		results.set('B', new DeferredPromise<Timeline | undefined>().p);
		pane['loadMore'](loadMore);
		assert.deepStrictEqual(requests.map(request => [request.source, request.options.cursor]), [['B', undefined], ['A', undefined], ['B', 'next']]);
	});

	for (const hasStaleItems of [false, true]) {
		test(`late ${hasStaleItems ? 'nonempty' : 'undefined'} result cannot affect a replacement provider request`, async () => {
			const { pane, results, requests, getLoadMore } = createPane();
			await addPageableProvider(pane, results);
			const oldResult = new DeferredPromise<Timeline | undefined>();
			results.set('A', oldResult.p);
			pane['loadTimelineForSource']('A', uri, true);
			pane['onProvidersChanged']({ removed: ['A'] });

			const replacementResult = new DeferredPromise<Timeline | undefined>();
			results.set('A', replacementResult.p);
			pane['onProvidersChanged']({ added: ['A'] });
			const replacementRequest = requests[requests.length - 1];
			pane['refresh']();
			await oldResult.complete(hasStaleItems ? {
				source: 'A', items: [{ handle: 'A|stale', source: 'A', label: 'Stale item', timestamp: 3 }],
			} : undefined);
			await timeout(0);

			assert.strictEqual(pane['pendingRequests'].get('A')?.request, replacementRequest);
			assert.strictEqual(pane['timelinesBySource'].has('A'), false);
			assert.strictEqual(getLoadMore().loading, true);

			await replacementResult.complete({
				source: 'A', items: [{ handle: 'A|replacement', source: 'A', label: 'Replacement item', timestamp: 2 }],
			});
			await timeout(0);
			assert.deepStrictEqual(pane['timelinesBySource'].get('A')?.items.map(item => item.handle), ['A|replacement']);
			assert.strictEqual(getLoadMore().loading, false);
		});
	}
});
