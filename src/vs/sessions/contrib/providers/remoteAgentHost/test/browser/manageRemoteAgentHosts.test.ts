/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getThisComputerDescription } from '../../browser/manageRemoteAgentHosts.js';

suite('Manage Remote Agent Hosts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('describes direct local access separately from sharing registration', () => {
		assert.deepStrictEqual([
			getThisComputerDescription({ route: 'devTunnel', registrationName: undefined, sharingState: 'off' }),
			getThisComputerDescription({ route: 'devTunnel', registrationName: 'workmac', sharingState: 'off' }),
			getThisComputerDescription({ route: 'devTunnel', registrationName: 'workmac', sharingState: 'connecting' }),
			getThisComputerDescription({ route: 'githubEnvironment', registrationName: undefined, sharingState: 'connecting' }),
			getThisComputerDescription({ route: 'devTunnel', registrationName: 'workmac-renamed', sharingState: 'on' }),
			getThisComputerDescription({ route: 'githubEnvironment', registrationName: 'cherwan-workmac-m4', sharingState: 'on' }),
			getThisComputerDescription({ route: 'githubEnvironment', registrationName: undefined, sharingState: 'on' }),
		], [
			'Sharing off',
			'Sharing off. Registered as workmac via Dev Tunnel',
			'Starting sharing as workmac via Dev Tunnel. Select to cancel',
			'Starting sharing via GitHub Environment. Select to cancel',
			'Shared as workmac-renamed via Dev Tunnel',
			'Shared as cherwan-workmac-m4 via GitHub Environment',
			'Shared via GitHub Environment',
		]);
	});
});
