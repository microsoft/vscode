/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Client } from 'vs/base/node/service.cp';
import uri from 'vs/base/common/uri';
import {TestService} from 'vs/base/test/node/service/testService';

suite('Service', () => {

	test('createService', function(done: () => void) {
		this.timeout(5000);

		const server = new Client(
			uri.parse(require.toUrl('bootstrap')).fsPath,
			{
				serverName: 'TestServer',
				env: { AMD_ENTRYPOINT: 'vs/base/test/node/service/testApp', verbose: true }
			}
		);

		const testService = server.getService<TestService>('TestService', TestService);
		const res = testService.pong('ping');

		res.then(r => {
			assert.equal(r.incoming, 'ping');
			assert.equal(r.outgoing, 'pong');
			done();
		});
	});
});