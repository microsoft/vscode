/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IDefaultAccountService } from '../../defaultAccount/common/defaultAccount.js';
import { GITHUB_DOT_COM_COPILOT_API_BASE_URI } from '../../github/common/githubEndpoints.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostService } from '../../native/common/native.js';
import { IRequestService } from '../../request/common/request.js';
import type { IAgentHostKerberosAuthRequest } from '../common/agentHostExtensionProtocol.js';
import { AgentHostProxyConfigKey } from '../common/agentHostSchema.js';
import { AgentHostSystemProxyEnabledSettingId } from '../common/agentService.js';

/**
 * Supplies native Kerberos tokens to an agent host, but only for the proxy that GitHub Copilot
 * traffic uses. That proxy is resolved the way the agent host resolves it: the `http.proxy`
 * setting, else the system proxy for the account's Copilot API endpoint.
 */
export class CopilotProxyKerberosAuth {

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRequestService private readonly _requestService: IRequestService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@ILogService private readonly _logService: ILogService,
	) { }

	/** Returns a base64 initial SPNEGO token for `spn`, or `undefined` unless it names the Copilot proxy. */
	async lookup({ spn }: IAgentHostKerberosAuthRequest): Promise<string | undefined> {
		if (!await this._isCopilotProxyServicePrincipal(spn)) {
			this._logService.info(`[CopilotProxyKerberosAuth] Declined Kerberos lookup for ${spn}: not the GitHub Copilot proxy`);
			return undefined;
		}
		return this._nativeHostService.lookupKerberosToken(spn);
	}

	private async _isCopilotProxyServicePrincipal(spn: string): Promise<boolean> {
		const proxyHosts = await this._resolveCopilotProxyHosts();
		if (!proxyHosts.length) {
			return false;
		}
		const host = getHttpServicePrincipalHost(spn);
		if (host && proxyHosts.includes(host)) {
			return true;
		}
		// The agent host forwards this setting as the runtime's proxy principal override.
		const configuredSpn = this._configurationService.getValue<string>(AgentHostProxyConfigKey.ProxyKerberosServicePrincipal)?.trim();
		return !!configuredSpn && normalizeServicePrincipal(configuredSpn) === normalizeServicePrincipal(spn);
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
			this._logService.debug('[CopilotProxyKerberosAuth] Failed to resolve the GitHub Copilot proxy', error);
			return [];
		}
	}
}

function normalizeHost(host: string): string {
	return host.replace(/^\[(.*)\]$/, '$1').toLowerCase();
}

function getUrlHost(url: string): string | undefined {
	try {
		const { hostname } = new URL(url);
		return hostname ? normalizeHost(hostname) : undefined;
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

/** The host of an `HTTP/host[@REALM]` principal. */
function getHttpServicePrincipalHost(spn: string): string | undefined {
	const host = /^HTTP\/(?<host>[^@\s]+)(?:@[^@\s]+)?$/i.exec(spn)?.groups?.host;
	return host ? normalizeHost(host) : undefined;
}

/** Converts GSSAPI's `service@host` to the `service/host[@REALM]` form, for case-insensitive comparison. */
function normalizeServicePrincipal(spn: string): string {
	return (spn.includes('/') ? spn : spn.replace('@', '/')).toLowerCase();
}
