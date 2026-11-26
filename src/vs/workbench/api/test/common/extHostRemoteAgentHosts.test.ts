/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadRemoteAgentHostsShape, RemoteAgentHostDto } from '../../common/extHost.protocol.js';
import { ExtHostRemoteAgentHosts } from '../../common/extHostRemoteAgentHosts.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostRemoteAgentHosts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers valid hosts with their token and rejects invalid ones', () => {
		const calls: (RemoteAgentHostDto | number)[] = [];
		const proxy: Partial<MainThreadRemoteAgentHostsShape> = {
			$registerRemoteAgentHost: (_handle, host) => { calls.push(host); },
			$unregisterRemoteAgentHost: handle => { calls.push(handle); },
		};
		const hosts = new ExtHostRemoteAgentHosts(SingleProxyRPCProtocol(proxy));
		const extension = { ...nullExtensionDescription, displayName: 'Job Runner' };
		const error = (host: { name: string; address: string }) => {
			try {
				hosts.registerRemoteAgentHost(extension, host).dispose();
				return undefined;
			} catch (error) {
				return (error as Error).message;
			}
		};

		const fromUrl = hosts.registerRemoteAgentHost(extension, { name: ' Jobs ', address: 'ws://127.0.0.1:8445?tkn=from-url' });
		const explicitToken = hosts.registerRemoteAgentHost(extension, { name: 'Secure', address: 'wss://example.com:8443?tkn=from-url', connectionToken: 'explicit' });
		fromUrl.dispose();
		fromUrl.dispose();
		explicitToken.dispose();

		assert.deepStrictEqual({
			calls,
			noName: error({ name: ' ', address: 'localhost:8445' }),
			badAddress: error({ name: 'Host', address: 'ftp://localhost' }),
		}, {
			calls: [
				{ extensionId: 'nullExtensionDescription', extensionDisplayName: 'Job Runner', name: 'Jobs', address: '127.0.0.1:8445', connectionToken: 'from-url' },
				{ extensionId: 'nullExtensionDescription', extensionDisplayName: 'Job Runner', name: 'Secure', address: 'wss://example.com:8443', connectionToken: 'explicit' },
				0,
				1,
			],
			noName: 'A remote agent host needs a name.',
			badAddress: 'Invalid remote agent host address: \'ftp://localhost\'. Expected host:port, or a ws:// or wss:// URL.',
		});
	});
});
