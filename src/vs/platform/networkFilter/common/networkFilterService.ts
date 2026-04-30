/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { LRUCache } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AgentSandboxSettingId } from '../../sandbox/common/settings.js';
import { ITerminalSandboxService } from '../../sandbox/common/terminalSandboxService.js';
import { extractDomainFromUri, isDomainAllowed } from './domainMatcher.js';
import { AgentNetworkDomainSettingId } from './settings.js';

export const IAgentNetworkFilterService = createDecorator<IAgentNetworkFilterService>('agentNetworkFilterService');

export const AgentNetworkFilterFetchWebToolName = 'fetchWebTool';

/**
 * Service that filters network requests made by agent tools (fetch tool,
 * integrated browser) based on the configured allowed/denied domain lists.
 *
 * Filtering is active for all callers when the `chat.agent.networkFilter` setting
 * is enabled. When only sandboxing is enabled, filtering is active for fetch web
 * page tool requests. This has to be revisited for integrated browser requests.
 * When both domain lists are empty, all domains are denied.
 * When a domain appears on the denied list it is always blocked, even if it
 * also matches an entry on the allowed list.
 */
export interface IAgentNetworkFilterService {
	readonly _serviceBrand: undefined;

	/**
	 * Extracts the domain from a URI and checks it against the configured
	 * allowed/denied domain filter.
	 * File URIs and URIs without an authority always pass.
	 * @param toolName Optional tool name for sandbox-only filtering.
	 * @returns `true` if the URI's domain is allowed, `false` if blocked.
	 */
	isUriAllowed(uri: URI, toolName?: string): boolean;

	/**
	 * Formats an error message for a blocked URI based on the current filter configuration.
	 * @param uri The URI that was blocked.
	 * @returns A localized error message explaining that access to the URI is blocked by policy.
	 */
	formatError(uri: URI): string;

	/**
	 * Fires when the filter configuration changes.
	 */
	readonly onDidChange: Event<void>;
}

export class AgentNetworkFilterService extends Disposable implements IAgentNetworkFilterService {
	readonly _serviceBrand: undefined;

	private networkFilterEnabled = false;
	private terminalSandboxEnabled = false;
	private allowedPatterns: string[] = [];
	private deniedPatterns: string[] = [];
	private readonly domainCache = new LRUCache<string, boolean>(100);

	private readonly onDidChangeEmitter = this._register(new Emitter<void>());
	readonly onDidChange = this.onDidChangeEmitter.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITerminalSandboxService private readonly terminalSandboxService: ITerminalSandboxService,
	) {
		super();
		this.readConfiguration();
		void this.updateTerminalSandboxEnabled();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(AgentNetworkDomainSettingId.NetworkFilter) ||
				e.affectsConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains) ||
				e.affectsConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains)
			) {
				this.readConfiguration();
				this.onDidChangeEmitter.fire();
			} else if (
				e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxEnabled) ||
				e.affectsConfiguration(AgentSandboxSettingId.DeprecatedAgentSandboxEnabled)
			) {
				void this.updateTerminalSandboxEnabled();
			}
		}));
	}

	private readConfiguration(): void {
		const networkFilterEnabled = this.configurationService.getValue<boolean>(AgentNetworkDomainSettingId.NetworkFilter) ?? false;

		this.networkFilterEnabled = networkFilterEnabled;
		this.allowedPatterns = this.configurationService.getValue<string[]>(AgentNetworkDomainSettingId.AllowedNetworkDomains) ?? [];
		this.deniedPatterns = this.configurationService.getValue<string[]>(AgentNetworkDomainSettingId.DeniedNetworkDomains) ?? [];
		this.domainCache.clear();
	}

	private async updateTerminalSandboxEnabled(): Promise<void> {
		const enabled = await this.terminalSandboxService.isEnabled();
		if (this.terminalSandboxEnabled === enabled) {
			return;
		}
		this.terminalSandboxEnabled = enabled;
		this.readConfiguration();
		this.onDidChangeEmitter.fire();
	}

	isUriAllowed(uri: URI, toolName?: string): boolean {
		// When domain filtering is inactive, allow all requests.
		if (!this.shouldFilter(toolName)) {
			return true;
		}

		// File URIs and URIs without authority always pass
		if (uri.scheme === 'file' || !uri.authority) {
			return true;
		}

		const domain = extractDomainFromUri(uri);
		if (!domain) {
			return true;
		}

		let result = this.domainCache.get(domain);
		if (result === undefined) {
			result = isDomainAllowed(domain, this.allowedPatterns, this.deniedPatterns);
			this.domainCache.set(domain, result);
		}

		return result;
	}
	// Determines whether network filtering should be applied for a given request
	// based on the global network filter setting, the terminal sandbox state, and the tool making the request.
	// For sandbox mode, network filtering is applied only when the global network filter is disabled
	// and the request is coming from the fetch web tool.
	private shouldFilter(toolName: string | undefined): boolean {
		return this.networkFilterEnabled || (this.terminalSandboxEnabled && toolName === AgentNetworkFilterFetchWebToolName);
	}

	formatError(uri: URI): string {
		const domain = extractDomainFromUri(uri);
		return localize(
			'networkFilter.blockedByPolicy',
			'Access to {0} is blocked by network domain policy (see `{1}` and `{2}` settings).',
			domain ?? uri.authority,
			AgentNetworkDomainSettingId.AllowedNetworkDomains,
			AgentNetworkDomainSettingId.DeniedNetworkDomains,
		);
	}
}
