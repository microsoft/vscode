/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { lookupKerberosAuthorization } from '../../node/requestService.js';
import { isWindows } from '../../../../base/common/platform.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';


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

	test('Request cancellation during retry backoff', async () => {
		// This test verifies that the cancellation token is properly honored
		// during the retry backoff period by checking that a request can be
		// cancelled quickly even if it would normally wait during backoff
		const cts = store.add(new CancellationTokenSource());
		const startTime = Date.now();

		// Cancel after a short delay (50ms)
		setTimeout(() => cts.cancel(), 50);

		try {
			// Attempt to make a request that will fail and retry
			// The retry logic uses exponential backoff (100ms * attempt)
			// If cancellation is not honored, this would take at least 100ms for the first retry
			const { nodeRequest } = await import('../../node/requestService.js');
			await nodeRequest({ url: 'http://localhost:9999/nonexistent' }, cts.token);
			assert.fail('Request should have been cancelled');
		} catch (err) {
			const elapsed = Date.now() - startTime;
			// Verify the request was cancelled quickly (within 200ms)
			// If cancellation wasn't honored during backoff, it would take much longer
			assert.ok(err instanceof CancellationError, 'Error should be CancellationError');
			assert.ok(elapsed < 200, `Request should be cancelled quickly, but took ${elapsed}ms`);
		}
	});
});
