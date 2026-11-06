/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { focusExtensionsResults, focusExtensionsSearchInput } from '../../browser/extensionsFocus.js';
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
