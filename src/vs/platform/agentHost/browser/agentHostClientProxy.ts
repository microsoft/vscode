/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IDefaultAccountService } from '../../defaultAccount/common/defaultAccount.js';
import { GITHUB_DOT_COM_COPILOT_API_BASE_URI } from '../../github/common/githubEndpoints.js';
import { ILogService } from '../../log/common/log.js';
import { Credentials, IRequestService } from '../../request/common/request.js';
import type { IAgentHostClientProxyProvider } from '../common/clientProxyProtocol.js';
import { AgentHostProxyConfigKey } from '../common/agentHostSchema.js';
import { AgentHostSystemProxyEnabledSettingId } from '../common/agentService.js';

/** Settings that change how this client resolves proxies for the agent host. */
const clientProxySettings = ['http.useLocalProxyConfiguration', 'http.proxy', 'http.noProxy', 'http.proxySupport'];

/**
 * Serves an agent host that shares this client's network, such as one in WSL or a local container, the way a remote
 * extension host with `useHostProxy` uses the local proxy configuration: proxies resolve through this client unless
 * `http.useLocalProxyConfiguration` is off, and the agent host can fall back to this client's Kerberos tickets and
 * proxy credentials.
 */
export class AgentHostClientProxy implements IAgentHostClientProxyProvider {

	/** Hosts of the proxies this client resolved for the agent host or for GitHub Copilot. */
	private readonly _resolvedProxyHosts = new Set<string>();
	/** The lookups and hosts of the proxies this client declined, to log each once. */
	private readonly _declinedLookups = new Set<string>();

	constructor(
		private readonly _isEnabled: () => boolean,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRequestService private readonly _requestService: IRequestService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ILogService private readonly _logService: ILogService,
	) { }

	get onDidChange(): Event<void> {
		return Event.signal(Event.filter(this._configurationService.onDidChangeConfiguration, e => clientProxySettings.some(key => e.affectsConfiguration(key))));
	}

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
			this._logDeclined('Kerberos', proxyUrl);
			return undefined;
		}
		return this._requestService.lookupKerberosAuthorization(proxyUrl);
	}

	/**
	 * Unlike Kerberos tickets, Basic credentials are reusable secrets that the native lookup returns for any proxy, such
	 * as the ones in `http.proxy`, so they only go to proxies this client points the agent host at.
	 */
	async lookupBasicCredentials(proxyUrl: string, realm: string | undefined, attempt: number): Promise<Credentials | undefined> {
		if (this._configurationService.getValue<boolean>('http.useLocalProxyConfiguration') === false) {
			return undefined;
		}
		if (!await this._isResolvedProxy(proxyUrl)) {
			this._logDeclined('Basic credentials', proxyUrl);
			return undefined;
		}
		const { protocol, hostname, port } = new URL(proxyUrl);
		return this._requestService.lookupAuthorization({
			isProxy: true,
			scheme: 'basic',
			host: hostname,
			// Like Electron, with the default port, which keys the credentials its login dialog stores.
			port: Number(port) || (protocol === 'https:' ? 443 : 80),
			realm: realm ?? '',
			attempt,
		});
	}

	private _logDeclined(lookup: string, proxyUrl: string): void {
		const host = getUrlHost(proxyUrl) ?? 'an invalid URL';
		const key = `${lookup} ${host}`;
		if (!this._declinedLookups.has(key)) {
			this._declinedLookups.add(key);
			this._logService.info(`[AgentHostClientProxy] Declined ${lookup} lookup for ${host}: not a proxy this client points the agent host at`);
		}
	}

	/**
	 * Tickets are only issued for proxies this client points the agent host at (see {@link _isResolvedProxy}). A
	 * configured `http.proxyKerberosServicePrincipal` limits tickets to that principal instead. It is read as the native
	 * request service issuing the tickets reads it, so remote settings cannot widen access.
	 */
	private async _isAgentHostProxy(proxyUrl: string): Promise<boolean> {
		return !!this._getLocalValue<string>(AgentHostProxyConfigKey.ProxyKerberosServicePrincipal)?.trim() || this._isResolvedProxy(proxyUrl);
	}

	/**
	 * Whether `proxyUrl` is a proxy this client points the agent host at: its `http.proxy` setting, the proxies it
	 * resolved for the agent host, or the system proxy for GitHub Copilot, which also covers a proxy an earlier window
	 * resolved. `http.proxy` is read as the native request service reads it, so remote settings cannot widen access.
	 */
	private async _isResolvedProxy(proxyUrl: string): Promise<boolean> {
		const host = getUrlHost(proxyUrl);
		return !!host && (this._resolvedProxyHosts.has(host) || (await this._resolveCopilotProxyHosts()).includes(host));
	}

	private async _resolveCopilotProxyHosts(): Promise<string[]> {
		// The agent host receives the client's `http.proxy` setting under the same key.
		const configuredProxy = this._getLocalValue<string>(AgentHostProxyConfigKey.Proxy)?.trim();
		if (configuredProxy) {
			const host = getUrlHost(configuredProxy);
			return host ? [host] : [];
		}
		if (this._configurationService.getValue<boolean>(AgentHostSystemProxyEnabledSettingId) === false) {
			return [];
		}
		const apiUrl = this._defaultAccountService.currentDefaultAccount?.entitlementsData?.endpoints?.api || GITHUB_DOT_COM_COPILOT_API_BASE_URI;
		try {
			const hosts = getResolvedProxyHosts(await this._requestService.resolveProxy(apiUrl));
			// Remembered like the proxies resolved for the agent host, so that later lookups for them resolve nothing.
			for (const host of hosts) {
				this._resolvedProxyHosts.add(host);
			}
			return hosts;
		} catch (error) {
			this._logService.debug('[AgentHostClientProxy] Failed to resolve the GitHub Copilot proxy', error);
			return [];
		}
	}

	/** The local user or default value, the layers the native request service reads for Kerberos tickets. */
	private _getLocalValue<T>(key: string): T | undefined {
		const { userLocalValue, defaultValue } = this._configurationService.inspect<T>(key);
		return userLocalValue ?? defaultValue;
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
