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
import { extractDomainFromUri, isDomainAllowed } from './domainMatcher.js';
import { AgentNetworkDomainSettingId } from './settings.js';

export const IAgentNetworkFilterService = createDecorator<IAgentNetworkFilterService>('agentNetworkFilterService');

/**
 * Service that filters network requests made by agent tools (fetch tool,
 * integrated browser) based on the configured allowed/denied domain lists.
 *
 * Filtering is only active when the `chat.agent.networkFilter` setting is
 * enabled.  When both domain lists are empty, all domains are denied.
 * When a domain appears on the denied list it is always blocked, even if it
 * also matches an entry on the allowed list.
 */
export interface IAgentNetworkFilterService {
	readonly _serviceBrand: undefined;

	/**
	 * Extracts the domain from a URI and checks it against the configured
	 * allowed/denied domain filter.
	 * File URIs and URIs without an authority always pass.
	 * @returns `true` if the URI's domain is allowed, `false` if blocked.
	 */
	isUriAllowed(uri: URI): boolean;

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

	private enabled = false;
	private allowedPatterns: string[] = [];
	private deniedPatterns: string[] = [];
	private readonly domainCache = new LRUCache<string, boolean>(100);

	private readonly onDidChangeEmitter = this._register(new Emitter<void>());
	readonly onDidChange = this.onDidChangeEmitter.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.readConfiguration();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(AgentNetworkDomainSettingId.NetworkFilter) ||
				e.affectsConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains) ||
				e.affectsConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains)
			) {
				this.readConfiguration();
				this.onDidChangeEmitter.fire();
			}
		}));
	}

	private readConfiguration(): void {
		this.enabled = this.configurationService.getValue<boolean>(AgentNetworkDomainSettingId.NetworkFilter) ?? false;
		this.allowedPatterns = this.configurationService.getValue<string[]>(AgentNetworkDomainSettingId.AllowedNetworkDomains) ?? [];
		this.deniedPatterns = this.configurationService.getValue<string[]>(AgentNetworkDomainSettingId.DeniedNetworkDomains) ?? [];
		this.domainCache.clear();
	}

	isUriAllowed(uri: URI): boolean {
		// When the network filter is disabled, allow all requests.
		if (!this.enabled) {
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
