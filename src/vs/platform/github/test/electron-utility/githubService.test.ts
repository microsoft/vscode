/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { INativeHostService } from '../../../native/common/native.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { SharedProcessGitHubService } from '../../electron-utility/githubService.js';

suite('SharedProcessGitHubService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService() {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(INativeHostService, {});
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(INativeEnvironmentService, {});
		instantiationService.stub(IProductService, {
			_serviceBrand: undefined, ...product, applicationName: 'code-insiders', version: '1.141.0',
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		return store.add(instantiationService.createInstance(SharedProcessGitHubService));
	}

	test('initializes without native networking and rejects authenticated clients', () => {
		const service = createService();
		assert.throws(() => service.acquireClient({
			apiBaseUri: 'https://api.github.com', graphQlUri: 'https://api.github.com/graphql',
			authorization: { providerId: 'github', sessionId: 'session', scopes: ['repo'] },
		}), { kind: 'authentication' });
	});

	test('retains the normalized public GitHub client across sequential call-scoped leases', () => {
		const service = createService();
		const first = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://API.GITHUB.COM/' }));
		const client = first.object;
		first.dispose();
		const second = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://api.github.com' }));
		assert.strictEqual(second.object, client);
	});

	test('only the public GitHub lease is retained and binding disposal releases it', async () => {
		const service = createService();
		const reference = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://api.github.com' }));
		const client = reference.object;
		reference.dispose();
		for (let i = 0; i < 65; i++) {
			store.add(service.acquireAnonymousClient({ apiBaseUri: `https://api${i}.test` })).dispose();
		}
		const replacement = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://api.github.com/' }));
		assert.strictEqual(replacement.object, client);
		replacement.dispose();
		service.dispose();
		await assert.rejects(client.get('/resource', new AbortController().signal), /disposed/);
		assert.throws(() => service.acquireAnonymousClient({ apiBaseUri: 'https://api.github.com' }), /disposed/);
	});

	test('non-public GitHub clients remain call-scoped', async () => {
		const service = createService();
		const first = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://api.example.test' }));
		const client = first.object;
		first.dispose();
		const second = store.add(service.acquireAnonymousClient({ apiBaseUri: 'https://api.example.test' }));
		assert.notStrictEqual(second.object, client);
		await assert.rejects(client.get('/resource', new AbortController().signal), /disposed/);
	});
});
