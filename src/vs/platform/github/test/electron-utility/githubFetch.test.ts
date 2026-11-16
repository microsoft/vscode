/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { NullLogService } from '../../../log/common/log.js';
import { INativeHostService } from '../../../native/common/native.js';
import { createFetch } from '../../electron-utility/githubFetch.js';
import { gitHubJsonResponse, gitHubRestStep, ProgrammableGitHubServer } from '../node/programmableGitHubServer.js';

suite('Shared process GitHub fetch', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancels native requests after lazy initialization', async () => {
		const server = store.add(await ProgrammableGitHubServer.start());
		const configuration = new TestConfigurationService({ 'http.systemCertificates': false, 'http.noProxy': ['127.0.0.1'] });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const fetch = createFetch(new class extends mock<INativeHostService>() {
			override async resolveProxy(): Promise<string> { return 'DIRECT'; }
			override async loadCertificates(): Promise<string[]> { return []; }
		}(), configuration, upcastPartial<INativeEnvironmentService>({ args: { _: [], 'force-disable-user-env': true } }), new NullLogService());
		const outcomes: { result: string; notified: boolean }[] = [];
		try {
			for (let attempt = 0; attempt < 2; attempt++) {
				const started = new DeferredPromise<void>();
				const release = new DeferredPromise<void>();
				server.enqueue(gitHubRestStep({
					path: '/request', waitFor: release.p, assert: () => { void started.complete(); },
					response: gitHubJsonResponse({}, { headers: { 'Access-Control-Allow-Origin': '*' } }),
				}));
				const source = store.add(new CancellationTokenSource());
				const lifetime = store.add(new DisposableStore());
				const pending = fetch(`${server.apiBaseUrl}/request`, undefined, source.token, lifetime).then(
					() => 'response',
					error => {
						if (!isCancellationError(error)) {
							throw error;
						}
						return 'cancelled';
					},
				);
				lifetime.add(source.token.onCancellationRequested(() => lifetime.dispose()));
				await started.p;
				let notified = false;
				store.add(source.token.onCancellationRequested(() => { notified = true; }));
				source.cancel();
				await release.complete();
				outcomes.push({ result: await pending, notified });
			}
			assert.deepStrictEqual(outcomes, [{ result: 'cancelled', notified: true }, { result: 'cancelled', notified: true }]);
			server.assertSatisfied();
		} finally {
			await server.disposeAsync();
		}
	});
});
