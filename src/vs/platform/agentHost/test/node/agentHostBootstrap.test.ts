/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { IRequestService } from '../../../request/common/request.js';
import { registerAgentHostNetworkServices } from '../../node/agentHostBootstrap.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';

suite('agentHostBootstrap', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers network services without reading VS Code settings', () => {
		const testDisposables = disposables.add(new DisposableStore());
		const services = new ServiceCollection();
		const networkServices = registerAgentHostNetworkServices(services, new NullLogService(), testDisposables);

		assert.deepStrictEqual({
			proxyResolver: services.get(IAgentHostProxyResolver) === networkServices.proxyResolver,
			requestService: services.get(IRequestService) === networkServices.requestService,
		}, {
			proxyResolver: true,
			requestService: true,
		});
	});
});
