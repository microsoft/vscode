/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IDefaultAccountService } from '../../defaultAccount/common/defaultAccount.js';
import { GITHUB_DOT_COM_COPILOT_API_BASE_URI } from '../../github/common/githubEndpoints.js';
import { ILogService } from '../../log/common/log.js';
import { IRequestService } from '../../request/common/request.js';
import type { IAgentHostClientProxyProvider } from '../common/clientProxyProtocol.js';
import { AgentHostProxyConfigKey } from '../common/agentHostSchema.js';
import { AgentHostSystemProxyEnabledSettingId } from '../common/agentService.js';

/**
 * Serves an agent host that shares this client's network, such as one in WSL or a local container, the way a remote
 * extension host with `useHostProxy` uses the local proxy configuration: proxies resolve through this client unless
 * `http.useLocalProxyConfiguration` is off, and the agent host can fall back to this client's Kerberos tickets.
 */
export class AgentHostClientProxy implements IAgentHostClientProxyProvider {

	/** Hosts of the proxies this client resolved for the agent host. */
	private readonly _resolvedProxyHosts = new Set<string>();

	constructor(
		private readonly _isEnabled: () => boolean,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRequestService private readonly _requestService: IRequestService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ILogService private readonly _logService: ILogService,
	) { }

	isEnabled(): boolean {
		return this._isEnabled();
	}

	async resolveProxy(url: string): Promise<string | undefined> {
		if (this._configurationService.getValue<boolean>('http.useLocalProxyConfiguration') === false) {
			return undefined;
		}
		const proxy = await this._requestService.resolveProxy(url);
		for (const host of getResolvedProxyHosts(proxy)) {
			this._resolvedProxyHosts.add(host);
		}
		return proxy;
	}

	async lookupKerberosAuthorization(proxyUrl: string): Promise<string | undefined> {
		if (!await this._isAgentHostProxy(proxyUrl)) {
			this._logService.info(`[AgentHostClientProxy] Declined Kerberos lookup for ${getUrlHost(proxyUrl) ?? 'an invalid URL'}: not a proxy this client points the agent host at`);
			return undefined;
		}
		return this._requestService.lookupKerberosAuthorization(proxyUrl);
	}

	/**
	 * Tickets are only issued for proxies this client points the agent host at: its `http.proxy` setting, the proxies
	 * it resolved for the agent host, or the system proxy for GitHub Copilot, which also covers a proxy an earlier window
	 * resolved. A configured `http.proxyKerberosServicePrincipal` limits tickets to that principal instead.
	 */
	private async _isAgentHostProxy(proxyUrl: string): Promise<boolean> {
		if (this._configurationService.getValue<string>(AgentHostProxyConfigKey.ProxyKerberosServicePrincipal)?.trim()) {
			return true;
		}
		const host = getUrlHost(proxyUrl);
		return !!host && (this._resolvedProxyHosts.has(host) || (await this._resolveCopilotProxyHosts()).includes(host));
	}

	private async _resolveCopilotProxyHosts(): Promise<string[]> {
		// The agent host receives the client's `http.proxy` setting under the same key.
		const configuredProxy = this._configurationService.getValue<string>(AgentHostProxyConfigKey.Proxy)?.trim();
		if (configuredProxy) {
			const host = getUrlHost(configuredProxy);
			return host ? [host] : [];
		}
		if (this._configurationService.getValue<boolean>(AgentHostSystemProxyEnabledSettingId) === false) {
			return [];
		}
		const apiUrl = this._defaultAccountService.currentDefaultAccount?.entitlementsData?.endpoints?.api || GITHUB_DOT_COM_COPILOT_API_BASE_URI;
		try {
			return getResolvedProxyHosts(await this._requestService.resolveProxy(apiUrl));
		} catch (error) {
			this._logService.debug('[AgentHostClientProxy] Failed to resolve the GitHub Copilot proxy', error);
			return [];
		}
	}
}

function getUrlHost(url: string): string | undefined {
	try {
		const { hostname } = new URL(url);
		return hostname ? hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase() : undefined;
	} catch {
		return undefined;
	}
}

/** Hosts of the HTTP proxies in a PAC-style result such as `PROXY proxy:8080; DIRECT`. */
function getResolvedProxyHosts(resolvedProxy: string | undefined): string[] {
	return (resolvedProxy ?? '').split(';').flatMap(entry => {
		const address = /^\s*(?:PROXY|HTTPS?)\s+(?<address>\S+)\s*$/i.exec(entry)?.groups?.address;
		const host = address && getUrlHost(`http://${address}`);
		return host ? [host] : [];
	});
}
