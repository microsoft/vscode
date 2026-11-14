/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IPagedModel, PagedModel } from '../../../../../base/common/paging.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchMcpServer } from '../../common/mcpTypes.js';
import { McpServersListView } from '../../browser/mcpServersView.js';

interface ITestQueryResult {
	model: IPagedModel<IWorkbenchMcpServer>;
	disposables: DisposableStore;
}

interface ITestMcpServersListView {
	mpcViewOptions: { showMarketplaceWelcome?: boolean };
	marketplaceConfigurationService: Pick<IConfigurationService, 'getValue'>;
	input: ITestQueryResult | undefined;
	currentQuery: string;
	queryGeneration: number;
	query(query: string): Promise<ITestQueryResult>;
	renderInput(announce?: boolean): void;
	show(query: string): Promise<IPagedModel<IWorkbenchMcpServer>>;
}

suite('MCP Servers View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('clears stale rows and ignores an older pending query', async () => {
		const previous = createQueryResult();
		const first = createPendingQueryResult();
		const second = createPendingQueryResult();
		const renderLengths: number[] = [];
		let queryCount = 0;
		const view = Object.assign(Object.create(McpServersListView.prototype) as ITestMcpServersListView, {
			mpcViewOptions: {},
			marketplaceConfigurationService: { getValue: () => false },
			input: previous.result,
			currentQuery: '@mcp',
			queryGeneration: 0,
			query: () => ++queryCount === 1 ? first.promise : second.promise,
			renderInput: function (this: ITestMcpServersListView) {
				renderLengths.push(this.input?.model.length ?? -1);
			},
		});

		const firstShow = view.show('@mcp first');
		const clearedImmediately = view.input?.model.length;
		const secondShow = view.show('@mcp second');
		second.resolve();
		await secondShow;
		first.resolve();
		await firstShow;

		assert.deepStrictEqual({
			clearedImmediately,
			renderLengths,
			currentModel: view.input?.model,
			previousDisposed: previous.disposed,
			firstDisposed: first.disposed,
			secondDisposed: second.disposed,
		}, {
			clearedImmediately: 0,
			renderLengths: [0, 0, 0],
			currentModel: second.result.model,
			previousDisposed: true,
			firstDisposed: true,
			secondDisposed: false,
		});

		view.input?.disposables.dispose();
	});

	function createQueryResult(): { result: ITestQueryResult; readonly disposed: boolean } {
		let disposed = false;
		const store = disposables.add(new DisposableStore());
		store.add(toDisposable(() => disposed = true));
		return {
			result: {
				model: new PagedModel<IWorkbenchMcpServer>([]),
				disposables: store,
			},
			get disposed() { return disposed; },
		};
	}

	function createPendingQueryResult(): { result: ITestQueryResult; promise: Promise<ITestQueryResult>; resolve(): void; readonly disposed: boolean } {
		const queryResult = createQueryResult();
		let resolve!: (result: ITestQueryResult) => void;
		const promise = new Promise<ITestQueryResult>(complete => resolve = complete);
		return {
			result: queryResult.result,
			promise,
			resolve: () => resolve(queryResult.result),
			get disposed() { return queryResult.disposed; },
		};
	}
});
