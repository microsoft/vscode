/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { createSandboxLines, type ISandboxingOnOptions } from '../../browser/tools/runInTerminalTool.js';

suite('createSandboxLines', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function assertLines(name: string, options: ISandboxingOnOptions) {
		const snapshot = `${JSON.stringify(options, undefined, 2)}\n----\n${createSandboxLines(options).join('\n')}`;
		await assertSnapshot(snapshot, { name });
	}

	suite('on-network-available', () => {
		test('unsandboxed disallowed', async () => {
			await assertLines('on-network-available_unsandboxed-disallowed', {
				sandboxMode: 'on-network-available',
				allowToRunUnsandboxedCommands: false,
				retryWithAllowNetworkRequests: false,
				networkDomains: undefined,
			});
		});

		test('unsandboxed allowed', async () => {
			await assertLines('on-network-available_unsandboxed-allowed', {
				sandboxMode: 'on-network-available',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: false,
				networkDomains: undefined,
			});
		});
	});

	suite('on-network-restricted', () => {
		test('no domains, no retry, unsandboxed disallowed', async () => {
			await assertLines('on-network-restricted_no-domains_no-retry_unsandboxed-disallowed', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: false,
				retryWithAllowNetworkRequests: false,
				networkDomains: undefined,
			});
		});

		test('no domains, no retry, unsandboxed allowed', async () => {
			await assertLines('on-network-restricted_no-domains_no-retry_unsandboxed-allowed', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: false,
				networkDomains: undefined,
			});
		});

		test('no domains, retry, unsandboxed disallowed', async () => {
			await assertLines('on-network-restricted_no-domains_retry_unsandboxed-disallowed', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: false,
				retryWithAllowNetworkRequests: true,
				networkDomains: undefined,
			});
		});

		test('no domains, retry, unsandboxed allowed', async () => {
			await assertLines('on-network-restricted_no-domains_retry_unsandboxed-allowed', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: undefined,
			});
		});

		test('empty domains', async () => {
			await assertLines('on-network-restricted_empty-domains', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: [], deniedDomains: [] },
			});
		});

		test('allowed domains only', async () => {
			await assertLines('on-network-restricted_allowed-domains-only', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: ['github.com', 'registry.npmjs.org'], deniedDomains: [] },
			});
		});

		test('denied domains only', async () => {
			await assertLines('on-network-restricted_denied-domains-only', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: [], deniedDomains: ['evil.example.com'] },
			});
		});

		test('allowed and denied domains', async () => {
			await assertLines('on-network-restricted_allowed-and-denied-domains', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: ['github.com', 'registry.npmjs.org'], deniedDomains: ['evil.example.com'] },
			});
		});

		test('overlapping allowed and denied domains', async () => {
			await assertLines('on-network-restricted_overlapping-domains', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: ['github.com', 'evil.example.com'], deniedDomains: ['evil.example.com'] },
			});
		});

		test('domains with retry disabled', async () => {
			await assertLines('on-network-restricted_allowed-domains_no-retry', {
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: false,
				retryWithAllowNetworkRequests: false,
				networkDomains: { allowedDomains: ['github.com'], deniedDomains: ['evil.example.com'] },
			});
		});
	});
});
