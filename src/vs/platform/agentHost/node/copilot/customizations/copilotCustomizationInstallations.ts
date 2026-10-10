/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, InstallationConfirmationHandler, InstallationConfirmationRequest } from '@github/copilot-sdk';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { Disposable, DisposableMap, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IAgentCustomizationInstallation, IAgentCustomizationInstallationCatalogue, IAgentCustomizationInstallationRequest, IAgentCustomizationInstallationReview, IAgentCustomizationMarketplaceSearchItem, IAgentCustomizationMarketplaceSearchRequest, IAgentCustomizationMarketplaceSearchResult } from '../../../common/agent.js';

const catalogContract = {
	protocolVersion: 3,
	requiredCapabilities: ['catalog-search-credential-required', 'catalog-search-session-bound', 'catalog-selection'],
};

const catalogSearchCapabilities = [
	...catalogContract.requiredCapabilities,
	'catalog-search-pagination',
	'trust-snapshot',
	'ai-skill-discovery',
	'skill-confirmed-installation',
];
const retainedCatalogLifetimeMs = 4 * 60_000;
const maxRetainedCatalogEntries = 1000;
const policySessionIdleTimeoutMs = 10 * 60_000;
const copilotPluginMediaType = 'application/vnd.github.copilot-plugin';
const featuredPlugins = [
	{
		marketplace: 'awesome-copilot',
		name: 'azure',
		displayName: 'Azure',
		description: localize('copilot.featuredPlugin.azure.description', "Plan, deploy, troubleshoot, and manage Azure resources with skills and MCP tools."),
		publisher: 'microsoft',
	},
	{
		marketplace: 'copilot-plugins',
		name: 'workiq',
		displayName: 'WorkIQ',
		description: localize('copilot.featuredPlugin.workiq.description', "Find answers across Microsoft 365 emails, meetings, documents, and Teams messages."),
		publisher: 'microsoft',
	},
	{
		marketplace: 'awesome-copilot',
		name: 'security-best-practices',
		displayName: 'Security Best Practices',
		description: localize('copilot.featuredPlugin.securityBestPractices.description', "Build secure, accessible, reliable software."),
		publisher: 'github',
	},
] as const;

const skillInstallationContract = {
	...catalogContract,
	requiredCapabilities: [...catalogContract.requiredCapabilities, 'skill-confirmed-installation'],
};

const mcpInstallationContract = {
	...catalogContract,
	requiredCapabilities: [...catalogContract.requiredCapabilities, 'mcp-confirmed-remote-installation'],
};

interface ISdkResult {
	readonly kind: string;
	readonly message?: string;
}

interface ICopilotCustomizationInstallationClient {
	readonly rpc: Pick<CopilotClient['rpc'], 'catalog' | 'skills' | 'mcp'> & Partial<Pick<CopilotClient['rpc'], 'plugins'>>;
}

export interface ICopilotCustomizationPolicySession {
	readonly client: ICopilotCustomizationInstallationClient;
	readonly sessionId: string;
	dispose(): Promise<void>;
}

interface IPortableInstallationSummary {
	readonly installationId: string;
	readonly catalogue?: IInstallationCatalogueIdentity;
	readonly record?: {
		readonly installationId: string;
		readonly mediaType: string;
		readonly catalogue?: IInstallationCatalogueIdentity;
	};
}

interface IInstallationCatalogueIdentity {
	readonly resourceId?: string;
	readonly itemUrl?: string;
	readonly displayName: string;
	readonly description?: string;
	readonly publisher?: string;
	readonly version?: string;
	readonly source: string;
}

type CatalogSearchResult = Awaited<ReturnType<CopilotClient['rpc']['catalog']['search']>>;
type CatalogSearchSucceeded = Extract<CatalogSearchResult, { readonly kind: 'succeeded' }>;
type CatalogCandidate = CatalogSearchSucceeded['candidates'][number];
type InstallableCatalogCandidate = Extract<CatalogCandidate, { readonly kind: 'ai-skill' | 'mcp-server' }>;
type CatalogCandidateKind = InstallableCatalogCandidate['kind'];

class RetainedCatalogSelection extends Disposable {
	constructor(
		readonly client: ICopilotCustomizationInstallationClient,
		readonly policySessionId: string,
		readonly searchId: string,
		readonly candidate: InstallableCatalogCandidate,
		onExpire: () => void,
	) {
		super();
		const candidateExpiry = Date.parse(candidate.handleExpiresAt);
		const expiresIn = Number.isFinite(candidateExpiry)
			? Math.min(retainedCatalogLifetimeMs, Math.max(0, candidateExpiry - Date.now()))
			: retainedCatalogLifetimeMs;
		this._register(disposableTimeout(onExpire, expiresIn));
	}
}

class RetainedCatalogCursor extends Disposable {
	constructor(
		readonly client: ICopilotCustomizationInstallationClient,
		readonly policySessionId: string,
		readonly query: string,
		readonly limit: number,
		readonly kinds: readonly CatalogCandidateKind[],
		readonly token: string,
		readonly page: number,
		onExpire: () => void,
	) {
		super();
		this._register(disposableTimeout(onExpire, retainedCatalogLifetimeMs));
	}
}

class PendingCustomizationInstallation extends Disposable {
	approved = false;

	constructor(
		readonly id: string,
		readonly client: ICopilotCustomizationInstallationClient,
		readonly sdkOperationId: string,
		readonly policySessionId: string,
		readonly review: IAgentCustomizationInstallationReview,
		readonly validatesConfirmation: (request: InstallationConfirmationRequest) => boolean,
		readonly apply: () => Promise<ISdkResult>,
		readonly expiresAt: number,
		onExpire: () => void,
	) {
		super();
		this._register(disposableTimeout(onExpire, Math.max(0, expiresAt - Date.now())));
	}
}

export class CopilotCustomizationInstallations extends Disposable {
	private readonly operations = this._register(new DisposableMap<string, PendingCustomizationInstallation>());
	private readonly catalogSelections = this._register(new DisposableMap<string, RetainedCatalogSelection>());
	private readonly catalogCursors = this._register(new DisposableMap<string, RetainedCatalogCursor>());
	private readonly policySessionIdle = this._register(new MutableDisposable<IDisposable>());
	private policySession: ICopilotCustomizationPolicySession | undefined;
	private policySessionCreation: Promise<ICopilotCustomizationPolicySession> | undefined;
	private policySessionGeneration = 0;
	private readonly policySessionIds = new Set<string>();

	readonly confirmationHandler: InstallationConfirmationHandler = (request, token) => {
		if (token.isCancellationRequested) {
			return 'cancel';
		}
		const operation = [...this.operations].map(([, candidate]) => candidate)
			.find(candidate => candidate.sdkOperationId === request.operationId && candidate.policySessionId === request.policySessionId);
		return operation?.approved && operation.validatesConfirmation(request) ? 'confirm' : 'cancel';
	};

	constructor(
		private readonly getClient: () => Promise<ICopilotCustomizationInstallationClient>,
		private readonly getPolicySessionId: (session: URI) => string | undefined,
		private readonly createPolicySession?: (client: ICopilotCustomizationInstallationClient, sessionId: string) => Promise<ICopilotCustomizationPolicySession>,
	) {
		super();
	}

	async search(session: URI, request: IAgentCustomizationMarketplaceSearchRequest): Promise<IAgentCustomizationMarketplaceSearchResult> {
		if (!request.query.trim()) {
			if (request.mediaType && request.mediaType !== copilotPluginMediaType) {
				return { kind: 'page', items: [] };
			}
			return this.browseFeaturedPlugins(await this.getClient(), request);
		}
		const visiblePolicySessionId = this.getPolicySessionId(session);
		if (!visiblePolicySessionId && !this.createPolicySession) {
			return { kind: 'unavailable', reason: 'session' };
		}
		const client = await this.getClient();
		const policySessionId = visiblePolicySessionId ?? await this.getOrCreatePolicySessionId(client);
		const retainedCursor = request.cursor ? this.catalogCursors.deleteAndLeak(request.cursor) : undefined;
		if (request.cursor && (!retainedCursor || retainedCursor.client !== client || retainedCursor.policySessionId !== policySessionId)) {
			retainedCursor?.dispose();
			throw new Error(localize('copilot.customizationMarketplace.cursorExpired', "This catalog page expired. Start the search again."));
		}
		const kinds = retainedCursor?.kinds ?? this.getCatalogKinds(request.mediaType);
		if (kinds.length === 0) {
			retainedCursor?.dispose();
			return { kind: 'page', items: [] };
		}
		const query = retainedCursor?.query ?? request.query;
		const limit = retainedCursor?.limit ?? request.limit;
		let page = retainedCursor ? { token: retainedCursor.token, number: retainedCursor.page } : undefined;
		try {
			while (true) {
				const search = await client.rpc.catalog.search({
					contract: {
						protocolVersion: 3,
						requiredCapabilities: catalogSearchCapabilities,
					},
					policySessionId,
					query,
					limit,
					kinds: this.toCatalogKinds(kinds),
					...(page ? { page } : {}),
				});
				if (search.kind !== 'succeeded') {
					if (search.kind === 'negotiation-refused' || search.kind === 'unsupported-kind') {
						return { kind: 'unavailable', reason: 'unsupported' };
					}
					if (search.kind === 'authentication-required') {
						return { kind: 'unavailable', reason: 'authentication' };
					}
					throw new Error(search.message);
				}
				const items = search.candidates
					.filter(candidate => this.isInstallableCatalogCandidate(candidate))
					.map(candidate => this.retainCatalogCandidate(client, policySessionId, search.searchId, candidate));
				if (items.length || !search.pagination?.hasNextPage) {
					const nextCursor = search.pagination?.hasNextPage
						? this.retainCatalogCursor(client, policySessionId, query, limit, kinds, search.pagination.token, search.pagination.currentPage + 1)
						: undefined;
					return { kind: 'page', items, nextCursor };
				}
				const nextPage = search.pagination.currentPage + 1;
				if (!Number.isSafeInteger(nextPage) || nextPage <= (page?.number ?? 0) || nextPage > search.pagination.maxPage) {
					throw new Error(localize('copilot.customizationMarketplace.invalidPagination', "The Copilot customization catalog returned invalid pagination."));
				}
				page = { token: search.pagination.token, number: nextPage };
			}
		} finally {
			retainedCursor?.dispose();
		}
	}

	private async browseFeaturedPlugins(client: ICopilotCustomizationInstallationClient, request: IAgentCustomizationMarketplaceSearchRequest): Promise<IAgentCustomizationMarketplaceSearchResult> {
		const marketplacesApi = client.rpc.plugins?.marketplaces;
		if (!marketplacesApi) {
			return { kind: 'unavailable', reason: 'unsupported' };
		}
		const availableMarketplaces = new Map((await marketplacesApi.list()).marketplaces
			.filter(marketplace => marketplace.available !== false)
			.map(marketplace => [marketplace.name, marketplace.source] as const));
		return {
			kind: 'page',
			items: featuredPlugins
				.flatMap(featured => {
					const marketplaceSource = availableMarketplaces.get(featured.marketplace);
					return marketplaceSource ? [{
						selectionId: `featured-plugin:${featured.marketplace}:${featured.name}`,
						kind: 'plugin' as const,
						displayName: featured.displayName,
						description: featured.description,
						publisher: featured.publisher,
						pluginName: featured.name,
						marketplace: featured.marketplace,
						marketplaceSource,
						installable: true,
					}] : [];
				})
				.slice(0, request.limit),
		};
	}

	async list(session: URI): Promise<readonly IAgentCustomizationInstallation[]> {
		const visiblePolicySessionId = this.getVisiblePolicySessionId(session);
		const client = await this.getClient();
		const policySessionId = visiblePolicySessionId ?? await this.getOrCreatePolicySessionId(client);
		const [skills, mcp] = await Promise.all([
			client.rpc.skills.installations.list({ contract: skillInstallationContract, policySessionId }),
			client.rpc.mcp.installations.list({ contract: mcpInstallationContract, policySessionId }),
		]);
		return [
			...this.getSkillInstallations(skills),
			...this.getMcpInstallations(mcp),
		];
	}

	async recover(session: URI): Promise<readonly IAgentCustomizationInstallation[]> {
		const visiblePolicySessionId = this.getVisiblePolicySessionId(session);
		const client = await this.getClient();
		const policySessionId = visiblePolicySessionId ?? await this.getOrCreatePolicySessionId(client);
		const [skills, mcp] = await Promise.all([
			client.rpc.skills.installations.recover({ contract: skillInstallationContract, policySessionId }),
			client.rpc.mcp.installations.recover({ contract: mcpInstallationContract, policySessionId }),
		]);
		return [
			...this.getSkillInstallations(skills),
			...this.getMcpInstallations(mcp),
		];
	}

	async prepare(session: URI, request: IAgentCustomizationInstallationRequest | { readonly installationId: string }): Promise<IAgentCustomizationInstallationReview> {
		const visiblePolicySessionId = this.getVisiblePolicySessionId(session);
		const client = await this.getClient();
		const policySessionId = visiblePolicySessionId ?? await this.getOrCreatePolicySessionId(client);
		return hasKey(request, { installationId: true })
			? this.prepareUninstall(client, policySessionId, request.installationId)
			: this.prepareInstall(client, policySessionId, request);
	}

	async apply(operationId: string): Promise<void> {
		const operation = this.operations.get(operationId);
		if (!operation) {
			throw new Error(localize('copilot.customizationInstallation.expired', "This customization installation review expired. Start the operation again."));
		}
		if (operation.client !== await this.getClient()) {
			this.operations.deleteAndDispose(operationId);
			throw new Error(localize('copilot.customizationInstallation.runtimeChanged', "The customization runtime restarted. Start the operation again."));
		}
		operation.approved = true;
		try {
			const result = await operation.apply();
			this.assertApplied(result, operation.review.action);
		} finally {
			this.operations.deleteAndDispose(operationId);
		}
	}

	private async prepareInstall(client: ICopilotCustomizationInstallationClient, policySessionId: string, request: IAgentCustomizationInstallationRequest): Promise<IAgentCustomizationInstallationReview> {
		if (request.installation.kind !== 'skill' && request.installation.kind !== 'mcp') {
			throw new Error(localize('copilot.customizationInstallation.unsupported', "This customization does not provide an SDK installation identity."));
		}
		let retained = request.selectionId ? this.catalogSelections.deleteAndLeak(request.selectionId) : undefined;
		if (request.selectionId && (!retained || retained.client !== client || retained.policySessionId !== policySessionId)) {
			retained?.dispose();
			retained = undefined;
		}
		let candidate: InstallableCatalogCandidate;
		let searchId: string;
		if (retained) {
			candidate = retained.candidate;
			searchId = retained.searchId;
		} else {
			if (!request.itemUrl) {
				throw new Error(localize('copilot.customizationInstallation.unsupported', "This customization does not provide an SDK installation identity."));
			}
			const search = await client.rpc.catalog.search({
				contract: {
					protocolVersion: 3,
					requiredCapabilities: catalogSearchCapabilities,
				},
				policySessionId,
				query: request.displayName,
				limit: 50,
				kinds: [request.installation.kind === 'skill' ? 'ai-skill' : 'mcp-server'],
			});
			if (search.kind !== 'succeeded') {
				throw new Error(search.message);
			}
			const matched = search.candidates.find(candidate =>
				candidate.kind === (request.installation.kind === 'skill' ? 'ai-skill' : 'mcp-server')
				&& candidate.source.kind === 'url'
				&& candidate.source.url === request.itemUrl
			);
			if (!matched || matched.kind === 'plugin') {
				throw new Error(localize('copilot.customizationInstallation.catalogChanged', "The SDK catalog no longer contains this exact customization. Refresh Discover and try again."));
			}
			candidate = matched;
			searchId = search.searchId;
		}
		if (candidate.kind !== (request.installation.kind === 'skill' ? 'ai-skill' : 'mcp-server')) {
			retained?.dispose();
			throw new Error(localize('copilot.customizationInstallation.catalogChanged', "The SDK catalog no longer contains this exact customization. Refresh Discover and try again."));
		}
		try {
			return await this.prepareCandidateInstall(client, policySessionId, request, candidate, searchId);
		} finally {
			retained?.dispose();
		}
	}

	private async prepareCandidateInstall(client: ICopilotCustomizationInstallationClient, policySessionId: string, request: IAgentCustomizationInstallationRequest, candidate: InstallableCatalogCandidate, searchId: string): Promise<IAgentCustomizationInstallationReview> {
		if (candidate.kind === 'ai-skill') {
			if (candidate.installability !== 'installable') {
				throw new Error(localize('copilot.customizationInstallation.skillUnavailable', "The SDK cannot install this skill in the selected session."));
			}
			const result = await client.rpc.skills.planInstall({
				contract: skillInstallationContract,
				candidateHandle: candidate.handle,
				policySessionId,
			});
			if (result.kind !== 'outcome' || result.outcome.kind !== 'install-planned') {
				throw this.resultError(result, localize('copilot.customizationInstallation.skillPlanFailed', "The SDK could not prepare this skill installation."));
			}
			const plan = result.outcome.plan;
			if (request.version !== undefined && plan.review.catalogue.version !== request.version) {
				throw new Error(localize('copilot.customizationInstallation.catalogVersionChanged', "The SDK catalog version changed after discovery. Refresh Discover and try again."));
			}
			const review = this.toSkillReview(generateUuid(), 'install', plan.review);
			this.addOperation(new PendingCustomizationInstallation(
				review.operationId,
				client,
				plan.operationId,
				policySessionId,
				review,
				confirmation => confirmation.review.resource === 'skill'
					&& confirmation.review.review.action === 'install'
					&& Date.parse(confirmation.expiresAt) === Date.parse(plan.expiresAt)
					&& structuralEquals(confirmation.review.review, plan.review),
				() => client.rpc.skills.applyInstall({ contract: skillInstallationContract, planHandle: plan.planHandle, policySessionId }),
				Date.parse(plan.expiresAt),
				() => this.operations.deleteAndDispose(review.operationId),
			));
			return review;
		}

		if (candidate.installability !== 'installable' || candidate.source.kind !== 'url') {
			throw new Error(localize('copilot.customizationInstallation.mcpUnavailable', "The SDK cannot install this MCP server in the selected session."));
		}
		if (request.itemUrl !== candidate.source.url
			|| request.displayName !== candidate.displayName
			|| request.description !== (candidate.description ?? '')
		) {
			throw new Error(localize('copilot.customizationInstallation.catalogChanged', "The SDK catalog no longer contains this exact customization. Refresh Discover and try again."));
		}
		const planned = await client.rpc.mcp.planInstall({
			contract: {
				...catalogContract,
				requiredCapabilities: [...catalogContract.requiredCapabilities, 'mcp-install-planning', 'multiple-transport-choice'],
			},
			policySessionId,
			scope: 'user',
			source: { kind: 'candidate', candidateHandle: candidate.handle, searchId },
		});
		if (planned.kind !== 'planned') {
			throw this.resultError(planned, localize('copilot.customizationInstallation.mcpPlanFailed', "The SDK could not prepare this MCP server installation."));
		}
		const recommended = planned.plan.recommendedTransportChoiceId
			? planned.plan.transportChoices.find(choice => choice.choiceId === planned.plan.recommendedTransportChoiceId)
			: undefined;
		const choice = [recommended, ...planned.plan.transportChoices].find(choice =>
			choice?.installMethod === 'remote' && choice.secretPlaceholders.length === 0
		);
		if (!choice || choice.installMethod !== 'remote') {
			throw new Error(localize('copilot.customizationInstallation.mcpInputsRequired', "This MCP server requires an installation choice or additional values that Discover cannot collect yet."));
		}
		const prepared = await client.rpc.mcp.prepareInstall({
			contract: mcpInstallationContract,
			policySessionId,
			planHandle: planned.plan.planHandle,
			choiceId: choice.choiceId,
			source: { kind: 'url', mediaType: candidate.mediaType, url: candidate.source.url },
			inputs: [],
			secrets: [],
			secretStorage: 'keychain',
		});
		if (prepared.kind !== 'outcome' || prepared.outcome.kind !== 'install-prepared') {
			throw this.resultError(prepared, localize('copilot.customizationInstallation.mcpPrepareFailed', "The SDK could not prepare this MCP server installation."));
		}
		const configuration = planned.plan.configurationChanges[planned.plan.transportChoices.indexOf(choice)];
		const operation = prepared.outcome.operation;
		const operationId = generateUuid();
		const review: IAgentCustomizationInstallationReview = {
			operationId,
			action: 'install',
			kind: 'mcp',
			displayName: request.displayName,
			serverName: planned.plan.identity.serverName,
			target: planned.plan.target.configKey,
			endpoint: choice.endpoint,
			configurationFields: configuration?.changedFields ?? [],
		};
		this.addOperation(new PendingCustomizationInstallation(
			operationId,
			client,
			operation.operationId,
			policySessionId,
			review,
			confirmation => confirmation.review.resource === 'mcp'
				&& confirmation.review.review.action === 'install'
				&& Date.parse(confirmation.expiresAt) === operation.expiresAtEpochMs
				&& structuralEquals(confirmation.review.review.identity, planned.plan.identity)
				&& structuralEquals(confirmation.review.review.provenance, planned.plan.provenance)
				&& structuralEquals(confirmation.review.review.catalogueTrust, candidate.trust)
				&& isMatchingCandidateCatalogue(confirmation.review.review.catalogue, candidate)
				&& structuralEquals(confirmation.review.review.target, planned.plan.target)
				&& structuralEquals(confirmation.review.review.policy, planned.plan.policy)
				&& structuralEquals(confirmation.review.review.selectedChoice, choice)
				&& structuralEquals(confirmation.review.review.configurationChange, configuration)
				&& confirmation.review.review.inputs.length === 0
				&& confirmation.review.review.suppliedSecrets.length === 0
				&& confirmation.review.review.secretStorage === 'keychain'
				&& confirmation.review.review.target.scope === 'user'
				&& confirmation.review.review.policy.decision !== 'blocked'
				&& isMatchingEffectiveMcpConfiguration(confirmation.review.review.effectiveConfiguration, choice, configuration),
			() => client.rpc.mcp.applyInstall({ contract: mcpInstallationContract, operationId: operation.operationId, policySessionId }),
			operation.expiresAtEpochMs,
			() => this.operations.deleteAndDispose(operationId),
		));
		return review;
	}

	private async prepareUninstall(client: ICopilotCustomizationInstallationClient, policySessionId: string, installationId: string): Promise<IAgentCustomizationInstallationReview> {
		const inventory = await this.listWithClient(client, policySessionId);
		const installation = inventory.find(candidate => candidate.installationId === installationId);
		if (!installation) {
			throw new Error(localize('copilot.customizationInstallation.notFound', "The SDK no longer owns this customization installation."));
		}
		if (installation.kind === 'skill') {
			const result = await client.rpc.skills.planUninstall({ contract: skillInstallationContract, installationId, policySessionId });
			if (result.kind !== 'outcome' || result.outcome.kind !== 'uninstall-planned') {
				throw this.resultError(result, localize('copilot.customizationInstallation.skillUninstallPlanFailed', "The SDK could not prepare this skill removal."));
			}
			const plan = result.outcome.plan;
			const review = this.toSkillReview(generateUuid(), 'uninstall', plan.review);
			this.addOperation(new PendingCustomizationInstallation(
				review.operationId,
				client,
				plan.operationId,
				policySessionId,
				review,
				confirmation => confirmation.review.resource === 'skill'
					&& confirmation.review.review.action === 'uninstall'
					&& Date.parse(confirmation.expiresAt) === Date.parse(plan.expiresAt)
					&& structuralEquals(confirmation.review.review, plan.review),
				() => client.rpc.skills.applyUninstall({ contract: skillInstallationContract, planHandle: plan.planHandle, policySessionId }),
				Date.parse(plan.expiresAt),
				() => this.operations.deleteAndDispose(review.operationId),
			));
			return review;
		}

		const result = await client.rpc.mcp.planUninstall({ contract: mcpInstallationContract, installationId, policySessionId });
		if (result.kind !== 'outcome' || result.outcome.kind !== 'uninstall-planned') {
			throw this.resultError(result, localize('copilot.customizationInstallation.mcpUninstallPlanFailed', "The SDK could not prepare this MCP server removal."));
		}
		const plan = result.outcome.plan;
		const operationId = generateUuid();
		const review: IAgentCustomizationInstallationReview = {
			operationId,
			action: 'uninstall',
			kind: 'mcp',
			displayName: plan.installation.catalogue?.displayName ?? plan.installation.identity.canonicalName,
			serverName: plan.installation.identity.serverName,
			target: plan.installation.identity.serverName,
			configurationFields: [],
			restoresPreviousConfiguration: plan.restoresPreviousConfiguration,
			preservesSharedAuthentication: plan.preservesSharedAuthentication,
		};
		this.addOperation(new PendingCustomizationInstallation(
			operationId,
			client,
			plan.operationId,
			policySessionId,
			review,
			confirmation => confirmation.review.resource === 'mcp'
				&& confirmation.review.review.action === 'uninstall'
				&& Date.parse(confirmation.expiresAt) === plan.expiresAtEpochMs
				&& confirmation.review.review.installationId === installationId
				&& structuralEquals(confirmation.review.review.identity, plan.installation.identity)
				&& confirmation.review.review.target.scope === 'user'
				&& confirmation.review.review.target.configKey === plan.installation.identity.serverName
				&& confirmation.review.review.policy.decision !== 'blocked'
				&& confirmation.review.review.provenance.mediaType === installation.mediaType
				&& isMatchingInstallationAuthority(
					confirmation.review.review.provenance.authority,
					plan.installation.identity.registryId,
					installation.catalogue?.source,
				)
				&& confirmation.review.review.restoresPreviousConfiguration === plan.restoresPreviousConfiguration
				&& confirmation.review.review.ownedSecretCount === plan.ownedSecretCount
				&& confirmation.review.review.preservesSharedAuthentication === plan.preservesSharedAuthentication,
			() => client.rpc.mcp.applyUninstall({ contract: mcpInstallationContract, planHandle: plan.planHandle, policySessionId }),
			plan.expiresAtEpochMs,
			() => this.operations.deleteAndDispose(operationId),
		));
		return review;
	}

	private getCatalogKinds(mediaType: string | undefined): readonly CatalogCandidateKind[] {
		switch (mediaType) {
			case undefined: return ['ai-skill', 'mcp-server'];
			case 'application/ai-skill': return ['ai-skill'];
			case 'application/mcp-server+json': return ['mcp-server'];
			case copilotPluginMediaType: return [];
			default: return [];
		}
	}

	private toCatalogKinds(kinds: readonly CatalogCandidateKind[]): [CatalogCandidateKind] | [CatalogCandidateKind, CatalogCandidateKind] {
		switch (kinds.length) {
			case 1: return [kinds[0]];
			default: return [kinds[0], kinds[1]];
		}
	}

	private retainCatalogCandidate(client: ICopilotCustomizationInstallationClient, policySessionId: string, searchId: string, candidate: InstallableCatalogCandidate): IAgentCustomizationMarketplaceSearchItem {
		const selectionId = generateUuid();
		const retained = new RetainedCatalogSelection(
			client,
			policySessionId,
			searchId,
			candidate,
			() => this.catalogSelections.deleteAndDispose(selectionId),
		);
		this.catalogSelections.set(selectionId, retained);
		this.trimRetainedCatalogEntries(this.catalogSelections);
		return {
			selectionId,
			kind: candidate.kind === 'ai-skill' ? 'skill' : 'mcp',
			displayName: candidate.displayName,
			description: candidate.description,
			publisher: candidate.publisher,
			itemUrl: candidate.source.kind === 'url' ? candidate.source.url : undefined,
			installable: true,
		};
	}

	private isInstallableCatalogCandidate(candidate: CatalogCandidate): candidate is InstallableCatalogCandidate {
		return candidate.kind !== 'plugin'
			&& candidate.installability === 'installable'
			&& (candidate.kind !== 'mcp-server' || candidate.source.kind === 'url');
	}

	private retainCatalogCursor(client: ICopilotCustomizationInstallationClient, policySessionId: string, query: string, limit: number, kinds: readonly CatalogCandidateKind[], token: string, page: number): string {
		const cursor = generateUuid();
		this.catalogCursors.set(cursor, new RetainedCatalogCursor(
			client,
			policySessionId,
			query,
			limit,
			kinds,
			token,
			page,
			() => this.catalogCursors.deleteAndDispose(cursor),
		));
		this.trimRetainedCatalogEntries(this.catalogCursors);
		return cursor;
	}

	private trimRetainedCatalogEntries<T extends Disposable>(entries: DisposableMap<string, T>): void {
		while (entries.size > maxRetainedCatalogEntries) {
			const oldest = entries.keys().next().value;
			if (oldest === undefined) {
				return;
			}
			entries.deleteAndDispose(oldest);
		}
	}

	private async listWithClient(client: ICopilotCustomizationInstallationClient, policySessionId: string): Promise<readonly IAgentCustomizationInstallation[]> {
		const [skills, mcp] = await Promise.all([
			client.rpc.skills.installations.list({ contract: skillInstallationContract, policySessionId }),
			client.rpc.mcp.installations.list({ contract: mcpInstallationContract, policySessionId }),
		]);
		return [...this.getSkillInstallations(skills), ...this.getMcpInstallations(mcp)];
	}

	private getSkillInstallations(result: Awaited<ReturnType<CopilotClient['rpc']['skills']['installations']['list']>>): readonly IAgentCustomizationInstallation[] {
		if (result.kind !== 'outcome' || result.outcome.kind !== 'listed' && result.outcome.kind !== 'recovered') {
			throw this.resultError(result, localize('copilot.customizationInstallation.skillInventoryFailed', "The SDK could not list installed skills."));
		}
		return result.outcome.installations.map(installation => {
			const portable: IPortableInstallationSummary = installation;
			return {
				installationId: portable.record?.installationId ?? portable.installationId,
				kind: 'skill',
				mediaType: portable.record?.mediaType ?? 'application/ai-skill',
				catalogue: this.toCatalogue(portable.record?.catalogue ?? installation.catalogue),
				name: installation.name,
				targetUri: installation.target.diagnosticsAbsolutePath ? joinPath(URI.file(installation.target.diagnosticsAbsolutePath), 'SKILL.md') : undefined,
				state: installation.ownershipState === 'intact' ? 'installed' : 'missing',
			};
		});
	}

	private getMcpInstallations(result: Awaited<ReturnType<CopilotClient['rpc']['mcp']['installations']['list']>>): readonly IAgentCustomizationInstallation[] {
		if (result.kind !== 'outcome' || result.outcome.kind !== 'listed' && result.outcome.kind !== 'recovered') {
			throw this.resultError(result, localize('copilot.customizationInstallation.mcpInventoryFailed', "The SDK could not list installed MCP servers."));
		}
		return result.outcome.installations.map(installation => {
			const portable: IPortableInstallationSummary = installation;
			return {
				installationId: portable.record?.installationId ?? portable.installationId,
				kind: 'mcp',
				mediaType: portable.record?.mediaType ?? 'application/mcp-server+json',
				catalogue: this.toCatalogue(portable.record?.catalogue ?? installation.catalogue),
				serverName: installation.identity.serverName,
				state: installation.state === 'configuration-modified' || installation.state === 'recovery-required' ? 'missing' : 'installed',
			};
		});
	}

	private toCatalogue(catalogue: IInstallationCatalogueIdentity | undefined): IAgentCustomizationInstallationCatalogue | undefined {
		return catalogue ? {
			resourceId: catalogue.resourceId,
			itemUrl: catalogue.itemUrl,
			displayName: catalogue.displayName,
			description: catalogue.description,
			publisher: catalogue.publisher,
			version: catalogue.version,
			source: catalogue.source,
		} : undefined;
	}

	private toSkillReview(operationId: string, action: 'install' | 'uninstall', review: Extract<InstallationConfirmationRequest['review'], { readonly resource: 'skill' }>['review']): IAgentCustomizationInstallationReview {
		const install = review.action === 'install';
		return {
			operationId,
			action,
			kind: 'skill',
			displayName: install ? review.name : review.installation.catalogue.displayName,
			description: install ? review.description : review.installation.catalogue.description,
			source: install ? `${review.source.repository}@${review.source.revision}/${review.source.root}` : review.installation.catalogue.source,
			target: install ? review.target.relativePath : review.installation.target.relativePath,
			fileCount: review.files.length,
			totalBytes: review.totalBytes,
			...(install ? {} : { filesModified: review.filesModified }),
		};
	}

	private addOperation(operation: PendingCustomizationInstallation): void {
		if (!Number.isFinite(operation.expiresAt) || operation.expiresAt <= Date.now()) {
			operation.dispose();
			throw new Error(localize('copilot.customizationInstallation.invalidOperation', "The SDK returned an invalid customization installation operation."));
		}
		this.operations.set(operation.id, operation);
	}

	private getVisiblePolicySessionId(session: URI): string | undefined {
		const policySessionId = this.getPolicySessionId(session);
		if (policySessionId) {
			return policySessionId;
		}
		if (!this.createPolicySession) {
			throw new Error(localize('copilot.customizationInstallation.sessionRequired', "Start a Copilot agent session before managing SDK installations."));
		}
		return undefined;
	}

	private async getOrCreatePolicySessionId(client: ICopilotCustomizationInstallationClient): Promise<string> {
		let current = this.policySession;
		if (current?.client === client) {
			this.touchPolicySession(current);
			return current.sessionId;
		}
		if (current) {
			await this.releasePolicySession();
		}
		let creating = this.policySessionCreation;
		if (!creating) {
			const generation = ++this.policySessionGeneration;
			const sessionId = generateUuid();
			this.policySessionIds.add(sessionId);
			creating = this.createPolicySession!(client, sessionId).then(async created => {
				if (created.sessionId !== sessionId || generation !== this.policySessionGeneration) {
					try {
						await created.dispose();
					} finally {
						this.policySessionIds.delete(sessionId);
					}
					throw new Error(localize('copilot.customizationInstallation.runtimeChanged', "The customization runtime restarted. Start the operation again."));
				}
				this.policySession = created;
				return created;
			}, error => {
				this.policySessionIds.delete(sessionId);
				throw error;
			});
			this.policySessionCreation = creating;
			const clearCreation = () => {
				if (this.policySessionCreation === creating) {
					this.policySessionCreation = undefined;
				}
			};
			void creating.then(clearCreation, clearCreation);
		}
		current = await creating;
		if (current.client !== client) {
			await this.releasePolicySession();
			throw new Error(localize('copilot.customizationInstallation.runtimeChanged', "The customization runtime restarted. Start the operation again."));
		}
		this.touchPolicySession(current);
		return current.sessionId;
	}

	private touchPolicySession(session: ICopilotCustomizationPolicySession): void {
		this.policySessionIdle.value = disposableTimeout(() => void this.releasePolicySession(session.client), policySessionIdleTimeoutMs);
	}

	releasePolicySession(client?: ICopilotCustomizationInstallationClient): Promise<void> | undefined {
		const current = this.policySession;
		if ((!current || (client && current.client !== client)) && !this.policySessionCreation) {
			return undefined;
		}
		return this.releasePolicySessionWork(client);
	}

	private async releasePolicySessionWork(client?: ICopilotCustomizationInstallationClient): Promise<void> {
		const generation = ++this.policySessionGeneration;
		this.policySessionIdle.clear();
		const current = this.policySession;
		if (current && (!client || current.client === client)) {
			this.policySession = undefined;
			try {
				await current.dispose();
			} finally {
				this.policySessionIds.delete(current.sessionId);
			}
		}
		const creating = this.policySessionCreation;
		if (creating) {
			try {
				const created = await creating;
				if (generation === this.policySessionGeneration && (!client || created.client === client)) {
					this.policySession = undefined;
					try {
						await created.dispose();
					} finally {
						this.policySessionIds.delete(created.sessionId);
					}
				}
			} catch {
				// Creation owns and reports its failure.
			}
		}
	}

	isPolicySessionId(sessionId: string): boolean {
		return this.policySessionIds.has(sessionId);
	}

	private resultError(result: ISdkResult, fallback: string): Error {
		return new Error(result.message ?? fallback);
	}

	private assertApplied(result: ISdkResult, action: 'install' | 'uninstall'): void {
		if (result.kind !== 'outcome') {
			throw this.resultError(result, action === 'install'
				? localize('copilot.customizationInstallation.installFailed', "The SDK could not install this customization.")
				: localize('copilot.customizationInstallation.uninstallFailed', "The SDK could not remove this customization."));
		}
		const outcome = (result as { readonly kind: 'outcome'; readonly outcome: { readonly kind: string } }).outcome;
		if (outcome.kind !== (action === 'install' ? 'installed' : 'uninstalled')) {
			throw new Error(action === 'install'
				? localize('copilot.customizationInstallation.installNotCompleted', "The SDK did not complete this customization installation.")
				: localize('copilot.customizationInstallation.uninstallNotCompleted', "The SDK did not complete this customization removal."));
		}
	}

	override dispose(): void {
		void this.releasePolicySession();
		super.dispose();
	}

}

function isMatchingCandidateCatalogue(catalogue: IInstallationCatalogueIdentity | undefined, candidate: InstallableCatalogCandidate): boolean {
	return !!catalogue
		&& catalogue.displayName === candidate.displayName
		&& (catalogue.description ?? '') === (candidate.description ?? '')
		&& catalogue.publisher === candidate.publisher
		&& isMatchingCatalogueAuthority(candidate.provenance.authority, catalogue.source);
}

function isMatchingCatalogueAuthority(authority: string, source: string | undefined): boolean {
	if (!source) {
		return false;
	}
	if (source === authority) {
		return true;
	}
	try {
		const sourceUri = URI.parse(source);
		return (sourceUri.authority || sourceUri.path) === authority;
	} catch {
		return source === authority;
	}
}

function isMatchingInstallationAuthority(authority: string, registryId: string | undefined, source: string | undefined): boolean {
	const registryAuthority = /^urn:air:(?<authority>[a-z0-9.-]+):/.exec(registryId ?? '')?.groups?.authority;
	return registryAuthority ? authority === registryAuthority : isMatchingCatalogueAuthority(authority, source);
}

function isMatchingEffectiveMcpConfiguration(
	effective: { readonly transport: string; readonly url: string; readonly headers: Readonly<Record<string, string | undefined>>; readonly tools: readonly string[] } | undefined,
	choice: { readonly transport: string; readonly endpoint: string },
	configuration: { readonly changedFields: readonly string[] } | undefined,
): boolean {
	if (!effective || !configuration || effective.url !== choice.endpoint) {
		return false;
	}
	const transportMatches = effective.transport === choice.transport
		|| choice.transport === 'streamable-http' && effective.transport === 'http';
	if (!transportMatches) {
		return false;
	}
	const changedFields = new Set(configuration.changedFields);
	return changedFields.has('type')
		&& changedFields.has('url')
		&& changedFields.has('tools')
		&& (Object.keys(effective.headers).length === 0 || changedFields.has('headers'))
		&& structuralEquals(effective.tools, ['*']);
}
