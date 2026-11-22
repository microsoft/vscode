/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionRemoteAgentHostsService } from '../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { InMemoryStorageService } from '../../../../platform/storage/common/storage.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadRemoteAgentHosts } from '../../browser/mainThreadRemoteAgentHosts.js';
import { ExtHostRemoteAgentHosts } from '../../common/extHostRemoteAgentHosts.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadRemoteAgentHosts', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the address the extension host canonicalized, unchanged, and rejects any other', () => {
		const registry = store.add(new ExtensionRemoteAgentHostsService(store.add(new InMemoryStorageService())));
		const mainThread = store.add(new MainThreadRemoteAgentHosts(SingleProxyRPCProtocol(undefined), registry));
		const extHost = new ExtHostRemoteAgentHosts(SingleProxyRPCProtocol(mainThread));
		const extension = { ...nullExtensionDescription, displayName: 'Job Runner' };
		const registrations = [
			extHost.registerRemoteAgentHost(extension, { name: 'Proxied', address: 'ws://proxy.example:8445/http://backend.example:8080/agent?tkn=secret' }),
			extHost.registerRemoteAgentHost(extension, { name: 'Loopback', address: 'ws://[::1]' }),
		];
		const registered = registry.hosts.get().map(({ name, address, connectionToken }) => ({ name, address, connectionToken }));
		const fromDto = (address: string) => {
			try {
				mainThread.$registerRemoteAgentHost(100, { extensionId: 'publisher.jobs', extensionDisplayName: 'Job Runner', name: 'Jobs', address });
				return 'registered';
			} catch {
				return 'rejected';
			}
		};
		const rejected = ['ws://127.0.0.1:8445', 'Listening on ws://127.0.0.1:8445'].map(fromDto);
		for (const registration of registrations) {
			registration.dispose();
		}

		assert.deepStrictEqual({ registered, rejected, remaining: registry.hosts.get() }, {
			registered: [
				{ name: 'Proxied', address: 'proxy.example:8445/http://backend.example:8080/agent', connectionToken: 'secret' },
				{ name: 'Loopback', address: '[::1]', connectionToken: undefined },
			],
			rejected: ['rejected', 'rejected'],
			remaining: [],
		});
	});
});
