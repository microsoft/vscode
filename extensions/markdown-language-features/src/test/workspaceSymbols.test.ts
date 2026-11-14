/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import type { CancellationToken, SymbolInformation } from 'vscode';
import { createWorkspaceSymbolMiddleware } from '../client/workspaceSymbols';

suite('Markdown workspace symbols', () => {
	const token: CancellationToken = {
		isCancellationRequested: false,
		onCancellationRequested: () => ({ dispose: () => { } }),
	};

	test('does not request symbols from the server when disabled', () => {
		const middleware = createWorkspaceSymbolMiddleware(() => false);
		const result = middleware.provideWorkspaceSymbols!('heading', token, () => {
			assert.fail('A disabled workspace symbol search must not contact the language server');
		});
		assert.deepStrictEqual(result, []);
	});

	test('forwards the query, cancellation token, and asynchronous result when enabled', async () => {
		const middleware = createWorkspaceSymbolMiddleware(() => true);
		const symbols: SymbolInformation[] = [];
		const response = Promise.resolve(symbols);
		const requests: { query: string; token: CancellationToken }[] = [];
		const result = middleware.provideWorkspaceSymbols!('heading', token, (query, token) => {
			requests.push({ query, token });
			return response;
		});
		assert.strictEqual(result, response);
		assert.strictEqual(await result, symbols);
		assert.deepStrictEqual(requests, [{ query: 'heading', token }]);
	});

	test('honors configuration changes without restarting the client', async () => {
		let enabled = true;
		const middleware = createWorkspaceSymbolMiddleware(() => enabled);
		const requests: string[] = [];
		const next = (query: string) => {
			requests.push(query);
			return [];
		};
		await middleware.provideWorkspaceSymbols!('first', token, next);
		enabled = false;
		await middleware.provideWorkspaceSymbols!('disabled', token, next);
		enabled = true;
		await middleware.provideWorkspaceSymbols!('reenabled', token, next);
		assert.deepStrictEqual(requests, ['first', 'reenabled']);
	});
});
