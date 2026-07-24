/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IChannelServer, IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_HOST_CLIENT_RESOURCE_CHANNEL } from '../../common/agentHostClientResourceChannel.js';
import { AGENT_HOST_CLIENT_PROXY_CHANNEL } from '../../common/agentHostClientProxyChannel.js';
import { AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, AgentHostClientByokLmChannel } from '../../common/agentHostClientByokLmChannel.js';
import { registerAgentHostClientChannels } from '../../electron-browser/localAgentHostService.js';

/**
 * Regression coverage for the renderer reverse-RPC channel registration. The
 * BYOK language-model bridge depends on `IAgentHostByokLmHandler`, registered by
 * the chat contribution of every window that backs BYOK (the main workbench and
 * the Agents app). The registration must still degrade gracefully should a
 * window ever connect without binding the handler — `createInstance` then throws,
 * and that must NOT abort the rest of `_connect` (client completion,
 * action/notification wiring, root-state subscription), or the whole window loses
 * its agent host.
 */
suite('registerAgentHostClientChannels', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function fakeChannelServer(): { server: IChannelServer; registered: string[] } {
		const registered: string[] = [];
		const server: IChannelServer = {
			registerChannel: (name: string, _channel: IServerChannel) => { registered.push(name); },
		};
		return { server, registered };
	}

	/**
	 * Minimal {@link IInstantiationService} whose `createInstance` throws for the
	 * BYOK channel when `byokHandlerMissing`, mirroring the strict "UNKNOWN
	 * service agentHostByokLmHandler" failure in windows without the handler.
	 */
	function fakeInstantiationService(byokHandlerMissing: boolean): IInstantiationService {
		return {
			createInstance: (ctor: unknown) => {
				if (ctor === AgentHostClientByokLmChannel && byokHandlerMissing) {
					throw new Error('[createInstance] AgentHostClientByokLmChannel depends on UNKNOWN service agentHostByokLmHandler.');
				}
				return {};
			},
		} as unknown as IInstantiationService;
	}

	test('registers both channels when BYOK is enabled and the handler is available', () => {
		const { server, registered } = fakeChannelServer();
		registerAgentHostClientChannels(server, fakeInstantiationService(false), new NullLogService(), undefined, true);
		assert.deepStrictEqual(registered, [AGENT_HOST_CLIENT_RESOURCE_CHANNEL, AGENT_HOST_CLIENT_PROXY_CHANNEL, AGENT_HOST_CLIENT_BYOK_LM_CHANNEL]);
	});

	test('registers only the resource and proxy channels and does NOT throw when the BYOK handler is missing', () => {
		const { server, registered } = fakeChannelServer();
		// Must not throw: the agent host connection has to come up even if a
		// window connects without the handler and so cannot serve BYOK itself.
		registerAgentHostClientChannels(server, fakeInstantiationService(true), new NullLogService(), undefined, true);
		assert.deepStrictEqual(registered, [AGENT_HOST_CLIENT_RESOURCE_CHANNEL, AGENT_HOST_CLIENT_PROXY_CHANNEL]);
	});

	test('registers only the resource and proxy channels when BYOK is disabled', () => {
		const { server, registered } = fakeChannelServer();
		registerAgentHostClientChannels(server, fakeInstantiationService(false), new NullLogService(), undefined, false);
		assert.deepStrictEqual(registered, [AGENT_HOST_CLIENT_RESOURCE_CHANNEL, AGENT_HOST_CLIENT_PROXY_CHANNEL]);
	});
});
