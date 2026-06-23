/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { type IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IByokLmBridgeConnection } from '../../common/agentHostByokLm.js';
import type { AgentHostClientFileSystemProvider } from '../../common/agentHostClientFileSystemProvider.js';
import { registerAgentHostClientReverseRpc } from '../../node/agentHostClientReverseRpc.js';
import type { IByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';

suite('registerAgentHostClientReverseRpc', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class NullChannel extends mock<IChannel>() { }
	const getChannel = (_channelName: string): IChannel => new NullChannel();

	function fsProvider(): { provider: Pick<AgentHostClientFileSystemProvider, 'registerAuthority'>; registered: string[] } {
		const registered: string[] = [];
		return {
			registered,
			provider: { registerAuthority: (clientId: string): IDisposable => { registered.push(clientId); return toDisposable(() => { }); } },
		};
	}

	function bridgeRegistry(): { registry: IByokLmBridgeRegistry; registered: string[] } {
		const registered: string[] = [];
		return {
			registered,
			registry: {
				_serviceBrand: undefined,
				register: (clientId: string, _connection: IByokLmBridgeConnection): IDisposable => { registered.push(clientId); return toDisposable(() => { }); },
				get: () => undefined,
				getActive: () => undefined,
			},
		};
	}

	test('registers both the filesystem and BYOK bridges when a registry is provided', () => {
		const fs = fsProvider();
		const reg = bridgeRegistry();
		const store = registerAgentHostClientReverseRpc('client-1', getChannel, fs.provider, reg.registry);
		assert.deepStrictEqual(fs.registered, ['client-1']);
		assert.deepStrictEqual(reg.registered, ['client-1']);
		store.dispose();
	});

	test('registers only the filesystem bridge when the registry is undefined (BYOK gated off)', () => {
		const fs = fsProvider();
		const reg = bridgeRegistry();
		const store = registerAgentHostClientReverseRpc('client-1', getChannel, fs.provider, undefined);
		assert.deepStrictEqual(fs.registered, ['client-1']);
		assert.deepStrictEqual(reg.registered, []);
		store.dispose();
	});
});
