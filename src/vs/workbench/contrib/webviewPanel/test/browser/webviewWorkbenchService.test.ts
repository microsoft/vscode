/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IOverlayWebview } from '../../../webview/browser/webview.js';
import { WebviewInput } from '../../browser/webviewEditorInput.js';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from '../../browser/webviewWorkbenchService.js';

suite('LazilyResolvedWebviewEditorInput', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createInput(resolveWebview: (attempt: number) => Promise<void>) {
		const webviewWorkbenchService = new class extends mock<IWebviewWorkbenchService>() {
			resolveCount = 0;

			override resolveWebview(_webview: WebviewInput, _token: CancellationToken): Promise<void> {
				return resolveWebview(++this.resolveCount);
			}
		};

		const input = store.add(new LazilyResolvedWebviewEditorInput(
			{ viewType: 'test.webview', providedId: undefined, name: 'Test', iconPath: undefined },
			new class extends mock<IOverlayWebview>() {
				override dispose() { }
			},
			new TestThemeService(),
			webviewWorkbenchService,
		));

		return { input, webviewWorkbenchService };
	}

	test('resolves the webview once for concurrent and later calls', async () => {
		const resolved = new DeferredPromise<void>();
		const { input, webviewWorkbenchService } = createInput(() => resolved.p);

		const concurrent = [input.resolve(), input.resolve()];
		resolved.complete();
		await Promise.all(concurrent);
		await input.resolve();

		assert.strictEqual(webviewWorkbenchService.resolveCount, 1);
	});

	test('ignores the cancellation when disposed while resolving', async () => {
		const { input } = createInput(() => new Promise<void>(() => { }));

		const resolve = input.resolve();
		input.dispose();

		assert.strictEqual(await resolve, null);
	});

	test('resolves the webview again after resolving it failed (#250622)', async () => {
		const failure = new DeferredPromise<void>();
		const { input, webviewWorkbenchService } = createInput(attempt => attempt === 1 ? failure.p : Promise.resolve());

		const concurrent = [input.resolve(), input.resolve()];
		failure.error(new Error('Could not resolve'));
		const results = await Promise.allSettled(concurrent);
		await input.resolve();
		await input.resolve();

		assert.deepStrictEqual({
			results: results.map(result => result.status === 'rejected' ? (result.reason as Error).message : result.status),
			resolveCount: webviewWorkbenchService.resolveCount,
		}, {
			results: ['Could not resolve', 'Could not resolve'],
			resolveCount: 2,
		});
	});

	test('resolves the webview again after a cancellation that did not come from disposing the input', async () => {
		const { input, webviewWorkbenchService } = createInput(async attempt => {
			if (attempt === 1) {
				throw new CancellationError();
			}
		});

		await assert.rejects(input.resolve(), error => isCancellationError(error));
		await input.resolve();

		assert.strictEqual(webviewWorkbenchService.resolveCount, 2);
	});
});
