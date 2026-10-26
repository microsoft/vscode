/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import type { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { TestCopilotHomeService } from '../../../../environment/test/common/testCopilotHomeService.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { IProductService } from '../../../../product/common/productService.js';
import type { IRequestService } from '../../../../request/common/request.js';
import { NullTelemetryService } from '../../../../telemetry/common/telemetryUtils.js';
import { LOCAL_MODEL_STATUS_KEY } from '../../../common/localModel.js';
import { AgentConfigurationService } from '../../../node/agentConfigurationService.js';
import type { IAgentHostAuthenticationService } from '../../../node/agentHostAuthenticationService.js';
import type { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProxyResolver } from '../../../node/agentHostProxyResolver.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import type { IAgentHostStorageService } from '../../../node/agentHostStorageService.js';
import { LocalModelSetupService, NullLocalModelSetupService } from '../../../node/copilot/localModelBridge/localModelSetupService.js';
import { ShimLocalModelProvider } from '../../../node/copilot/localModelBridge/shim/shimLocalModelProvider.js';
import type { ICopilotApiService } from '../../../node/shared/copilotApiService.js';

suite('LocalModelSetupService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates one provider on shim selection, publishes its status and withdraws it on none', () => {
		const logService = new NullLogService();
		const stateManager = store.add(new AgentHostStateManager(logService));
		const configurationService = store.add(new AgentConfigurationService(stateManager, logService));
		const proxyResolver: IAgentHostProxyResolver = {
			_serviceBrand: undefined,
			onDidRegisterConnection: Event.None,
			onDidChangeConfiguration: Event.None,
			register: () => toDisposable(() => { }),
			getConfigurationValue: () => undefined,
			resolveProxy: async () => undefined,
			fetch: () => Promise.reject(new Error('not used')),
			createWebSocket: () => { throw new Error('not used'); },
		};
		const service = store.add(new LocalModelSetupService(
			configurationService,
			logService,
			proxyResolver,
			upcastPartial<IRequestService>({}),
			upcastPartial<IAgentHostStorageService>({ get: () => undefined, set: () => { } }),
			NullTelemetryService,
			upcastPartial<INativeEnvironmentService>({ userHome: URI.file('/home/user'), userDataPath: URI.file('/user-data').fsPath, tmpDir: URI.file('/temp') }),
			upcastPartial<ICopilotApiService>({}),
			upcastPartial<IAgentHostAuthenticationService>({ onDidChangeAuthToken: Event.None }),
			upcastPartial<IAgentHostGitHubEndpointService>({}),
			upcastPartial<IProductService>({ version: '1.2.3' }),
			new TestCopilotHomeService(URI.file('/home/user')),
		));
		const status = () => configurationService.getRootConfigValues()[LOCAL_MODEL_STATUS_KEY];

		const first = service.applySelection('shim');
		const second = service.applySelection('shim');
		const published = status();
		const none = service.applySelection('none');

		assert.deepStrictEqual({
			isShim: first instanceof ShimLocalModelProvider,
			reused: first === second,
			published: !!published && typeof published === 'object',
			none,
			provider: service.provider,
			withdrawn: status(),
			null: new NullLocalModelSetupService().applySelection('shim'),
		}, {
			isShim: true,
			reused: true,
			published: true,
			none: undefined,
			provider: undefined,
			withdrawn: undefined,
			null: undefined,
		});
	});
});
