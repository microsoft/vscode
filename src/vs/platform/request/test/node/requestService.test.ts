/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { lookupKerberosAuthorization } from '../../node/requestService.js';
import { isWindows } from '../../../../base/common/platform.js';


suite('Request Service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	// Kerberos module fails to load on local macOS and Linux CI.
	(isWindows ? test : test.skip)('Kerberos lookup', async () => {
		try {
			const logService = store.add(new NullLogService());
			const response = await lookupKerberosAuthorization('http://localhost:9999', undefined, logService, 'requestService.test.ts');
			assert.ok(response);
		} catch (err) {
			assert.ok(
				err?.message?.includes('No authority could be contacted for authentication')
				|| err?.message?.includes('No Kerberos credentials available')
				|| err?.message?.includes('No credentials are available in the security package')
				|| err?.message?.includes('no credential for')
				, `Unexpected error: ${err}`);
		}
	});
});
