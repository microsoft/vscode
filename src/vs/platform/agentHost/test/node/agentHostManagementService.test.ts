/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostEnsureRequiredPluginsRequest, IAgentHostEnsureRequiredPluginsResult } from '../../common/requiredPlugins.js';
import type { IAgentService, IConnectionTrackerService } from '../../common/agentService.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';
import { AgentHostManagementService } from '../../node/agentHostManagementService.js';

suite('AgentHostManagementService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('converts repository plugin workspace URIs to runtime paths', async () => {
		const requests: IAgentHostEnsureRequiredPluginsRequest[] = [];
		const result: IAgentHostEnsureRequiredPluginsResult = {
			plugins: [],
			warnings: [],
		};
		const agentService = new class extends mock<IAgentService>() {
			override async ensureRequiredPlugins(request: IAgentHostEnsureRequiredPluginsRequest): Promise<IAgentHostEnsureRequiredPluginsResult> {
				requests.push(request);
				return result;
			}
		}();
		const service = new AgentHostManagementService(
			agentService,
			new class extends mock<IConnectionTrackerService>() { }(),
			async () => { },
			new class extends mock<ISessionDataService>() { }(),
			new NullLogService(),
		);

		assert.deepStrictEqual({
			result: await service.ensureRequiredPlugins({
				workingDirectory: URI.file('/workspace').toString(),
			}),
			requests,
		}, {
			result,
			requests: [{
				workingDirectory: '/workspace',
			}],
		});
	});
});
