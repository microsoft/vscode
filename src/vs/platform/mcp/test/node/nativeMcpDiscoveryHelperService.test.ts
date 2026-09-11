/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NativeMcpDiscoveryHelperService } from '../../node/nativeMcpDiscoveryHelperService.js';

suite('NativeMcpDiscoveryHelperService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads native configuration roots from the process environment', async () => {
		const data = await new NativeMcpDiscoveryHelperService({
			COPILOT_HOME: '/custom/copilot',
			APPDATA: '/custom/app-data',
			XDG_CONFIG_HOME: '/custom/config',
		}).load();

		assert.deepStrictEqual({
			copilotHome: data.copilotHome?.path,
			winAppData: data.winAppData?.path,
			xdgHome: data.xdgHome?.path,
		}, {
			copilotHome: '/custom/copilot',
			winAppData: '/custom/app-data',
			xdgHome: '/custom/config',
		});
	});
});
