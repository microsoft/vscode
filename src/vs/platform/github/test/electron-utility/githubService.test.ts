/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { INativeHostService } from '../../../native/common/native.js';
import product from '../../../product/common/product.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { SharedProcessGitHubService } from '../../electron-utility/githubService.js';
import { createFetch } from '../../../request/electron-utility/fetch.js';

suite('SharedProcessGitHubService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves system proxy routing without a renderer window', async () => {
		const proxyUrls: string[] = [];
		const configuration = new TestConfigurationService({ 'http.systemCertificates': false, 'http.noProxy': [] });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const nativeHost = new class extends mock<INativeHostService>() {
			override async resolveProxy(): Promise<never> {
				assert.fail('Shared-process networking must not use a window-scoped proxy session');
			}
			override async resolveProxyForUtilityProcess(url: string): Promise<string> {
				proxyUrls.push(url);
				return 'DIRECT';
			}
		}();
		const fetch = createFetch(nativeHost, configuration, new NullLogService(), {}, async () => new Response('fixture'));
		const response = await fetch('https://api.test/resource');
		assert.deepStrictEqual({ proxyUrls, body: await response.text() }, { proxyUrls: ['https://api.test/resource'], body: 'fixture' });
	});

	test('initializes a local engine with node egress without fetching or adding authentication', async () => {
		const requests: Request[] = [];
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const service = store.add(new SharedProcessGitHubService(async (input, init) => {
			requests.push(new Request(input, init));
			return new Response('{"value":1}');
		}, configuration, { _serviceBrand: undefined, ...product, applicationName: 'code-insiders', version: '1.141.0' }, new NullLogService(), NullTelemetryService));
		const attemptsAtConstruction = requests.length;
		assert.throws(() => service.acquireClient({
			apiBaseUri: 'https://api.github.com', graphQlUri: 'https://api.github.com/graphql',
			authorization: { providerId: 'github', sessionId: 'session', scopes: ['repo'] },
		}), { kind: 'authentication' });
		const client = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://api.github.com' })).object;
		const result = await client.get('/resource', new AbortController().signal, { caller: 'github.query' });
		assert.deepStrictEqual({
			attemptsAtConstruction, data: result.data,
			requests: requests.map(request => ({
				source: request.headers.get('x-client-source'), retry: request.headers.get('x-is-retry'),
				authorization: request.headers.get('authorization'), credentials: request.credentials,
			})),
		}, {
			attemptsAtConstruction: 0, data: { value: 1 },
			requests: [{ source: 'vscode-insiders-shared-process/1.141.0', retry: 'false', authorization: null, credentials: 'omit' }],
		});
	});
});
