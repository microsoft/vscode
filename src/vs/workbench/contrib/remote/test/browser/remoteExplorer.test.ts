/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isCandidateRemappedTunnelLocalEndpoint } from '../../browser/remoteExplorer.js';

suite('AutomaticPortForwarding', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies remapped local tunnel ports', () => {
		const tunnels = [
			{ remotePort: 3000, localPort: 3001 },
			{ remotePort: 4000, localPort: 4000 },
			{ remotePort: 5000, localPort: undefined },
		];
		const candidates = [
			{ host: 'localhost', port: 3001 },
			{ host: '127.0.0.1', port: 3001 },
			{ host: '0.0.0.0', port: 3001 },
			{ host: 'example.com', port: 3001 },
			{ host: 'localhost', port: 3000 },
			{ host: 'localhost', port: 4000 },
			{ host: 'localhost', port: 5000 },
			{ host: 'localhost', port: 6000 },
		];

		assert.deepStrictEqual(candidates.map(candidate => isCandidateRemappedTunnelLocalEndpoint(candidate, tunnels)), [
			true,
			true,
			true,
			false,
			false,
			false,
			false,
			false,
		]);
	});
});
