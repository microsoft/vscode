/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, InstallationConfirmationHandler, InstallationConfirmationRequest } from '@github/copilot-sdk';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { Disposable, DisposableMap, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { stableStringify } from '../../../../../base/common/objects.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IAgentCustomizationInstallation, IAgentCustomizationInstallationApplyRequest, IAgentCustomizationInstallationAnswers, IAgentCustomizationInstallationApplyResult, IAgentCustomizationInstallationCatalogue, IAgentCustomizationInstallationChoice, IAgentCustomizationInstallationConfigurationRequest, IAgentCustomizationInstallationHandle, IAgentCustomizationInstallationPreparation, IAgentCustomizationInstallationRequest, IAgentCustomizationInstallationReview, IAgentCustomizationInstallationValuePrompt, IAgentCustomizationMarketplaceSearchItem, IAgentCustomizationMarketplaceSearchRequest, IAgentCustomizationMarketplaceSearchResult } from '../../../common/agent.js';
import { ICopilotMcpServerConfiguration, toCopilotMcpServerConfiguration } from '../../../../mcp/common/mcpCopilotConfiguration.js';
import { parseMcpGalleryServerConfiguration } from '../../../../mcp/common/mcpGalleryService.js';
import { IMcpServerArgument, IMcpServerPackage, IMcpServerVariableInput, RegistryType, RemoteTransport, TransportType } from '../../../../mcp/common/mcpManagement.js';
import { McpServerManifestParser } from '../../../../mcp/common/mcpManagementService.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../mcp/common/mcpPlatformTypes.js';
import { IRequestService, isSuccess, readBoundedResponse } from '../../../../request/common/request.js';
import { configuredNumberPattern, configuredVariableReferencePattern, maxConfiguredValueBytes } from '../../../common/customizationInstallationValues.js';

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
	'agent-plugin-discovery',
	'agent-plugin-formats',
	'agent-plugin-confirmed-installation',
];
const retainedCatalogLifetimeMs = 4 * 60_000;
const maxRetainedCatalogEntries = 1000;
const policySessionIdleTimeoutMs = 10 * 60_000;
const copilotPluginMediaType = 'application/vnd.github.copilot-plugin';
const mcpServerMediaType = 'application/mcp-server+json';
const configuredMcpInstallationPrefix = 'mcp-config:';

const skillInstallationContract = {
	...catalogContract,
	requiredCapabilities: [...catalogContract.requiredCapabilities, 'skill-confirmed-installation'],
};

const mcpInstallationContract = {
	...catalogContract,
	requiredCapabilities: [...catalogContract.requiredCapabilities, 'mcp-confirmed-remote-installation'],
};

const mcpConfiguredInstallationContract = {
	...catalogContract,
	requiredCapabilities: [...mcpInstallationContract.requiredCapabilities, 'mcp-configured-remote-installation'],
};

const maxConfiguredEntries = 128;
const maxConfiguredKeyBytes = 1024;
const installationSecretReferencePattern = /\$\{installation-secret:(?<id>[^}]*)\}/g;
const planSecretPlaceholderPattern = /^\$\{secret:(?<id>[^}]+)\}$/;
/** Configuration fields a host-written local package configuration may set. */
const localPackageFields: ReadonlySet<string> = new Set(['tools', 'type', 'command', 'args', 'env']);
/** Configuration fields a host-written remote configuration may set. */
const remoteFields: ReadonlySet<string> = new Set(['tools', 'type', 'url', 'headers']);

const pluginInstallationContract = {
	...catalogContract,
	requiredCapabilities: [...catalogContract.requiredCapabilities, 'agent-plugin-discovery', 'agent-plugin-confirmed-installation'],
};

function getCanvasCompatibilityTags(candidate: CatalogCandidate): readonly string[] {
	if (candidate.kind !== 'plugin') {
		return [];
	}
	return candidate.compatibilityTags?.filter(tag => tag === 'canvas' || tag === 'canvas-only') ?? [];
}

interface ISdkResult {
	readonly kind: string;
	readonly message?: string;
	readonly outcome?: {
		readonly kind: string;
		readonly reason?: unknown;
		readonly installation?: {
			readonly installationId?: string;
			readonly name?: string;
			readonly source?: {
				readonly repository?: string;
				readonly revision?: string;
				readonly root?: string;
			};
		};
	};
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
type InstallablePluginCatalogCandidate = Extract<CatalogCandidate, { readonly kind: 'plugin' }> & {
	readonly installability: 'installable';
	readonly handle: string;
	readonly handleExpiresAt: string;
};
type InstallableCatalogCandidate = Extract<CatalogCandidate, { readonly kind: 'ai-skill' | 'mcp-server' }> | InstallablePluginCatalogCandidate;
type CatalogCandidateKind = InstallableCatalogCandidate['kind'];
type McpPlanInstallSource = Parameters<CopilotClient['rpc']['mcp']['planInstall']>[0]['source'];
type McpServerCardReference = Parameters<CopilotClient['rpc']['mcp']['prepareInstall']>[0]['source'];

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
	/** Claimed by the first apply; later applies are refused rather than replayed. */
	applying = false;
	ownershipToken: string | undefined;

	constructor(
		readonly id: string,
		readonly client: ICopilotCustomizationInstallationClient,
		readonly sdkOperationId: string,
		/**
		 * The hidden policy session the SDK planned this operation in and must
		 * apply it in, or `undefined` for configuration-only operations that do
		 * not use a policy session.
		 */
		readonly policySessionId: string | undefined,
		readonly review: IAgentCustomizationInstallationReview,
		readonly validatesConfirmation: (request: InstallationConfirmationRequest) => boolean,
		readonly apply: () => Promise<ISdkResult | undefined>,
		readonly expiresAt: number,
		onExpire: () => void,
		/** Releases a runtime-prepared operation on its original SDK connection before effects start. */
		readonly cancelRuntimeOperation?: () => Promise<unknown>,
		/** Failures must be reported only from typed reasons because the operation holds submitted values. */
		readonly sensitive = false,
	) {
		super();
		this._register(disposableTimeout(onExpire, Math.max(0, expiresAt - Date.now())));
	}
}

type McpInstallPlanned = Extract<Awaited<ReturnType<CopilotClient['rpc']['mcp']['planInstall']>>, { readonly kind: 'planned' }>['plan'];
type McpTransportChoice = McpInstallPlanned['transportChoices'][number];
type McpConfigurationChange = McpInstallPlanned['configurationChanges'][number];

/**
 * A choice a configuration request offers. Catalog remote choices are prepared
 * and applied by the runtime; choices with a verified card package or remote
 * are configured by the host itself.
 */
interface IConfigurableMcpChoice {
	readonly choice: McpTransportChoice;
	readonly configuration: McpConfigurationChange;
	readonly serverPackage?: IMcpServerPackage;
	readonly serverRemote?: RemoteTransport;
}

/**
 * A localized installation failure built only from a bounded reason. Never
 * includes SDK text, submitted values or request content.
 */
class CustomizationInstallationFailure extends Error {
	constructor(readonly reason: string, message: string) {
		super(message);
		this.name = 'CustomizationInstallationFailure';
	}
}

/** A plan awaiting the caller's transport choice, values and secrets. */
class PendingCustomizationPreparation extends Disposable {
	constructor(
		readonly id: string,
		readonly ownershipToken: string,
		readonly client: ICopilotCustomizationInstallationClient,
		readonly policySessionId: string,
		readonly displayName: string,
		readonly plan: McpInstallPlanned,
		readonly card: McpServerCardReference,
		readonly candidate: InstallableCatalogCandidate | undefined,
		/** Offered choices, each with its configuration change. */
		readonly choices: ReadonlyMap<string, IConfigurableMcpChoice>,
		readonly expiresAt: number,
		onExpire: () => void,
	) {
		super();
		this._register(disposableTimeout(onExpire, Math.max(0, expiresAt - Date.now())));
	}
}


export class CopilotCustomizationInstallations extends Disposable {
	private readonly lifetimeToken = cancelOnDispose(this._store);
	private readonly operations = this._register(new DisposableMap<string, PendingCustomizationInstallation>());
	private readonly preparations = this._register(new DisposableMap<string, PendingCustomizationPreparation>());
	/** Distinguishes this host process's records from those of an earlier one. */
	readonly hostGeneration = generateUuid();
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

	/**
	 * @param createPolicySession Creates the hidden policy session that binds
	 * every SDK catalog, inventory, and installation request. The runtime admits
	 * these requests only when the policy session's GitHub credential was
	 * verified through `gitHubAuth.setCredentials`; a credential supplied at
	 * session creation is never verified. Chat sessions are only verified if a
	 * token change reaches them while live, so they are not guaranteed to have a
	 * verified credential and must not be used as the policy session.
	 */
	constructor(
		private readonly getClient: () => Promise<ICopilotCustomizationInstallationClient>,
		private readonly createPolicySession: (client: ICopilotCustomizationInstallationClient, sessionId: string) => Promise<ICopilotCustomizationPolicySession>,
		private readonly requestService?: IRequestService,
	) {
		super();
	}

	async search(request: IAgentCustomizationMarketplaceSearchRequest): Promise<IAgentCustomizationMarketplaceSearchResult> {
		if (request.feedId !== undefined) {
			return this.getSavedFeed(request.feedId);
		}
		if (!request.query.trim()) {
			return { kind: 'page', items: [] };
		}
		const client = await this.getClient();
		const policySessionId = await this.getOrCreatePolicySessionId(client);
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

	private async getSavedFeed(feedId: string): Promise<IAgentCustomizationMarketplaceSearchResult> {
		const client = await this.getClient();
		const policySessionId = await this.getOrCreatePolicySessionId(client);
		const result = await client.rpc.catalog.getSavedFeed({
			contract: {
				protocolVersion: 3,
				requiredCapabilities: [...catalogSearchCapabilities, 'catalog-feeds'],
			},
			policySessionId,
			feedId,
		});
		if (result.kind !== 'succeeded') {
			if (result.kind === 'negotiation-refused') {
				return { kind: 'unavailable', reason: 'unsupported' };
			}
			if (result.kind === 'authentication-required') {
				return { kind: 'unavailable', reason: 'authentication' };
			}
			throw new Error(result.message);
		}
		return {
			kind: 'page',
			items: result.entries.flatMap(entry => {
				if (entry.status !== 'available') {
					return [];
				}
				const candidate = entry.candidate;
				const kind = candidate.kind === 'plugin' ? 'plugin' : candidate.kind === 'ai-skill' ? 'skill' : 'mcp';
				const item: IAgentCustomizationMarketplaceSearchItem = this.isInstallableCatalogCandidate(candidate)
					? this.retainCatalogCandidate(client, policySessionId, result.searchId, candidate)
					: {
						selectionId: generateUuid(),
						kind,
						displayName: candidate.displayName,
						description: candidate.description,
						publisher: candidate.publisher,
						...(candidate.kind === 'plugin' ? {
							compatibilityTags: getCanvasCompatibilityTags(candidate),
							installCount: candidate.installCount,
						} : {}),
						installable: false,
						unavailableMessage: localize('copilot.customizationFeed.installUnavailable', "This customization cannot be installed in the selected session."),
					};
				return [{
					...item,
					identifier: entry.identifier,
					iconUrl: candidate.iconUrl,
					categories: candidate.categories,
				}];
			}),
		};
	}

	async list(): Promise<readonly IAgentCustomizationInstallation[]> {
		const client = await this.getClient();
		const policySessionId = await this.getOrCreatePolicySessionId(client);
		const [listedSkills, listedMcp, configured] = await Promise.all([
			client.rpc.skills.installations.list({ contract: skillInstallationContract, policySessionId }),
			client.rpc.mcp.installations.list({ contract: mcpInstallationContract, policySessionId }),
			client.rpc.mcp.config?.list?.() ?? Promise.resolve({ servers: {} }),
		]);
		// Reconcile durable SDK evidence at most once per kind; a repeated
		// `recovery-required` result surfaces as an inventory error.
		const [skills, mcp] = await Promise.all([
			isRecoveryRequired(listedSkills) ? client.rpc.skills.installations.recover({ contract: skillInstallationContract, policySessionId }) : listedSkills,
			isRecoveryRequired(listedMcp) ? client.rpc.mcp.installations.recover({ contract: mcpInstallationContract, policySessionId }) : listedMcp,
		]);
		const mcpInstallations = this.getMcpInstallations(mcp);
		return [
			...this.getSkillInstallations(skills),
			...mcpInstallations,
			...this.getConfiguredMcpInstallations(configured.servers, mcpInstallations),
		];
	}

	async recover(): Promise<readonly IAgentCustomizationInstallation[]> {
		const client = await this.getClient();
		const policySessionId = await this.getOrCreatePolicySessionId(client);
		const [skills, mcp, configured] = await Promise.all([
			client.rpc.skills.installations.recover({ contract: skillInstallationContract, policySessionId }),
			client.rpc.mcp.installations.recover({ contract: mcpInstallationContract, policySessionId }),
			client.rpc.mcp.config?.list?.() ?? Promise.resolve({ servers: {} }),
		]);
		const mcpInstallations = this.getMcpInstallations(mcp);
		return [
			...this.getSkillInstallations(skills),
			...mcpInstallations,
			...this.getConfiguredMcpInstallations(configured.servers, mcpInstallations),
		];
	}

	async addMcpServerConfiguration(name: string, config: IMcpServerConfiguration): Promise<void> {
		const client = await this.getClient();
		await client.rpc.mcp.config.add({ name, config: toCopilotMcpServerConfiguration(config) });
	}

	async prepare(request: IAgentCustomizationInstallationRequest | { readonly installationId: string }): Promise<IAgentCustomizationInstallationPreparation> {
		const client = await this.getClient();
		const policySessionId = await this.getOrCreatePolicySessionId(client);
		const ownershipToken = randomBytes(16).toString('base64url');
		const prepared = hasKey(request, { installationId: true })
			? await this.prepareUninstall(client, policySessionId, request.installationId)
			: await this.prepareInstall(client, policySessionId, request, ownershipToken);
		if (prepared.kind === 'configuration') {
			return prepared;
		}
		const operation = this.operations.get(prepared.operationId);
		if (!operation) {
			throw this.expiredError();
		}
		operation.ownershipToken = ownershipToken;
		return { kind: 'review', review: prepared, hostGeneration: this.hostGeneration, ownershipToken };
	}

	/**
	 * Applies an owned configuration request with the answers the user
	 * confirmed: the runtime prepares the operation with the submitted values and
	 * secrets, then it is applied immediately. Each request is applied at most
	 * once; a duplicate or ambiguous request is refused, never replayed.
	 */
	private async applyConfiguration(request: IAgentCustomizationInstallationApplyRequest, answers: IAgentCustomizationInstallationAnswers): Promise<IAgentCustomizationInstallationApplyResult | undefined> {
		const preparation = this.findOwned(this.preparations, request.operationId, request);
		if (!preparation) {
			throw this.expiredError();
		}
		const selected = preparation.choices.get(answers.choiceId);
		if (!selected) {
			throw new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.choiceUnavailable', "The selected installation choice is unavailable. Start the installation again."));
		}
		validateAnswers(selected.choice, answers);
		// Claim the request so a concurrent or repeated apply is refused.
		this.preparations.deleteAndLeak(preparation.id);
		try {
			await this.admitConfiguration(preparation);
			if (selected.serverPackage || selected.serverRemote) {
				return await this.applyHostConfiguration(preparation, selected, answers);
			}
			const operation = await this.prepareConfiguredInstall(preparation, selected, answers);
			return await this.apply({ hostGeneration: this.hostGeneration, ownershipToken: preparation.ownershipToken, operationId: operation.id });
		} finally {
			preparation.dispose();
		}
	}

	/**
	 * Admits a claimed configuration request before any value or secret leaves
	 * the host. Prompts can stay open long enough for the preparation to
	 * expire, the host to shut down, or the runtime client or hidden policy
	 * session to change after an authentication change.
	 */
	private async admitConfiguration(preparation: PendingCustomizationPreparation): Promise<void> {
		const client = await this.getClient();
		if (this._store.isDisposed) {
			throw toInstallationFailure('cancelled');
		}
		if (preparation.expiresAt <= Date.now()) {
			throw this.expiredError();
		}
		if (client !== preparation.client || preparation.policySessionId !== this.policySession?.sessionId) {
			throw new CustomizationInstallationFailure('foreign-runtime', localize('copilot.customizationInstallation.runtimeChanged', "The customization runtime restarted. Start the operation again."));
		}
	}

	/**
	 * Writes a configuration built from the verified card and the submitted
	 * values to the admitted client. The runtime cannot own these installs yet
	 * (local packages, and remotes from unbound direct-card plans), so this is
	 * an ordinary configured server, like the direct-card fallback. Secrets
	 * never take this path.
	 */
	private async applyHostConfiguration(preparation: PendingCustomizationPreparation, { choice, configuration, serverPackage, serverRemote }: IConfigurableMcpChoice, answers: IAgentCustomizationInstallationAnswers): Promise<undefined> {
		const config = serverPackage
			? toMcpPackageConfiguration(withMcpPackageValues(serverPackage, choice.requiredValues, answers.inputs))
			: toMcpRemoteConfiguration(serverRemote!, choice.requiredValues, answers.inputs);
		if (Object.keys(config).some(field => !configuration.changedFields.includes(field))) {
			throw new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.mcpConfigurationChanged', "The MCP server configuration does not match the installation plan. Refresh Browse and try again."));
		}
		try {
			await preparation.client.rpc.mcp.config.add({ name: preparation.plan.target.configKey, config });
		} catch {
			throw new CustomizationInstallationFailure('write-failed', localize('copilot.customizationInstallation.applyUncertain', "The installation result is unknown. Refresh the installed customizations before trying again."));
		}
		return undefined;
	}

	private async prepareConfiguredInstall(
		preparation: PendingCustomizationPreparation,
		{ choice, configuration }: IConfigurableMcpChoice,
		answers: IAgentCustomizationInstallationAnswers,
	): Promise<PendingCustomizationInstallation> {
		if (choice.installMethod !== 'remote') {
			throw new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.choiceUnavailable', "The selected installation choice is unavailable. Start the installation again."));
		}
		// The exact submitted list: sent once to the runtime and later matched against its confirmation.
		const inputs = answers.inputs.map(input => ({ category: input.category, key: input.key, value: input.value }));
		const client = preparation.client;
		let prepared: Awaited<ReturnType<CopilotClient['rpc']['mcp']['prepareInstall']>>;
		try {
			prepared = await client.rpc.mcp.prepareInstall({
				contract: mcpConfiguredInstallationContract,
				policySessionId: preparation.policySessionId,
				planHandle: preparation.plan.planHandle,
				choiceId: choice.choiceId,
				source: preparation.card,
				inputs,
				secrets: answers.secrets.map(secret => ({ placeholder: secret.placeholder, value: secret.value })),
				secretStorage: 'keychain',
			});
		} catch {
			throw new CustomizationInstallationFailure('write-failed', localize('copilot.customizationInstallation.continueFailed', "Could not prepare this MCP server installation. Start the installation again."));
		}
		if (prepared.kind !== 'outcome' || prepared.outcome.kind !== 'install-prepared') {
			throw toInstallationFailure(prepared.kind === 'outcome' && prepared.outcome.kind === 'refused' ? prepared.outcome.reason : prepared.kind === 'outcome' ? prepared.outcome.kind : prepared.kind);
		}
		const sdkOperation = prepared.outcome.operation;
		const cancelRuntimeOperation = () => client.rpc.mcp.installations.cancel({ contract: mcpConfiguredInstallationContract, operationId: sdkOperation.operationId });
		if (this._store.isDisposed) {
			await cancelRuntimeOperation().catch(() => undefined);
			throw toInstallationFailure('cancelled');
		}
		const suppliedSecrets = answers.secrets.map(secret => secret.placeholder);
		const plan = preparation.plan;
		const candidate = preparation.candidate;
		const operationId = generateUuid();
		const operation = new PendingCustomizationInstallation(
			operationId,
			client,
			sdkOperation.operationId,
			preparation.policySessionId,
			{
				operationId,
				action: 'install',
				kind: 'mcp',
				displayName: preparation.displayName,
				serverName: plan.identity.serverName,
				target: plan.target.configKey,
				endpoint: choice.endpoint,
				configurationFields: configuration.changedFields,
			},
			confirmation => confirmation.review.resource === 'mcp'
				&& confirmation.review.review.action === 'install'
				&& Date.parse(confirmation.expiresAt) === sdkOperation.expiresAtEpochMs
				&& structuralEquals(confirmation.review.review.identity, plan.identity)
				&& structuralEquals(confirmation.review.review.provenance, plan.provenance)
				&& (!candidate || structuralEquals(confirmation.review.review.catalogueTrust, candidate.trust)
					&& isMatchingCandidateCatalogue(confirmation.review.review.catalogue, candidate))
				&& structuralEquals(confirmation.review.review.target, plan.target)
				&& structuralEquals(confirmation.review.review.policy, plan.policy)
				&& structuralEquals(confirmation.review.review.selectedChoice, choice)
				&& structuralEquals(confirmation.review.review.configurationChange, configuration)
				&& structuralEquals(confirmation.review.review.inputs, inputs)
				&& structuralEquals(confirmation.review.review.suppliedSecrets, suppliedSecrets)
				&& confirmation.review.review.secretStorage === 'keychain'
				&& confirmation.review.review.target.scope === 'user'
				&& confirmation.review.review.policy.decision !== 'blocked'
				&& isMatchingConfiguredMcpConfiguration(confirmation.review.review.effectiveConfiguration, choice, configuration, suppliedSecrets),
			() => client.rpc.mcp.applyInstall({ contract: mcpConfiguredInstallationContract, operationId: sdkOperation.operationId, policySessionId: preparation.policySessionId }),
			sdkOperation.expiresAtEpochMs,
			() => this.expireOperation(operationId),
			cancelRuntimeOperation,
			true,
		);
		operation.ownershipToken = preparation.ownershipToken;
		try {
			this.addOperation(operation);
		} catch {
			await cancelRuntimeOperation().catch(() => undefined);
			throw new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.invalidOperation', "The customization service returned an invalid installation operation."));
		}
		return operation;
	}

	async apply(request: IAgentCustomizationInstallationApplyRequest): Promise<IAgentCustomizationInstallationApplyResult | undefined> {
		if (request.answers) {
			return this.applyConfiguration(request, request.answers);
		}
		const operation = this.findOwned(this.operations, request.operationId, request);
		if (!operation || operation.applying) {
			throw this.expiredError();
		}
		operation.applying = true;
		try {
			const client = await this.getClient();
			// Expiry or disposal can release the operation while the client starts.
			const expired = operation.expiresAt <= Date.now();
			if (expired || this.operations.get(operation.id) !== operation) {
				await operation.cancelRuntimeOperation?.().catch(() => undefined);
				throw expired ? this.expiredError() : toInstallationFailure('cancelled');
			}
			// A token change, telemetry revocation, or idle timeout deletes the hidden
			// policy session; the SDK cannot apply a plan bound to a deleted session.
			if (operation.client !== client || (operation.policySessionId !== undefined && operation.policySessionId !== this.policySession?.sessionId)) {
				await operation.cancelRuntimeOperation?.().catch(() => undefined);
				throw new CustomizationInstallationFailure('foreign-runtime', localize('copilot.customizationInstallation.runtimeChanged', "The customization runtime restarted. Start the operation again."));
			}
			operation.approved = true;
			let result: ISdkResult | undefined;
			try {
				result = await operation.apply();
			} catch (error) {
				if (operation.sensitive) {
					throw new CustomizationInstallationFailure('write-failed', localize('copilot.customizationInstallation.applyUncertain', "The installation result is unknown. Refresh the installed customizations before trying again."));
				}
				throw error;
			}
			if (result) {
				const outcome = this.assertApplied(result, operation.review.action, operation.sensitive);
				return this.toApplyResult(operation.review, outcome);
			}
			return undefined;
		} finally {
			this.removeOperation(operation);
		}
	}

	private findOwned<T extends { readonly ownershipToken: string | undefined }>(records: DisposableMap<string, T & IDisposable>, id: string, handle: IAgentCustomizationInstallationHandle): T | undefined {
		const record = records.get(id);
		if (!record || handle.hostGeneration !== this.hostGeneration || !record.ownershipToken) {
			return undefined;
		}
		const expected = Buffer.from(record.ownershipToken);
		const actual = Buffer.from(handle.ownershipToken);
		return expected.length === actual.length && timingSafeEqual(expected, actual) ? record : undefined;
	}

	private expireOperation(operationId: string): void {
		// Apply rechecks expiry after admission; once effects start the runtime enforces its own deadline.
		if (!this.operations.get(operationId)?.applying) {
			void this.releaseOperation(operationId);
		}
	}

	private async releaseOperation(operationId: string): Promise<void> {
		const operation = this.operations.get(operationId);
		if (!operation) {
			return;
		}
		this.removeOperation(operation);
		await operation.cancelRuntimeOperation?.().catch(() => undefined);
	}

	/** Forgets an operation, only if the record is still current. */
	private removeOperation(operation: PendingCustomizationInstallation): void {
		if (this.operations.get(operation.id) === operation) {
			this.operations.deleteAndDispose(operation.id);
		}
	}

	private expiredError(): Error {
		return new CustomizationInstallationFailure('plan-expired', localize('copilot.customizationInstallation.expired', "This customization installation review expired. Start the operation again."));
	}

	private async prepareInstall(client: ICopilotCustomizationInstallationClient, policySessionId: string, request: IAgentCustomizationInstallationRequest, ownershipToken: string): Promise<IAgentCustomizationInstallationReview | IAgentCustomizationInstallationConfigurationRequest> {
		if (request.installation.kind !== 'skill' && request.installation.kind !== 'mcp' && request.installation.kind !== 'plugin') {
			throw new Error(localize('copilot.customizationInstallation.unsupported', "This customization does not provide an installation identity."));
		}
		if (request.installation.kind === 'mcp' && request.installation.source) {
			const card = request.installation.source;
			return this.prepareMcpInstall(
				client,
				policySessionId,
				request,
				{ kind: 'card', card },
				card,
				ownershipToken,
			);
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
			if (request.installation.kind !== 'plugin' && !request.itemUrl) {
				throw new Error(localize('copilot.customizationInstallation.unsupported', "This customization does not provide an installation identity."));
			}
			const expectedKind = request.installation.kind === 'skill' ? 'ai-skill' : request.installation.kind === 'mcp' ? 'mcp-server' : 'plugin';
			const catalogIdentity = request.catalogIdentity ?? request.identifier;
			const search = await client.rpc.catalog.search({
				contract: {
					protocolVersion: 3,
					requiredCapabilities: catalogSearchCapabilities,
				},
				policySessionId,
				query: request.installation.kind === 'plugin' ? catalogIdentity : request.displayName,
				limit: 50,
				kinds: [expectedKind],
			});
			if (search.kind !== 'succeeded') {
				throw new Error(search.message);
			}
			const matched = search.candidates.find(candidate =>
				candidate.kind === expectedKind
				&& (candidate.kind === 'plugin'
					? candidate.identity === catalogIdentity
					: candidate.source.kind === 'url' && candidate.source.url === request.itemUrl)
			);
			if (!matched || !this.isInstallableCatalogCandidate(matched)) {
				throw new Error(localize('copilot.customizationInstallation.catalogChanged', "The catalog no longer contains this exact customization. Refresh Browse and try again."));
			}
			candidate = matched;
			searchId = search.searchId;
		}
		const expectedKind = request.installation.kind === 'skill' ? 'ai-skill' : request.installation.kind === 'mcp' ? 'mcp-server' : 'plugin';
		if (candidate.kind !== expectedKind) {
			retained?.dispose();
			throw new Error(localize('copilot.customizationInstallation.catalogChanged', "The catalog no longer contains this exact customization. Refresh Browse and try again."));
		}
		try {
			return await this.prepareCandidateInstall(client, policySessionId, request, candidate, searchId, ownershipToken);
		} finally {
			retained?.dispose();
		}
	}

	private async prepareCandidateInstall(client: ICopilotCustomizationInstallationClient, policySessionId: string, request: IAgentCustomizationInstallationRequest, candidate: InstallableCatalogCandidate, searchId: string, ownershipToken: string): Promise<IAgentCustomizationInstallationReview | IAgentCustomizationInstallationConfigurationRequest> {
		if (candidate.kind === 'plugin') {
			const plugins = client.rpc.plugins;
			if (!plugins) {
				throw new Error(localize('copilot.customizationInstallation.pluginUnsupported', "Catalog plugin installation is not supported."));
			}
			const result = await plugins.planInstall({
				contract: pluginInstallationContract,
				candidateHandle: candidate.handle,
				policySessionId,
			});
			if (result.kind !== 'outcome' || result.outcome.kind !== 'install-planned') {
				throw this.resultError(result, localize('copilot.customizationInstallation.pluginPlanFailed', "Could not prepare this plugin installation."));
			}
			const plan = result.outcome.plan;
			if (request.version !== undefined && plan.review.catalogue.version !== request.version) {
				throw new Error(localize('copilot.customizationInstallation.catalogVersionChanged', "The catalog version changed after discovery. Refresh Browse and try again."));
			}
			const review: IAgentCustomizationInstallationReview = {
				operationId: generateUuid(),
				action: 'install',
				kind: 'plugin',
				displayName: plan.review.name,
				description: plan.review.description,
				version: plan.review.version,
				source: `${plan.review.source.repository}@${plan.review.source.revision}${plan.review.source.root ? `/${plan.review.source.root}` : ''}`,
				target: plan.review.target.displayLabel,
				fileCount: plan.review.files.length,
				totalBytes: plan.review.totalBytes,
				installsDisabled: plan.review.installsDisabled,
				mcpServerCount: plan.review.mcpServers?.length ?? 0,
			};
			this.addOperation(new PendingCustomizationInstallation(
				review.operationId,
				client,
				plan.operationId,
				policySessionId,
				review,
				confirmation => confirmation.review.resource === 'plugin'
					&& confirmation.review.review.action === 'install'
					&& Date.parse(confirmation.expiresAt) === Date.parse(plan.expiresAt)
					&& structuralEquals(confirmation.review.review, plan.review),
				() => plugins.applyInstall({ contract: pluginInstallationContract, planHandle: plan.planHandle, policySessionId }),
				Date.parse(plan.expiresAt),
				() => this.expireOperation(review.operationId),
			));
			return review;
		}

		if (candidate.kind === 'ai-skill') {
			if (candidate.installability !== 'installable') {
				throw new Error(localize('copilot.customizationInstallation.skillUnavailable', "This skill cannot be installed in the selected session."));
			}
			const result = await client.rpc.skills.planInstall({
				contract: skillInstallationContract,
				candidateHandle: candidate.handle,
				policySessionId,
			});
			if (result.kind !== 'outcome' || result.outcome.kind !== 'install-planned') {
				throw this.resultError(result, localize('copilot.customizationInstallation.skillPlanFailed', "Could not prepare this skill installation."));
			}
			const plan = result.outcome.plan;
			if (request.version !== undefined && plan.review.catalogue.version !== request.version) {
				throw new Error(localize('copilot.customizationInstallation.catalogVersionChanged', "The catalog version changed after discovery. Refresh Browse and try again."));
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
				() => this.expireOperation(review.operationId),
			));
			return review;
		}

		if (candidate.installability !== 'installable' || candidate.source.kind !== 'url') {
			throw new Error(localize('copilot.customizationInstallation.mcpUnavailable', "This MCP server cannot be installed in the selected session."));
		}
		if (request.itemUrl !== candidate.source.url
			|| request.displayName !== candidate.displayName
			|| request.description !== (candidate.description ?? '')
		) {
			throw new Error(localize('copilot.customizationInstallation.catalogChanged', "The catalog no longer contains this exact customization. Refresh Browse and try again."));
		}
		return this.prepareMcpInstall(
			client,
			policySessionId,
			request,
			{ kind: 'candidate', candidateHandle: candidate.handle, searchId },
			{ kind: 'url', mediaType: candidate.mediaType, url: candidate.source.url },
			ownershipToken,
			candidate,
		);
	}

	private async prepareMcpInstall(
		client: ICopilotCustomizationInstallationClient,
		policySessionId: string,
		request: IAgentCustomizationInstallationRequest,
		source: McpPlanInstallSource,
		card: McpServerCardReference,
		ownershipToken: string,
		candidate?: InstallableCatalogCandidate,
	): Promise<IAgentCustomizationInstallationReview | IAgentCustomizationInstallationConfigurationRequest> {
		const planned = await client.rpc.mcp.planInstall({
			contract: {
				...catalogContract,
				requiredCapabilities: [
					...catalogContract.requiredCapabilities.filter(capability => source.kind === 'candidate' || capability !== 'catalog-search-session-bound'),
					'mcp-install-planning',
					'multiple-transport-choice',
				],
			},
			...(source.kind === 'candidate' ? { policySessionId } : {}),
			scope: 'user',
			source,
		});
		if (planned.kind !== 'planned') {
			throw this.resultError(planned, localize('copilot.customizationInstallation.mcpPlanFailed', "Could not prepare this MCP server installation."));
		}
		const recommended = planned.plan.recommendedTransportChoiceId
			? planned.plan.transportChoices.find(choice => choice.choiceId === planned.plan.recommendedTransportChoiceId)
			: undefined;
		const choices = [...new Set([recommended, ...planned.plan.transportChoices])].filter(choice => choice !== undefined);
		const isInputFree = (choice: McpTransportChoice) => choice.requiredValues.length === 0 && choice.secretPlaceholders.length === 0;
		const choice = choices.find(choice => choice.installMethod === 'remote' && isInputFree(choice))
			?? (source.kind === 'card' ? choices.find(choice => choice.installMethod === 'package' && isInputFree(choice)) : undefined);
		// Runtimes without configured installation keep today's default-only path for catalog choices.
		const defaultOnlyRemote = source.kind === 'candidate'
			? choices.find(choice => choice.installMethod === 'remote' && choice.secretPlaceholders.length === 0)
			: undefined;
		if (!choice && planned.plan.policy.decision !== 'blocked') {
			// Configured preparation consumes a bound plan; direct-card plans are unbound, so the runtime would refuse them after prompting.
			const configurable = source.kind === 'candidate' ? choices.filter(isConfigurableRemoteChoice) : [];
			if (configurable.length && await this.supportsConfiguredInstallation(client, policySessionId)) {
				return this.requestMcpConfiguration(client, policySessionId, request, planned.plan, card, configurable.map(choice => ({ choice })), ownershipToken, candidate);
			}
			// The host configures local packages from catalog entries and direct cards alike, and remotes with non-secret values from
			// direct cards, preferred over a remote default-only choice that would still need values.
			if (!defaultOnlyRemote?.requiredValues.every(value => !value.required || value.defaultValue !== undefined)) {
				const inputFreePackage = choices.find(choice => choice.installMethod === 'package' && isInputFree(choice));
				if (inputFreePackage) {
					const configuration = planned.plan.configurationChanges[planned.plan.transportChoices.indexOf(inputFreePackage)];
					return this.prepareMcpCardConfiguration(client, request, card, planned.plan, inputFreePackage, configuration, source.kind === 'candidate' ? policySessionId : undefined);
				}
				const remotes = source.kind === 'card' ? choices.filter(isConfigurableRemoteChoice).filter(choice => choice.secretPlaceholders.length === 0) : [];
				const packages = choices.filter(isConfigurablePackageChoice);
				if (remotes.length || packages.length) {
					const server = await this.fetchMcpCardServer(card, planned.plan);
					return this.requestMcpConfiguration(client, policySessionId, request, planned.plan, card, [
						...remotes.map(choice => ({ choice, serverRemote: findMcpRemote(server, planned.plan, choice) })),
						...packages.map(choice => ({ choice, serverPackage: findMcpPackage(server, planned.plan, choice) })),
					], ownershipToken, candidate);
				}
			}
		}
		const selected = choice ?? defaultOnlyRemote;
		if (!selected) {
			throw new Error(localize('copilot.customizationInstallation.mcpInputsRequired', "This MCP server requires an installation choice or additional values that Browse cannot collect yet."));
		}
		const configuration = planned.plan.configurationChanges[planned.plan.transportChoices.indexOf(selected)];
		if (source.kind === 'card') {
			return this.prepareMcpCardConfiguration(client, request, card, planned.plan, selected, configuration, undefined);
		}
		if (selected.installMethod !== 'remote') {
			throw new Error(localize('copilot.customizationInstallation.mcpPackageUnsupported', "Confirmed local MCP server installations are not supported."));
		}
		const prepared = await client.rpc.mcp.prepareInstall({
			contract: mcpInstallationContract,
			policySessionId,
			planHandle: planned.plan.planHandle,
			choiceId: selected.choiceId,
			source: card,
			inputs: [],
			secrets: [],
			secretStorage: 'keychain',
		});
		if (prepared.kind !== 'outcome' || prepared.outcome.kind !== 'install-prepared') {
			throw this.resultError(prepared, localize('copilot.customizationInstallation.mcpPrepareFailed', "Could not prepare this MCP server installation."));
		}
		const operation = prepared.outcome.operation;
		const operationId = generateUuid();
		const review: IAgentCustomizationInstallationReview = {
			operationId,
			action: 'install',
			kind: 'mcp',
			displayName: request.displayName,
			serverName: planned.plan.identity.serverName,
			target: planned.plan.target.configKey,
			endpoint: selected.endpoint,
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
				&& (!candidate || structuralEquals(confirmation.review.review.catalogueTrust, candidate.trust)
					&& isMatchingCandidateCatalogue(confirmation.review.review.catalogue, candidate))
				&& structuralEquals(confirmation.review.review.target, planned.plan.target)
				&& structuralEquals(confirmation.review.review.policy, planned.plan.policy)
				&& structuralEquals(confirmation.review.review.selectedChoice, selected)
				&& structuralEquals(confirmation.review.review.configurationChange, configuration)
				&& confirmation.review.review.inputs.length === 0
				&& confirmation.review.review.suppliedSecrets.length === 0
				&& confirmation.review.review.secretStorage === 'keychain'
				&& confirmation.review.review.target.scope === 'user'
				&& confirmation.review.review.policy.decision !== 'blocked'
				&& isMatchingEffectiveMcpConfiguration(confirmation.review.review.effectiveConfiguration, selected, configuration),
			() => client.rpc.mcp.applyInstall({ contract: mcpInstallationContract, operationId: operation.operationId, policySessionId }),
			operation.expiresAtEpochMs,
			() => this.expireOperation(operationId),
			() => client.rpc.mcp.installations.cancel({ contract: mcpInstallationContract, operationId: operation.operationId }),
		));
		return review;
	}

	/** Whether the runtime grants configured remote installation, probed with a read-only inventory request. */
	private async supportsConfiguredInstallation(client: ICopilotCustomizationInstallationClient, policySessionId: string): Promise<boolean> {
		try {
			const result = await client.rpc.mcp.installations.list({ contract: mcpConfiguredInstallationContract, policySessionId });
			return result.kind === 'outcome' && result.negotiated.grantedCapabilities.includes('mcp-configured-remote-installation');
		} catch {
			return false;
		}
	}

	private requestMcpConfiguration(
		client: ICopilotCustomizationInstallationClient,
		policySessionId: string,
		request: IAgentCustomizationInstallationRequest,
		plan: McpInstallPlanned,
		card: McpServerCardReference,
		configurable: readonly { readonly choice: McpTransportChoice; readonly serverPackage?: IMcpServerPackage; readonly serverRemote?: RemoteTransport }[],
		ownershipToken: string,
		candidate: InstallableCatalogCandidate | undefined,
	): IAgentCustomizationInstallationConfigurationRequest {
		const choices = new Map<string, IConfigurableMcpChoice & { readonly preview?: IMcpPackagePreview }>();
		for (const { choice, serverPackage, serverRemote } of configurable) {
			const configuration = plan.configurationChanges[plan.transportChoices.indexOf(choice)];
			const preview = serverPackage && describeMcpPackage(serverPackage);
			const hostFields = serverPackage ? localPackageFields : serverRemote ? remoteFields : undefined;
			if (configuration && configuration.operation === 'add' && configuration.scope === 'user' && configuration.configKey === plan.target.configKey
				&& (!serverPackage || preview !== undefined)
				&& (!hostFields || configuration.secretReferences.length === 0 && configuration.changedFields.every(field => hostFields.has(field)))
			) {
				choices.set(choice.choiceId, { choice, configuration, serverPackage, serverRemote, preview });
			}
		}
		const expiresAt = Date.parse(plan.planHandleExpiresAt);
		if (!choices.size || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
			throw new Error(localize('copilot.customizationInstallation.mcpInputsRequired', "This MCP server requires an installation choice or additional values that Browse cannot collect yet."));
		}
		const preparationId = generateUuid();
		this.preparations.set(preparationId, new PendingCustomizationPreparation(
			preparationId,
			ownershipToken,
			client,
			policySessionId,
			request.displayName,
			plan,
			card,
			candidate,
			choices,
			expiresAt,
			() => this.preparations.deleteAndDispose(preparationId),
		));
		return {
			kind: 'configuration',
			operationId: preparationId,
			hostGeneration: this.hostGeneration,
			ownershipToken,
			displayName: request.displayName,
			serverName: plan.identity.serverName,
			target: plan.target.configKey,
			recommendedChoiceId: plan.recommendedTransportChoiceId && choices.has(plan.recommendedTransportChoiceId) ? plan.recommendedTransportChoiceId : undefined,
			choices: [...choices.values()].map(({ choice, configuration, preview, serverPackage, serverRemote }): IAgentCustomizationInstallationChoice => {
				// Values inside a host-written template can't be left out, so the prompt must not offer to skip them.
				const templateKeys = mcpTemplateValueKeys(serverPackage, serverRemote);
				return {
					choiceId: choice.choiceId,
					transport: choice.transport,
					...(choice.installMethod === 'remote' ? { endpointSummary: choice.endpoint } : {}),
					...(preview ? { command: preview.command, ...(preview.env ? { env: preview.env } : {}) } : {}),
					configurationFields: configuration.changedFields,
					values: choice.requiredValues.map((value): IAgentCustomizationInstallationValuePrompt => ({
						key: value.key,
						category: value.category,
						valueType: value.valueType,
						required: value.required || (value.defaultValue === undefined && templateKeys.has(`${value.category}\0${value.key}`)),
						isRepeated: value.isRepeated,
						...(value.defaultValue !== undefined ? { defaultValue: value.defaultValue } : {}),
						...(value.title !== undefined ? { title: value.title } : {}),
						...(value.description !== undefined ? { description: value.description } : {}),
						...(value.kind === 'enum' ? { enumValues: [...value.enumValues] } : {}),
					})),
					secrets: choice.secretPlaceholders.map(secret => ({
						key: secret.key,
						placeholder: secret.placeholder,
						...(secret.title !== undefined ? { title: secret.title } : {}),
					})),
				};
			}),
		};
	}

	/**
	 * Provisional direct-card fallback until https://github.com/github/copilot-agent-runtime/issues/26495 is available.
	 * @param policySessionId The policy session a catalog plan is bound to, so apply refuses a released or replaced session.
	 */
	private async prepareMcpCardConfiguration(
		client: ICopilotCustomizationInstallationClient,
		request: IAgentCustomizationInstallationRequest,
		card: McpServerCardReference,
		plan: Extract<Awaited<ReturnType<CopilotClient['rpc']['mcp']['planInstall']>>, { readonly kind: 'planned' }>['plan'],
		choice: typeof plan.transportChoices[number],
		configuration: typeof plan.configurationChanges[number] | undefined,
		policySessionId: string | undefined,
	): Promise<IAgentCustomizationInstallationReview> {
		const supportedFields = choice.installMethod === 'package' ? localPackageFields : new Set(['tools', 'type', 'url']);
		if (plan.policy.decision === 'blocked') {
			throw new Error(plan.policy.reason ?? localize('copilot.customizationInstallation.mcpPolicyBlocked', "Policy blocked this MCP server installation."));
		}
		if (choice.requiredValues.length > 0
			|| choice.secretPlaceholders.length > 0
			|| !configuration
			|| configuration.operation !== 'add'
			|| configuration.scope !== 'user'
			|| plan.target.scope !== 'user'
			|| configuration.configKey !== plan.target.configKey
			|| configuration.secretReferences.length > 0
			|| configuration.changedFields.some(field => !supportedFields.has(field))
		) {
			throw new Error(localize('copilot.customizationInstallation.mcpProvisionalUnsupported', "This MCP server requires configuration that provisional Gallery installation cannot preserve."));
		}
		const config: ICopilotMcpServerConfiguration = choice.installMethod === 'package'
			? await this.resolveMcpPackageConfiguration(card, plan, choice)
			: {
				type: choice.transport === 'sse' ? 'sse' : 'http',
				url: choice.endpoint,
				tools: ['*'],
			};
		if (!structuralEquals(Object.keys(config).sort(), [...configuration.changedFields].sort())) {
			throw new Error(localize('copilot.customizationInstallation.mcpConfigurationChanged', "The MCP server configuration does not match the installation plan. Refresh Browse and try again."));
		}
		const operationId = generateUuid();
		const review: IAgentCustomizationInstallationReview = {
			operationId,
			action: 'install',
			kind: 'mcp',
			displayName: request.displayName,
			serverName: plan.identity.serverName,
			target: plan.target.configKey,
			...(choice.installMethod === 'remote' ? { endpoint: choice.endpoint } : {}),
			...(config.type === 'stdio' ? { command: config.command, args: config.args, env: config.env } : {}),
			configurationFields: configuration.changedFields,
		};
		const expiresAt = Date.parse(plan.planHandleExpiresAt);
		this.addOperation(new PendingCustomizationInstallation(
			operationId,
			client,
			generateUuid(),
			policySessionId,
			review,
			() => false,
			async () => {
				await client.rpc.mcp.config.add({
					name: plan.target.configKey,
					config,
				});
				return undefined;
			},
			expiresAt,
			() => this.expireOperation(operationId),
		));
		return review;
	}

	private async resolveMcpPackageConfiguration(
		card: McpServerCardReference,
		plan: McpInstallPlanned,
		choice: Extract<McpTransportChoice, { readonly installMethod: 'package' }>,
	): Promise<ICopilotMcpServerConfiguration> {
		return toMcpPackageConfiguration(findMcpPackage(await this.fetchMcpCardServer(card, plan), plan, choice));
	}

	/** Fetches the plan's card and verifies it against the plan's digest. */
	private async fetchMcpCardServer(card: McpServerCardReference, plan: McpInstallPlanned): Promise<ReturnType<typeof parseMcpGalleryServerConfiguration>> {
		if (card.kind !== 'url' || !this.requestService) {
			throw new Error(localize('copilot.customizationInstallation.mcpCardUnavailable', "The MCP server card is unavailable for local configuration."));
		}
		const context = await this.requestService.request({
			type: 'GET',
			url: card.url,
			followRedirects: 0,
			timeout: 30_000,
			logUrl: false,
			callSite: 'copilotCustomizationInstallations.resolveMcpPackageConfiguration',
		}, this.lifetimeToken);
		let data: unknown;
		try {
			if (!isSuccess(context)) {
				throw new Error(localize('copilot.customizationInstallation.mcpCardFetchFailed', "Could not read the MCP server card (HTTP {0}).", context.res.statusCode));
			}
			const text = await raceCancellationError(readBoundedResponse(context, 5 * 1024 * 1024,
				() => new Error(localize('copilot.customizationInstallation.mcpCardTooLarge', "The MCP server card is too large to install."))), this.lifetimeToken);
			try {
				data = JSON.parse(text);
			} catch {
				throw new Error(localize('copilot.customizationInstallation.mcpCardInvalid', "The MCP server card contains invalid JSON."));
			}
		} finally {
			context.stream.destroy();
		}
		const digest = createHash('sha256').update(stableStringify(data)).digest('hex');
		if (plan.provenance.cardDigest.algorithm !== 'sha256-rfc8785' || digest !== plan.provenance.cardDigest.value) {
			throw new Error(localize('copilot.customizationInstallation.mcpCardChanged', "The MCP server card changed after installation review. Refresh Browse and try again."));
		}
		return parseMcpGalleryServerConfiguration(data);
	}

	private async prepareUninstall(client: ICopilotCustomizationInstallationClient, policySessionId: string, installationId: string): Promise<IAgentCustomizationInstallationReview> {
		if (installationId.startsWith(configuredMcpInstallationPrefix)) {
			const serverName = decodeURIComponent(installationId.slice(configuredMcpInstallationPrefix.length));
			const configured = await client.rpc.mcp.config.list();
			if (!Object.hasOwn(configured.servers, serverName)) {
				throw new Error(localize('copilot.customizationInstallation.notFound', "This customization installation is no longer available."));
			}
			return this.prepareConfiguredMcpUninstall(client, serverName);
		}
		const inventory = await this.listWithClient(client, policySessionId);
		const installation = inventory.find(candidate => candidate.installationId === installationId);
		if (!installation) {
			throw new Error(localize('copilot.customizationInstallation.notFound', "This customization installation is no longer available."));
		}
		if (installation.kind === 'skill') {
			const result = await client.rpc.skills.planUninstall({ contract: skillInstallationContract, installationId, policySessionId });
			if (result.kind !== 'outcome' || result.outcome.kind !== 'uninstall-planned') {
				throw this.resultError(result, localize('copilot.customizationInstallation.skillUninstallPlanFailed', "Could not prepare this skill removal."));
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
				() => this.expireOperation(review.operationId),
			));
			return review;
		}

		const result = await client.rpc.mcp.planUninstall({ contract: mcpInstallationContract, installationId, policySessionId });
		if (result.kind !== 'outcome' || result.outcome.kind !== 'uninstall-planned') {
			throw this.resultError(result, localize('copilot.customizationInstallation.mcpUninstallPlanFailed', "Could not prepare this MCP server removal."));
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
			() => this.expireOperation(operationId),
		));
		return review;
	}

	private prepareConfiguredMcpUninstall(client: ICopilotCustomizationInstallationClient, serverName: string): IAgentCustomizationInstallationReview {
		const operationId = generateUuid();
		const review: IAgentCustomizationInstallationReview = {
			operationId,
			action: 'uninstall',
			kind: 'mcp',
			displayName: serverName,
			serverName,
			target: serverName,
			configurationFields: [],
			restoresPreviousConfiguration: false,
			preservesSharedAuthentication: true,
		};
		const expiresAt = Date.now() + retainedCatalogLifetimeMs;
		this.addOperation(new PendingCustomizationInstallation(
			operationId,
			client,
			generateUuid(),
			undefined,
			review,
			() => false,
			async () => {
				await client.rpc.mcp.config.remove({ name: serverName });
				return undefined;
			},
			expiresAt,
			() => this.expireOperation(operationId),
		));
		return review;
	}

	private getCatalogKinds(mediaType: string | undefined): readonly CatalogCandidateKind[] {
		switch (mediaType) {
			case undefined: return ['ai-skill', 'mcp-server', 'plugin'];
			case 'application/ai-skill': return ['ai-skill'];
			case 'application/mcp-server+json': return ['mcp-server'];
			case copilotPluginMediaType: return ['plugin'];
			default: return [];
		}
	}

	private toCatalogKinds(kinds: readonly CatalogCandidateKind[]): [CatalogCandidateKind] | [CatalogCandidateKind, CatalogCandidateKind] | [CatalogCandidateKind, CatalogCandidateKind, CatalogCandidateKind] {
		switch (kinds.length) {
			case 1: return [kinds[0]];
			case 2: return [kinds[0], kinds[1]];
			default: return [kinds[0], kinds[1], kinds[2]];
		}
	}

	private retainCatalogCandidate(client: ICopilotCustomizationInstallationClient, policySessionId: string, searchId: string, candidate: InstallableCatalogCandidate): IAgentCustomizationMarketplaceSearchItem {
		let identifier: string;
		if (candidate.kind === 'plugin') {
			identifier = candidate.identity;
		} else {
			if (candidate.source.kind !== 'url') {
				throw new Error('Installable non-plugin catalog candidates must have a URL source');
			}
			identifier = candidate.source.url;
		}
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
			identifier,
			catalogIdentity: candidate.kind === 'plugin' ? candidate.identity : undefined,
			kind: candidate.kind === 'ai-skill' ? 'skill' : candidate.kind === 'mcp-server' ? 'mcp' : 'plugin',
			displayName: candidate.displayName,
			description: candidate.description,
			publisher: candidate.publisher,
			version: candidate.kind === 'plugin' ? candidate.version : undefined,
			repository: candidate.kind === 'plugin' ? candidate.source?.repository : undefined,
			path: candidate.kind === 'plugin' ? candidate.source?.path : undefined,
			itemUrl: candidate.kind !== 'plugin' && candidate.source.kind === 'url' ? candidate.source.url : undefined,
			connectorIds: candidate.connectorIds,
			...(candidate.kind === 'plugin' ? {
				compatibilityTags: getCanvasCompatibilityTags(candidate),
				installCount: candidate.installCount,
			} : {}),
			installable: true,
		};
	}

	private isInstallableCatalogCandidate(candidate: CatalogCandidate): candidate is InstallableCatalogCandidate {
		return candidate.installability === 'installable'
			&& typeof candidate.handle === 'string'
			&& typeof candidate.handleExpiresAt === 'string'
			&& (candidate.kind === 'plugin' || candidate.source.kind === 'url');
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
			throw this.resultError(result, localize('copilot.customizationInstallation.skillInventoryFailed', "Could not list installed skills."));
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
			throw this.resultError(result, localize('copilot.customizationInstallation.mcpInventoryFailed', "Could not list installed MCP servers."));
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

	private getConfiguredMcpInstallations(
		servers: Readonly<Record<string, object | undefined>>,
		receiptInstallations: readonly IAgentCustomizationInstallation[],
	): readonly IAgentCustomizationInstallation[] {
		const receiptNames = new Set(receiptInstallations.flatMap(installation => installation.kind === 'mcp' ? [installation.serverName] : []));
		return Object.keys(servers)
			.filter(serverName => !receiptNames.has(serverName))
			.map(serverName => ({
				installationId: `${configuredMcpInstallationPrefix}${encodeURIComponent(serverName)}`,
				kind: 'mcp' as const,
				mediaType: mcpServerMediaType,
				serverName,
				state: 'installed' as const,
			}));
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
			throw new Error(localize('copilot.customizationInstallation.invalidOperation', "The customization service returned an invalid installation operation."));
		}
		this.operations.set(operation.id, operation);
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
			creating = this.createPolicySession(client, sessionId).then(async created => {
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
		const message = result.message ?? fallback;
		const detail = describeSdkOutcome(result);
		return new Error(detail
			? localize('copilot.customizationInstallation.resultErrorDetail', "{0} ({1})", message, detail)
			: message);
	}

	private assertApplied(result: ISdkResult, action: 'install' | 'uninstall', sensitive = false): NonNullable<ISdkResult['outcome']> {
		if (result.kind !== 'outcome') {
			if (sensitive) {
				throw toInstallationFailure(result.kind);
			}
			throw this.resultError(result, action === 'install'
				? localize('copilot.customizationInstallation.installFailed', "Could not install this customization.")
				: localize('copilot.customizationInstallation.uninstallFailed', "Could not remove this customization."));
		}
		const outcome = result.outcome!;
		if (outcome.kind !== (action === 'install' ? 'installed' : 'uninstalled')) {
			// Typed reasons describe an installation, so removals keep their own wording.
			if (sensitive || (action === 'install' && (outcome.kind === 'cancelled' || outcome.kind === 'declined' || outcome.kind === 'recovery-required'))) {
				throw toInstallationFailure(typeof outcome.reason === 'string' ? outcome.reason : outcome.kind);
			}
			throw new Error(action === 'install'
				? localize('copilot.customizationInstallation.installNotCompleted', "The customization installation did not complete.")
				: localize('copilot.customizationInstallation.uninstallNotCompleted', "The customization removal did not complete."));
		}
		return outcome;
	}

	private toApplyResult(review: IAgentCustomizationInstallationReview, outcome: NonNullable<ISdkResult['outcome']>): IAgentCustomizationInstallationApplyResult | undefined {
		const installation = outcome.installation;
		if (review.kind === 'plugin') {
			if (!installation?.name || !installation.source?.repository || !installation.source.revision) {
				throw new Error(localize('copilot.customizationInstallation.pluginIdentityUnavailable', "The plugin was installed without a verified installation identity."));
			}
			return {
				kind: 'plugin',
				name: installation.name,
				repository: installation.source.repository,
				ref: installation.source.revision,
				path: installation.source.root ?? '',
			};
		}
		return installation?.installationId
			? { kind: 'receipt', installationId: installation.installationId }
			: undefined;
	}

	override dispose(): void {
		void this.releasePolicySession();
		super.dispose();
	}

}

/**
 * Whether the SDK reported that durable installation evidence must be
 * reconciled through `installations.recover` before inventory is available.
 */
function isRecoveryRequired(result: ISdkResult): boolean {
	return result.kind === 'outcome' && result.outcome?.kind === 'recovery-required';
}

/**
 * Describes a handled-but-unsuccessful SDK outcome as non-localized
 * diagnostic identifiers, e.g. `refused: policy-context-unavailable`.
 */
function describeSdkOutcome(result: ISdkResult): string | undefined {
	if (result.kind !== 'outcome' || !result.outcome) {
		return undefined;
	}
	const { kind, reason } = result.outcome;
	return typeof reason === 'string' ? `${kind}: ${reason}` : kind;
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

/**
 * A remote choice VS Code can collect values for: header and URL values plus
 * secrets. Repeated values are refused because the runtime accepts one string
 * per `(category, key)` and this client has no multi-value encoding.
 */
function isConfigurableRemoteChoice(choice: McpTransportChoice): choice is Extract<McpTransportChoice, { readonly installMethod: 'remote' }> {
	return choice.installMethod === 'remote'
		&& (choice.requiredValues.length > 0 || choice.secretPlaceholders.length > 0)
		&& choice.requiredValues.length + choice.secretPlaceholders.length <= maxConfiguredEntries
		&& choice.requiredValues.every(value => (value.category === 'header' || value.category === 'url-variable') && !value.isRepeated)
		&& new Set(choice.requiredValues.map(value => `${value.category}\0${value.key}`)).size === choice.requiredValues.length
		&& choice.secretPlaceholders.every(secret => planSecretPlaceholderPattern.test(secret.placeholder))
		&& new Set(choice.secretPlaceholders.map(secret => secret.placeholder)).size === choice.secretPlaceholders.length;
}

/**
 * A local package choice VS Code can configure itself: non-secret environment
 * and argument values only. Arguments may be repeated, since the host writes
 * one argument per value. Secrets would have to be written into the
 * configuration in plain text, so they wait for runtime-owned package installs.
 */
function isConfigurablePackageChoice(choice: McpTransportChoice): choice is Extract<McpTransportChoice, { readonly installMethod: 'package' }> {
	return choice.installMethod === 'package'
		&& choice.secretPlaceholders.length === 0
		&& choice.requiredValues.length > 0
		&& choice.requiredValues.length <= maxConfiguredEntries
		&& choice.requiredValues.every(value => value.category === 'environment-variable' ? !value.isRepeated : value.category === 'runtime-argument' || value.category === 'package-argument')
		&& new Set(choice.requiredValues.map(value => `${value.category}\0${value.key}`)).size === choice.requiredValues.length;
}

/** Finds the single stdio package in a verified card that the plan's package choice describes. */
function findMcpPackage(server: ReturnType<typeof parseMcpGalleryServerConfiguration>, plan: McpInstallPlanned, choice: Extract<McpTransportChoice, { readonly installMethod: 'package' }>): IMcpServerPackage {
	const packages = server?.configuration.packages?.filter(candidate =>
		candidate.registryType === choice.packageType && candidate.identifier === choice.packageIdentifier
		&& candidate.transport.type === TransportType.STDIO
	);
	if (!server || server.name !== plan.identity.canonicalName || (plan.identity.version !== undefined && server.version !== plan.identity.version) || packages?.length !== 1) {
		throw new Error(localize('copilot.customizationInstallation.mcpPackageChanged', "The MCP package does not match the installation plan. Refresh Browse and try again."));
	}
	return packages[0];
}

/** Builds the local configuration for a package whose values are all resolved. */
function toMcpPackageConfiguration(serverPackage: IMcpServerPackage): ICopilotMcpServerConfiguration {
	const parsed = new McpServerManifestParser().getMcpServerConfigurationFromManifest({ packages: [serverPackage] }, serverPackage.registryType);
	if (parsed.notices.length || parsed.mcpServerConfiguration.inputs?.length || parsed.mcpServerConfiguration.config.type !== McpServerType.LOCAL) {
		throw new Error(localize('copilot.customizationInstallation.mcpPackageInputsRequired', "This MCP package requires additional configuration that Browse cannot collect yet."));
	}
	return toCopilotMcpServerConfiguration(parsed.mcpServerConfiguration.config);
}

/** Finds the single remote in a verified card whose transport and declared values match the plan's remote choice. */
function findMcpRemote(server: ReturnType<typeof parseMcpGalleryServerConfiguration>, plan: McpInstallPlanned, choice: Extract<McpTransportChoice, { readonly installMethod: 'remote' }>): RemoteTransport {
	const declared = new Set(choice.requiredValues.map(value => `${value.category}\0${value.key}`));
	const remotes = server?.configuration.remotes?.filter(remote => {
		if (remote.type !== choice.transport) {
			return false;
		}
		const keys = [
			...Object.entries(remote.variables ?? {}).filter(([, variable]) => variable.value === undefined).map(([name]) => `url-variable\0${name}`),
			...(remote.headers ?? []).flatMap(header => header.variables && Object.keys(header.variables).length
				? Object.entries(header.variables).filter(([, variable]) => variable.value === undefined).map(([name]) => `header\0${name}`)
				: header.value ? [] : [`header\0${header.name}`]),
		];
		return keys.length === declared.size && keys.every(key => declared.has(key));
	});
	if (!server || server.name !== plan.identity.canonicalName || (plan.identity.version !== undefined && server.version !== plan.identity.version) || remotes?.length !== 1) {
		throw new Error(localize('copilot.customizationInstallation.mcpRemoteChanged', "The MCP server endpoint does not match the installation plan. Refresh Browse and try again."));
	}
	return remotes[0];
}

/**
 * Builds the remote configuration for a verified card remote with the
 * submitted header and URL values. URL variables are substituted literally,
 * once, like the runtime; the result must still be an http(s) URL.
 */
function toMcpRemoteConfiguration(remote: RemoteTransport, declared: readonly McpTransportChoice['requiredValues'][number][], inputs: IAgentCustomizationInstallationAnswers['inputs']): ICopilotMcpServerConfiguration {
	const unsupported = () => new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.mcpRemoteInputsRequired', "This MCP server requires configuration that Browse cannot collect yet."));
	const values = createMcpValueResolver(declared, inputs, unsupported);
	const variables = { ...remote.variables };
	for (const name of Object.keys(variables)) {
		const taken = values.take('url-variable', name);
		if (taken) {
			if (taken.value === undefined) {
				throw unsupported();
			}
			variables[name] = { ...variables[name], value: taken.value };
		}
	}
	const headers = remote.headers?.flatMap(entry => {
		const resolved = values.resolve(entry, 'header', entry.name);
		return resolved.kind === 'omit' ? [] : resolved.kind === 'set' ? [{ ...entry, value: resolved.value }] : [resolved.entry];
	});
	values.assertAllPlaced();
	const parsed = new McpServerManifestParser().getMcpServerConfigurationFromManifest({ remotes: [{ ...remote, variables, headers }] }, RegistryType.REMOTE);
	const config = parsed.mcpServerConfiguration.config;
	if (parsed.notices.length || parsed.mcpServerConfiguration.inputs?.length || config.type !== McpServerType.REMOTE || !isHttpUrlWithoutCredentials(config.url)) {
		throw unsupported();
	}
	// The manifest parser does not record the transport, so keep the card's (SSE or streamable HTTP).
	return toCopilotMcpServerConfiguration({ ...config, transport: remote.type === TransportType.SSE ? 'sse' : undefined });
}

function isHttpUrlWithoutCredentials(value: string): boolean {
	try {
		const url = new URL(value);
		return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
	} catch {
		return false;
	}
}

/**
 * Places submitted values into card entries, keyed like the runtime's plan. An
 * omitted value uses its default. Every declared value must land in exactly
 * one place; {@link assertAllPlaced} refuses anything left over.
 */
function createMcpValueResolver(declared: readonly McpTransportChoice['requiredValues'][number][], inputs: IAgentCustomizationInstallationAnswers['inputs'], unsupported: () => Error) {
	const pending = new Map(declared.map(value => [`${value.category}\0${value.key}`, value]));
	const take = (category: string, key: string): { readonly value: string | undefined } | undefined => {
		const value = pending.get(`${category}\0${key}`);
		if (!value) {
			return undefined;
		}
		if (value.isRepeated) {
			throw unsupported();
		}
		pending.delete(`${category}\0${key}`);
		return { value: inputs.find(input => input.category === category && input.key === key)?.value ?? value.defaultValue };
	};
	/** Every submitted value of a declared repeated value, or its default when none was submitted. */
	const takeAll = (category: string, key: string): readonly string[] | undefined => {
		const value = pending.get(`${category}\0${key}`);
		if (!value) {
			return undefined;
		}
		if (!value.isRepeated) {
			throw unsupported();
		}
		pending.delete(`${category}\0${key}`);
		const submitted = inputs.filter(input => input.category === category && input.key === key).map(input => input.value);
		return submitted.length ? submitted : value.defaultValue !== undefined ? [value.defaultValue] : [];
	};
	/** Resolves an entry's nested variables or its own value. */
	const resolve = <T extends IMcpServerVariableInput>(entry: T, category: string, key: string): { readonly kind: 'keep'; readonly entry: T } | { readonly kind: 'set'; readonly value: string } | { readonly kind: 'omit' } => {
		if (entry.variables && Object.keys(entry.variables).length) {
			const variables = { ...entry.variables };
			for (const name of Object.keys(variables)) {
				const taken = take(category, name);
				if (taken) {
					if (taken.value === undefined) {
						throw unsupported();
					}
					variables[name] = { ...variables[name], value: taken.value };
				}
			}
			return { kind: 'keep', entry: { ...entry, variables } };
		}
		const taken = entry.value ? undefined : take(category, key);
		if (!taken) {
			return { kind: 'keep', entry };
		}
		return taken.value === undefined ? { kind: 'omit' } : { kind: 'set', value: taken.value };
	};
	const assertAllPlaced = () => {
		if (pending.size) {
			throw unsupported();
		}
	};
	return { take, takeAll, resolve, assertAllPlaced };
}

/** What a package runs: its command, and its environment, with unresolved values as `${input:…}` placeholders. */
interface IMcpPackagePreview {
	readonly command: string;
	readonly env?: Readonly<Record<string, string>>;
}

/** Describes a package's command and environment, or `undefined` if it cannot be described. */
function describeMcpPackage(serverPackage: IMcpServerPackage): IMcpPackagePreview | undefined {
	try {
		const { config } = new McpServerManifestParser().getMcpServerConfigurationFromManifest({ packages: [serverPackage] }, serverPackage.registryType).mcpServerConfiguration;
		if (config.type !== McpServerType.LOCAL) {
			return undefined;
		}
		const env = config.env && Object.keys(config.env).length ? Object.fromEntries(Object.entries(config.env).map(([name, value]) => [name, String(value)])) : undefined;
		return { command: [config.command, ...(config.args ?? [])].join(' '), ...(env ? { env } : {}) };
	} catch {
		return undefined;
	}
}

/** The `(category, key)` of every value placed inside a template (a URL or nested variable), which can't be omitted. */
function mcpTemplateValueKeys(serverPackage: IMcpServerPackage | undefined, serverRemote: RemoteTransport | undefined): ReadonlySet<string> {
	const keys = new Set<string>();
	const nested = (entries: readonly IMcpServerVariableInput[] | undefined, category: string) => {
		for (const entry of entries ?? []) {
			for (const name of Object.keys(entry.variables ?? {})) {
				keys.add(`${category}\0${name}`);
			}
		}
	};
	if (serverRemote) {
		for (const name of Object.keys(serverRemote.variables ?? {})) {
			keys.add(`url-variable\0${name}`);
		}
		nested(serverRemote.headers, 'header');
	}
	if (serverPackage) {
		nested(serverPackage.environmentVariables, 'environment-variable');
		nested(serverPackage.runtimeArguments, 'runtime-argument');
		nested(serverPackage.packageArguments, 'package-argument');
	}
	return keys;
}

/**
 * Applies submitted values to a verified card package, keyed like the
 * runtime's plan: a nested variable's name, otherwise the entry's name, value
 * hint or `argument-<index>`. An omitted value uses its default, and an omitted
 * optional entry is dropped. Like the runtime, a named argument set to `true`
 * becomes a bare flag and one set to `false` is dropped. Every declared value
 * must land in exactly one place; otherwise the package is refused rather than
 * guessed.
 */
function withMcpPackageValues(serverPackage: IMcpServerPackage, declared: readonly McpTransportChoice['requiredValues'][number][], inputs: IAgentCustomizationInstallationAnswers['inputs']): IMcpServerPackage {
	const unsupported = () => new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.mcpPackageInputsRequired', "This MCP package requires additional configuration that Browse cannot collect yet."));
	const { resolve, takeAll, assertAllPlaced } = createMcpValueResolver(declared, inputs, unsupported);
	const environmentVariables = serverPackage.environmentVariables?.flatMap(entry => {
		const resolved = resolve(entry, 'environment-variable', entry.name);
		return resolved.kind === 'omit' ? [] : resolved.kind === 'set' ? [{ ...entry, value: resolved.value }] : [resolved.entry];
	});
	const withValue = (entry: IMcpServerArgument, value: string): IMcpServerArgument[] => {
		if (entry.type === 'named' && value === 'false') {
			return [];
		}
		return entry.type === 'named' && value === 'true' ? [{ type: 'named', name: entry.name }] : [{ ...entry, value }];
	};
	const args = (entries: readonly IMcpServerArgument[] | undefined, category: string) => entries?.flatMap((entry, index): IMcpServerArgument[] => {
		const key = entry.type === 'named' ? entry.name : entry.valueHint ?? `argument-${index}`;
		if (entry.isRepeated) {
			// A repeated argument is written once per submitted value; nested templates can't be repeated.
			if (entry.variables && Object.keys(entry.variables).length) {
				throw unsupported();
			}
			const values = entry.value ? undefined : takeAll(category, key);
			return values ? values.flatMap(value => withValue(entry, value)) : [entry];
		}
		const resolved = resolve(entry, category, key);
		if (resolved.kind === 'keep') {
			return [resolved.entry];
		}
		return resolved.kind === 'omit' ? [] : withValue(entry, resolved.value);
	});
	const resolved: IMcpServerPackage = {
		...serverPackage,
		environmentVariables,
		runtimeArguments: args(serverPackage.runtimeArguments, 'runtime-argument'),
		packageArguments: args(serverPackage.packageArguments, 'package-argument'),
	};
	assertAllPlaced();
	return resolved;
}

/** Revalidates answers against the retained choice. Errors name keys only, never values. */
function validateAnswers(choice: McpTransportChoice, answers: IAgentCustomizationInstallationAnswers): void {
	const invalid = (key: string) => new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.invalidValue', "The value for '{0}' is invalid.", key.slice(0, 200)));
	if (answers.inputs.length + answers.secrets.length > maxConfiguredEntries) {
		throw new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.tooManyValues', "Too many installation values were supplied."));
	}
	const seen = new Set<string>();
	for (const input of answers.inputs) {
		const identity = `${input.category}\0${input.key}`;
		const declared = choice.requiredValues.find(value => value.category === input.category && value.key === input.key);
		// Only repeated values may appear more than once; owned (runtime) choices never declare them.
		if (!declared || (seen.has(identity) && !declared.isRepeated)) {
			throw invalid(input.key);
		}
		seen.add(identity);
		if (!isValidConfiguredValue(declared, input)) {
			throw invalid(input.key);
		}
	}
	for (const value of choice.requiredValues) {
		if (value.required && value.defaultValue === undefined && !seen.has(`${value.category}\0${value.key}`)) {
			throw new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.valueRequired', "A value for '{0}' is required.", value.key.slice(0, 200)));
		}
	}
	const placeholders = new Set<string>();
	for (const secret of answers.secrets) {
		const declared = choice.secretPlaceholders.find(candidate => candidate.placeholder === secret.placeholder);
		if (!declared || placeholders.has(secret.placeholder) || !secret.value || secret.value.includes('\0') || utf8Length(secret.value) > maxConfiguredValueBytes) {
			throw invalid(declared?.key ?? '');
		}
		placeholders.add(secret.placeholder);
	}
	const missing = choice.secretPlaceholders.find(secret => !placeholders.has(secret.placeholder));
	if (missing) {
		throw new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.secretRequired', "A secret for '{0}' is required.", missing.key.slice(0, 200)));
	}
}

function isValidConfiguredValue(declared: McpTransportChoice['requiredValues'][number], input: IAgentCustomizationInstallationAnswers['inputs'][number]): boolean {
	const value = input.value;
	if (!value || value.includes('\0') || utf8Length(input.key) > maxConfiguredKeyBytes || utf8Length(value) > maxConfiguredValueBytes) {
		return false;
	}
	if (declared.kind === 'enum') {
		return declared.enumValues.includes(value);
	}
	switch (declared.valueType) {
		case 'boolean': return value === 'true' || value === 'false';
		case 'number': return configuredNumberPattern.test(value);
		default: return !configuredVariableReferencePattern.test(value);
	}
}

function utf8Length(value: string): number {
	return Buffer.byteLength(value, 'utf8');
}

/** Builds a localized failure from a bounded runtime reason, never from SDK text. */
function toInstallationFailure(reason: string): CustomizationInstallationFailure {
	switch (reason) {
		case 'cancelled':
		case 'declined':
			return new CustomizationInstallationFailure(reason, localize('copilot.customizationInstallation.cancelled', "The customization installation was cancelled."));
		case 'recovery-required':
		case 'write-failed':
			return new CustomizationInstallationFailure(reason, localize('copilot.customizationInstallation.recoveryRequired', "The installation result is unknown. Refresh the installed customizations before trying again."));
		case 'plan-expired':
		case 'plan-replayed':
		case 'replan-required':
		case 'resource-not-found':
		case 'foreign-runtime':
			return new CustomizationInstallationFailure(reason, localize('copilot.customizationInstallation.expired', "This customization installation review expired. Start the operation again."));
		case 'policy-denied':
		case 'policy-changed':
			return new CustomizationInstallationFailure(reason, localize('copilot.customizationInstallation.policyDenied', "Policy does not allow this MCP server installation."));
		case 'capability-required':
		case 'negotiation-refused':
			return new CustomizationInstallationFailure(reason, localize('copilot.customizationInstallation.configuredUnsupported', "The active Copilot runtime does not support configured MCP server installation."));
		case 'secret-store-unavailable':
			return new CustomizationInstallationFailure(reason, localize('copilot.customizationInstallation.secretStoreUnavailable', "The secret store is unavailable."));
		case 'source-changed':
		case 'source-unavailable':
		case 'configuration-changed':
			return new CustomizationInstallationFailure(reason, localize('copilot.customizationInstallation.sourceChanged', "The MCP server or its configuration changed after review. Start the installation again."));
		default:
			return new CustomizationInstallationFailure('invalid-request', localize('copilot.customizationInstallation.configuredFailed', "Could not install this MCP server."));
	}
}

/**
 * Checks the runtime's final configuration for a configured install. The
 * runtime owns URL and header expansion; VS Code checks the transport, the
 * changed fields, the tool grant and the exact owned secret-reference set.
 */
function isMatchingConfiguredMcpConfiguration(
	effective: { readonly transport: string; readonly url: string; readonly headers: Readonly<Record<string, string | undefined>>; readonly tools: readonly string[] } | undefined,
	choice: { readonly transport: string },
	configuration: { readonly changedFields: readonly string[]; readonly secretReferences: readonly string[] },
	suppliedSecrets: readonly string[],
): boolean {
	if (!effective || effective.url.includes('${')) {
		return false;
	}
	if (effective.transport !== choice.transport && !(choice.transport === 'streamable-http' && effective.transport === 'http')) {
		return false;
	}
	const changedFields = new Set(configuration.changedFields);
	const headers = Object.values(effective.headers);
	if (!changedFields.has('type') || !changedFields.has('url') || !changedFields.has('tools')
		|| (headers.length > 0 && !changedFields.has('headers')) || !structuralEquals(effective.tools, ['*'])) {
		return false;
	}
	const expected = new Set(suppliedSecrets.map(placeholder => planSecretPlaceholderPattern.exec(placeholder)?.groups?.id));
	if (expected.has(undefined) || !structuralEquals([...configuration.secretReferences].sort(), [...suppliedSecrets].sort())) {
		return false;
	}
	const referenced = new Set<string>();
	for (const value of headers) {
		if (value === undefined) {
			return false;
		}
		for (const match of value.matchAll(installationSecretReferencePattern)) {
			referenced.add(match.groups!.id);
		}
		if (value.replace(installationSecretReferencePattern, '').includes('${')) {
			return false;
		}
	}
	return referenced.size === expected.size && [...referenced].every(id => expected.has(id));
}
