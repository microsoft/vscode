/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { classifyAgentSdkDownloadFailure, type AgentSdkDownloadFailureReason } from '../../node/agentSdkDownloadTelemetry.js';

// Reporting itself is exercised end-to-end against the real downloader in
// `agentSdkDownloader.test.ts`; only the classifier is worth a table here.
suite('Agent SDK download telemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('failure classification', () => {
		const cases: readonly { readonly name: string; readonly error: string | undefined; readonly expected: AgentSdkDownloadFailureReason }[] = [
			{ name: 'the downloader reports cancellation as a bare token, not a message', error: 'cancelled', expected: 'cancelled' },
			{ name: 'an HTTP status is the network', error: 'HTTP 503 for https://cdn.example.test/claude-1.2.3.tgz', expected: 'network' },
			{ name: 'so is a DNS or TLS failure', error: 'getaddrinfo ENOTFOUND cdn.example.test', expected: 'network' },
			{ name: 'a full or read-only disk is not', error: `ENOSPC: no space left on device, write '/home/u/.cache/sdk.tgz'`, expected: 'filesystem' },
			{ name: 'nor is a permission denied under the cache dir', error: `EACCES: permission denied, mkdir '/home/u/.cache'`, expected: 'filesystem' },
			{ name: 'a corrupt archive is its own bucket', error: 'zlib: incorrect header check', expected: 'extract' },
			{ name: 'a build with no SDK configured says so', error: 'no `product.agentSdks.claude` in this build', expected: 'notConfigured' },
			{ name: 'and one with no artefact for this platform says that', error: 'no SDK target for this host (linux-riscv64)', expected: 'unsupportedTarget' },
			{ name: 'an HTTP failure is not read as a corrupt tarball just because the URL ends in .tgz', error: 'HTTP 404 for https://cdn.example.test/sdk.tar.gz', expected: 'network' },
			{ name: 'anything unrecognised stays unknown rather than being folded into a neighbour', error: 'something went wrong', expected: 'unknown' },
			{ name: 'a failure with no message at all is unknown too', error: undefined, expected: 'unknown' },
		];

		for (const { name, error, expected } of cases) {
			test(name, () => {
				assert.strictEqual(classifyAgentSdkDownloadFailure(error), expected);
			});
		}
	});
});
