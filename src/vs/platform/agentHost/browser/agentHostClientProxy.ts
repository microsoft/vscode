/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IProcessEnvironment, isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
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

/** A proxy's hostname, as a URL formats it, and its port, defaulted for its scheme. */
interface IProxyEndpoint {
	readonly hostname: string;
	readonly port: number;
}

/**
 * Serves an agent host that shares this client's network, such as one in WSL or a local container, the way a remote
 * extension host with `useHostProxy` uses the local proxy configuration: proxies resolve through this client unless
 * `http.useLocalProxyConfiguration` is off, and the agent host can fall back to this client's Kerberos tickets and
 * proxy credentials.
 */
export class AgentHostClientProxy implements IAgentHostClientProxyProvider {

	/** The proxies this client resolved for the agent host or for GitHub Copilot, by endpoint. */
	private readonly _resolvedProxies = new Map<string, IProxyEndpoint>();
	/** The lookups and hosts of the proxies this client declined, to log each once. */
	private readonly _declinedLookups = new Set<string>();

	/**
	 * @param _environment This client's environment, which it inherits from the main process that the native credential
	 * lookup reads its environment proxy in.
	 */
	constructor(
		private readonly _isEnabled: () => boolean,
		private readonly _environment: IProcessEnvironment,
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
		this._rememberProxies(getResolvedProxies(proxy));
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
	 * as the ones in `http.proxy` or `HTTPS_PROXY`, so they only go to the endpoints of proxies this client points the
	 * agent host at.
	 */
	async lookupBasicAuthorization(proxyUrl: string, realm: string | undefined, attempt: number): Promise<Credentials | undefined> {
		if (this._configurationService.getValue<boolean>('http.useLocalProxyConfiguration') === false) {
			return undefined;
		}
		const proxy = getProxyEndpoint(proxyUrl);
		if (!proxy || !await this._isResolvedProxy(proxy, true)) {
			this._logDeclined('Basic credentials', proxyUrl);
			return undefined;
		}
		return this._requestService.lookupAuthorization({
			isProxy: true,
			scheme: 'basic',
			host: proxy.hostname,
			// Like Electron, with the default port, which keys the credentials its login dialog stores.
			port: proxy.port,
			realm: realm ?? '',
			attempt,
		});
	}

	private _logDeclined(lookup: string, proxyUrl: string): void {
		const host = getProxyEndpoint(proxyUrl)?.hostname ?? 'an invalid URL';
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
		if (this._getLocalValue<string>(AgentHostProxyConfigKey.ProxyKerberosServicePrincipal)?.trim()) {
			return true;
		}
		const proxy = getProxyEndpoint(proxyUrl);
		return !!proxy && this._isResolvedProxy(proxy, false);
	}

	/**
	 * Whether `proxy` is a proxy this client points the agent host at: its `http.proxy` setting, the proxies it
	 * resolved for the agent host, or the system proxy for GitHub Copilot, which also covers a proxy an earlier window
	 * resolved. `http.proxy` is read as the native request service reads it, so remote settings cannot widen access.
	 *
	 * With `matchEndpoint`, the port must match too, and while the native lookup returns the credentials of a proxy for
	 * any proxy on the first attempt (see {@link _getCredentialsProxy}), only that proxy can qualify, even when another
	 * was resolved before.
	 */
	private async _isResolvedProxy(proxy: IProxyEndpoint, matchEndpoint: boolean): Promise<boolean> {
		const matches = (candidate: IProxyEndpoint) => candidate.hostname === proxy.hostname && (!matchEndpoint || candidate.port === proxy.port);
		const credentialsProxy = matchEndpoint ? this._getCredentialsProxy() : undefined;
		if (credentialsProxy !== undefined) {
			const endpoint = getProxyEndpoint(credentialsProxy);
			if (!endpoint || !matches(endpoint)) {
				return false;
			}
		}
		return [...this._resolvedProxies.values()].some(matches) || (await this._resolveCopilotProxies()).some(matches);
	}

	/**
	 * The proxy whose credentials, if any, the native lookup returns for any proxy on the first attempt: `http.proxy`,
	 * or else a proxy with credentials in the main process's environment.
	 */
	private _getCredentialsProxy(): string | undefined {
		const configuredProxy = this._getConfiguredProxy();
		if (configuredProxy) {
			return configuredProxy;
		}
		const environmentProxy = getEnvironmentProxy(this._environment);
		return environmentProxy && URI.parse(environmentProxy).authority.includes('@') ? environmentProxy : undefined;
	}

	private async _resolveCopilotProxies(): Promise<IProxyEndpoint[]> {
		const configuredProxy = this._getConfiguredProxy();
		if (configuredProxy) {
			const proxy = getProxyEndpoint(configuredProxy);
			return proxy ? [proxy] : [];
		}
		if (this._configurationService.getValue<boolean>(AgentHostSystemProxyEnabledSettingId) === false) {
			return [];
		}
		const apiUrl = this._defaultAccountService.currentDefaultAccount?.entitlementsData?.endpoints?.api || GITHUB_DOT_COM_COPILOT_API_BASE_URI;
		try {
			const proxies = getResolvedProxies(await this._requestService.resolveProxy(apiUrl));
			// Remembered like the proxies resolved for the agent host, so that later lookups for them resolve nothing.
			this._rememberProxies(proxies);
			return proxies;
		} catch (error) {
			this._logService.debug('[AgentHostClientProxy] Failed to resolve the GitHub Copilot proxy', error);
			return [];
		}
	}

	private _rememberProxies(proxies: readonly IProxyEndpoint[]): void {
		for (const proxy of proxies) {
			this._resolvedProxies.set(`${proxy.hostname} ${proxy.port}`, proxy);
		}
	}

	/** The agent host receives the client's `http.proxy` setting under the same key. */
	private _getConfiguredProxy(): string | undefined {
		return this._getLocalValue<string>(AgentHostProxyConfigKey.Proxy)?.trim() || undefined;
	}

	/** The local user or default value, the layers the native request service reads for Kerberos tickets. */
	private _getLocalValue<T>(key: string): T | undefined {
		const { userLocalValue, defaultValue } = this._configurationService.inspect<T>(key);
		return userLocalValue ?? defaultValue;
	}
}

function getProxyEndpoint(url: string): IProxyEndpoint | undefined {
	try {
		const { protocol, hostname, port } = new URL(url);
		return hostname ? { hostname, port: Number(port) || (protocol === 'https:' ? 443 : 80) } : undefined;
	} catch {
		return undefined;
	}
}

/** The environment's proxy, read like the native lookup reads it from the main process, which ignores case on Windows. */
function getEnvironmentProxy(environment: IProcessEnvironment): string | undefined {
	const read = (name: string) => environment[isWindows ? Object.keys(environment).find(key => key.toUpperCase() === name.toUpperCase()) ?? name : name];
	return (read('https_proxy') || read('HTTPS_PROXY') || read('http_proxy') || read('HTTP_PROXY') || '').trim() || undefined;
}

/** The HTTP proxies in a PAC-style result such as `PROXY proxy:8080; DIRECT`. */
function getResolvedProxies(resolvedProxy: string | undefined): IProxyEndpoint[] {
	return (resolvedProxy ?? '').split(';').flatMap(entry => {
		const groups = /^\s*(?<type>PROXY|HTTPS?)\s+(?<address>\S+)\s*$/i.exec(entry)?.groups;
		const proxy = groups && getProxyEndpoint(`${groups.type.toUpperCase() === 'HTTPS' ? 'https' : 'http'}://${groups.address}`);
		return proxy ? [proxy] : [];
	});
}
