/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../common/agentHostCustomizationConfig.js';
import { deriveGitHubEndpoints, gitHubCopilotResource, gitHubRepoResource, IGitHubEndpoints } from '../common/githubEndpoints.js';
import { ProtectedResourceMetadata } from '../common/state/protocol/state.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';

export const IAgentHostGitHubEndpointService = createDecorator<IAgentHostGitHubEndpointService>('agentHostGitHubEndpointService');

/**
 * Single source of truth for the GitHub endpoints (protected resources + REST /
 * GraphQL hosts) the agent host talks to. Computed from the optional
 * `githubEnterpriseUri` root config so that every consumer — agent
 * `authenticate` / `getProtectedResources`, changeset operation `getAuthToken`
 * lookups, and the REST client — agrees on the same resource identifiers and API
 * base. With no enterprise URI configured, the values are byte-for-byte the
 * github.com defaults.
 */
export interface IAgentHostGitHubEndpointService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the configured GitHub endpoints change (e.g. `githubEnterpriseUri`
	 * was set, cleared, or repointed). Does NOT fire for unrelated root-config
	 * changes.
	 */
	readonly onDidChange: Event<void>;

	/** The GitHub Copilot protected resource, computed against the configured endpoints. */
	getCopilotResource(): ProtectedResourceMetadata;

	/** The GitHub repository protected resource, computed against the configured endpoints. */
	getRepoResource(): ProtectedResourceMetadata;

	/** The REST API base URI (no trailing slash), e.g. `https://api.github.com`. */
	getApiBaseUri(): string;

	/** The GraphQL endpoint URI, e.g. `https://api.github.com/graphql`. */
	getGraphQlUri(): string;

	/**
	 * The configured GitHub Enterprise host (authority only, e.g. `acme.ghe.com`),
	 * or `undefined` for github.com. Used to set `COPILOT_GH_HOST` for the Copilot CLI.
	 */
	getEnterpriseHost(): string | undefined;

	/**
	 * The raw configured GitHub Enterprise base URI (e.g. `https://acme.ghe.com`),
	 * or `undefined` for github.com. This is the value the `@vscode/copilot-api`
	 * `CAPIClient.updateDomains(..., enterpriseUrlConfig)` expects: it derives the
	 * GitHub API host (`api.<host>`) used for `copilot_internal` endpoints (token
	 * mint, etc.) from it. Distinct from {@link getApiBaseUri} (the already-derived
	 * `api.` host) - the package does that derivation itself.
	 */
	getEnterpriseUri(): string | undefined;
}

export class AgentHostGitHubEndpointService extends Disposable implements IAgentHostGitHubEndpointService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _endpoints: IGitHubEndpoints;
	private _enterpriseUri: string | undefined;

	constructor(
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const resolved = this._resolve();
		this._endpoints = resolved.endpoints;
		this._enterpriseUri = resolved.enterpriseUri;
		this._register(this._configurationService.onDidRootConfigChange(() => {
			const next = this._resolve();
			// `onDidRootConfigChange` fires for every root-config key; only react
			// when the derived GitHub endpoints actually change.
			if (next.endpoints.apiBaseUri === this._endpoints.apiBaseUri
				&& next.endpoints.graphQlUri === this._endpoints.graphQlUri
				&& next.endpoints.oauthServer === this._endpoints.oauthServer) {
				return;
			}
			this._logService.info(`[AgentHost] GitHub endpoints changed (api=${next.endpoints.apiBaseUri})`);
			this._endpoints = next.endpoints;
			this._enterpriseUri = next.enterpriseUri;
			this._onDidChange.fire();
		}));
	}

	private _resolve(): { endpoints: IGitHubEndpoints; enterpriseUri: string | undefined } {
		const enterpriseUri = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.GithubEnterpriseUri);
		return { endpoints: deriveGitHubEndpoints(enterpriseUri), enterpriseUri: enterpriseUri || undefined };
	}

	getApiBaseUri(): string {
		return this._endpoints.apiBaseUri;
	}

	getGraphQlUri(): string {
		return this._endpoints.graphQlUri;
	}

	getEnterpriseHost(): string | undefined {
		return this._endpoints.enterpriseHost;
	}

	getEnterpriseUri(): string | undefined {
		return this._enterpriseUri;
	}

	getCopilotResource(): ProtectedResourceMetadata {
		return gitHubCopilotResource(this._endpoints);
	}

	getRepoResource(): ProtectedResourceMetadata {
		return gitHubRepoResource(this._endpoints);
	}
}
