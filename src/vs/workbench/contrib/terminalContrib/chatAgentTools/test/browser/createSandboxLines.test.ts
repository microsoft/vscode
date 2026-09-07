/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { createSandboxLines, createSandboxProperties, type ISandboxingOnOptions } from '../../browser/tools/runInTerminalTool.js';

suite('createSandboxLines', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function assertLines(options: ISandboxingOnOptions) {
		const properties = JSON.stringify(createSandboxProperties(options), undefined, 2);
		const snapshot = `${JSON.stringify(options, undefined, 2)}\n----\n${properties}\n----\n${createSandboxLines(options).join('\n')}`;
		await assertSnapshot(snapshot);
	}

	suite('available', () => {
		test('disallowed', async () => {
			await assertLines({
				sandboxMode: 'on-network-available',
				allowToRunUnsandboxedCommands: false,
				retryWithAllowNetworkRequests: false,
				networkDomains: undefined,
			});
		});

		test('allowed', async () => {
			await assertLines({
				sandboxMode: 'on-network-available',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: false,
				networkDomains: undefined,
			});
		});
	});

	suite('restricted', () => {
		test('no retry, disallowed', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: false,
				retryWithAllowNetworkRequests: false,
				networkDomains: undefined,
			});
		});

		test('no retry, allowed', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: false,
				networkDomains: undefined,
			});
		});

		test('retry, disallowed', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: false,
				retryWithAllowNetworkRequests: true,
				networkDomains: undefined,
			});
		});

		test('retry, allowed', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: undefined,
			});
		});

		test('empty domains', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: [], deniedDomains: [] },
			});
		});

		test('allowed domains', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: ['github.com', 'registry.npmjs.org'], deniedDomains: [] },
			});
		});

		test('denied domains', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: [], deniedDomains: ['evil.example.com'] },
			});
		});

		test('allowed and denied domains', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: ['github.com', 'registry.npmjs.org'], deniedDomains: ['evil.example.com'] },
			});
		});

		test('overlapping domains', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: true,
				retryWithAllowNetworkRequests: true,
				networkDomains: { allowedDomains: ['github.com', 'evil.example.com'], deniedDomains: ['evil.example.com'] },
			});
		});

		test('domains, retry disabled', async () => {
			await assertLines({
				sandboxMode: 'on-network-restricted',
				allowToRunUnsandboxedCommands: false,
				retryWithAllowNetworkRequests: false,
				networkDomains: { allowedDomains: ['github.com'], deniedDomains: ['evil.example.com'] },
			});
		});
	});
});
