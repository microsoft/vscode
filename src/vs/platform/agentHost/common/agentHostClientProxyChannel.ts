/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IRequestService } from '../../request/common/request.js';

/**
 * IPC channel name used for in-process agent-host → renderer reverse proxy
 * resolution RPCs. The renderer registers a server channel under this name on
 * its `MessagePortClient`; the agent host reaches it via
 * `server.getChannel(name, c => c.ctx === clientId)` on its
 * `UtilityProcessServer`.
 *
 * Mirrors {@link AGENT_HOST_CLIENT_BYOK_LM_CHANNEL} for the reverse BYOK bridge.
 */
export const AGENT_HOST_CLIENT_PROXY_CHANNEL = 'agentHostClientProxy';

/**
 * Node end of the proxy-resolution bridge: `resolveProxy()` ships the target
 * URL to the renderer and resolves with the *raw* result of VS Code's
 * `IRequestService.resolveProxy` (the Electron session PAC-style string, e.g.
 * `PROXY host:port` / `DIRECT`). The node side feeds this into
 * `@vscode/proxy-agent`'s `resolveProxyURL` to derive the final proxy URL.
 */
export interface IAgentHostClientProxyConnection {
	resolveProxy(url: string): Promise<string | undefined>;
}

/**
 * Wraps an {@link IChannel} (obtained from the agent host's
 * `UtilityProcessServer.getChannel`) into an {@link IAgentHostClientProxyConnection}.
 */
export function createAgentHostClientProxyConnection(channel: IChannel): IAgentHostClientProxyConnection {
	return {
		resolveProxy: (url) => channel.call('resolveProxy', { url }) as Promise<string | undefined>,
	};
}

/**
 * Server-side channel for in-process reverse proxy-resolution RPCs from the
 * local agent host. Thin adapter — forwards `resolveProxy` calls to the
 * renderer's {@link IRequestService}, which resolves the proxy through the
 * Electron session (system proxy settings, PAC scripts, etc.). The raw result
 * is returned verbatim; the node side derives the proxy URL from it.
 */
export class AgentHostClientProxyChannel implements IServerChannel {

	constructor(
		@IRequestService private readonly _requestService: IRequestService,
	) { }

	listen<T>(_ctx: unknown, event: string): Event<T> {
		throw new Error(`No event '${event}' on AgentHostClientProxyChannel`);
	}

	async call<T>(_ctx: unknown, command: string, arg?: unknown): Promise<T> {
		switch (command) {
			case 'resolveProxy': {
				const { url } = arg as { url: string };
				const proxy = await this._requestService.resolveProxy(url);
				return proxy as T;
			}
		}
		throw new Error(`Unknown command '${command}' on AgentHostClientProxyChannel`);
	}
}
