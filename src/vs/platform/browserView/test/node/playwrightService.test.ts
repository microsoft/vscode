/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentNetworkFilterService } from '../../../networkFilter/common/networkFilterService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IBrowserViewCreationContext } from '../../common/browserView.js';
import { IBrowserViewGroupRemoteService } from '../../node/browserViewGroupRemoteService.js';
import { PlaywrightService } from '../../node/playwrightService.js';

suite('PlaywrightService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates pages for an agent session on the session network', async () => {
		const targetContexts: IBrowserViewCreationContext['session'][] = [];
		const groups = upcastPartial<IBrowserViewGroupRemoteService>({
			createGroup: async (_filter, targetContext) => {
				targetContexts.push(targetContext.session);
				throw new Error('stop after group creation');
			},
		});
		const service = store.add(new PlaywrightService(1, true, groups, new NullLogService(), upcastPartial<IAgentNetworkFilterService>({}), NullTelemetryService));

		await service.setSessionNetwork('chat', { authority: 'host' });
		await assert.rejects(service.getSummary('chat', 'page'));
		await service.setSessionNetwork('chat', undefined);
		await assert.rejects(service.getSummary('chat', 'page'));

		assert.deepStrictEqual(targetContexts, [
			{ scope: 'agent', affinity: 'chat', network: { authority: 'host' } },
			{ scope: 'agent', affinity: 'chat', network: undefined },
		]);
	});
});
