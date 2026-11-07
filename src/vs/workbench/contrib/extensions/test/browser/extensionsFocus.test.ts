/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { focusExtensionsResults, focusExtensionsSearchInput, focusFirstPopulatedExtensionsList } from '../../browser/extensionsFocus.js';
import { VIEWLET_ID } from '../../common/extensions.js';

interface IFocusHarness {
	readonly service: IViewsService;
	readonly calls: string[];
	readonly query: string;
}

function createFocusHarness(opened = true, resultsAvailable = true): IFocusHarness {
	const calls: string[] = [];
	let query = 'persisted extensions search query';
	const results = {
		focusResults() {
			calls.push('results.focus');
		},
		search(text: string) {
			query = text;
			calls.push('search.changed');
		}
	};
	const service = {
		openViewContainer: async (id: string, focus?: boolean) => {
			assert.strictEqual(id, VIEWLET_ID);
			calls.push(`open:${Boolean(focus)}`);
			return opened ? { focus() { calls.push('container.focus'); } } : null;
		},
		getActiveViewPaneContainerWithId: (id: string) => {
			assert.strictEqual(id, VIEWLET_ID);
			calls.push('get:active');
			return resultsAvailable ? results : null;
		}
	} as unknown as IViewsService;
	return { service, calls, get query() { return query; } };
}

suite('Extensions keyboard focus commands', () => {
	test('focuses the Extensions search field without clearing the query', async () => {
		const harness = createFocusHarness();
		await focusExtensionsSearchInput(harness.service);
		assert.deepStrictEqual(harness.calls, ['open:true']);
		assert.strictEqual(harness.query, 'persisted extensions search query');
	});

	test('opens the Extensions view without changing its search query before focusing results', async () => {
		const harness = createFocusHarness();
		await focusExtensionsResults(harness.service);
		assert.deepStrictEqual(harness.calls, ['open:false', 'get:active', 'results.focus']);
		assert.strictEqual(harness.query, 'persisted extensions search query');
	});

	test('does not try to focus results if the Extensions view cannot open', async () => {
		const harness = createFocusHarness(false);
		await focusExtensionsResults(harness.service);
		assert.deepStrictEqual(harness.calls, ['open:false']);
	});

	test('does not throw when the opened view has no active pane', async () => {
		const harness = createFocusHarness(true, false);
		await focusExtensionsResults(harness.service);
		assert.deepStrictEqual(harness.calls, ['open:false', 'get:active']);
	});

	test('search input focus tolerates an unavailable Extensions view', async () => {
		const harness = createFocusHarness(false);
		await focusExtensionsSearchInput(harness.service);
		assert.deepStrictEqual(harness.calls, ['open:true']);
	});

	test('switches between search and results focus while retaining the original query', async () => {
		const harness = createFocusHarness();
		await focusExtensionsSearchInput(harness.service);
		await focusExtensionsResults(harness.service);
		await focusExtensionsSearchInput(harness.service);
		assert.deepStrictEqual(harness.calls, [
			'open:true', 'open:false', 'get:active', 'results.focus', 'open:true'
		]);
		assert.strictEqual(harness.query, 'persisted extensions search query');
	});
});


suite('Extensions results focus selection', () => {
	function pane(id: string, expanded: boolean, entries: number, focused: string[]) {
		return {
			isExpanded: () => expanded,
			count: () => entries,
			focus: () => { focused.push(id); }
		};
	}

	test('skips an empty expanded pane and focuses the next populated pane', () => {
		const focused: string[] = [];
		const found = focusFirstPopulatedExtensionsList([
			pane('empty', true, 0, focused),
			pane('results', true, 5, focused)
		]);
		assert.strictEqual(found, true);
		assert.deepStrictEqual(focused, ['results']);
	});

	test('skips collapsed lists even when they contain results', () => {
		const focused: string[] = [];
		const found = focusFirstPopulatedExtensionsList([
			pane('collapsed', false, 6, focused),
			pane('expanded', true, 1, focused)
		]);
		assert.strictEqual(found, true);
		assert.deepStrictEqual(focused, ['expanded']);
	});

	test('focuses the first populated, expanded pane only', () => {
		const focused: string[] = [];
		const found = focusFirstPopulatedExtensionsList([
			pane('first', true, 3, focused),
			pane('second', true, 8, focused)
		]);
		assert.strictEqual(found, true);
		assert.deepStrictEqual(focused, ['first']);
	});

	test('does not move focus when all lists are empty or collapsed', () => {
		const focused: string[] = [];
		const found = focusFirstPopulatedExtensionsList([
			pane('empty', true, 0, focused),
			pane('collapsed', false, 4, focused)
		]);
		assert.strictEqual(found, false);
		assert.deepStrictEqual(focused, []);
	});

	test('handles the absence of Extensions result panes', () => {
		assert.strictEqual(focusFirstPopulatedExtensionsList([]), false);
	});
});
