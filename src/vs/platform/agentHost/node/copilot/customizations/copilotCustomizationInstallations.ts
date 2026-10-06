/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, InstallationConfirmationHandler, InstallationConfirmationRequest } from '@github/copilot-sdk';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IAgentCustomizationInstallation, IAgentCustomizationInstallationCatalogue, IAgentCustomizationInstallationRequest, IAgentCustomizationInstallationReview } from '../../../common/agent.js';

const catalogContract = {
	protocolVersion: 3,
	requiredCapabilities: ['catalog-search-credential-required', 'catalog-search-session-bound', 'catalog-selection'],
};

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
	readonly rpc: Pick<CopilotClient['rpc'], 'catalog' | 'skills' | 'mcp'>;
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
	) {
		super();
	}

	async list(session: URI): Promise<readonly IAgentCustomizationInstallation[]> {
		const policySessionId = this.requirePolicySessionId(session);
		const client = await this.getClient();
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
		const policySessionId = this.requirePolicySessionId(session);
		const client = await this.getClient();
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
		const policySessionId = this.requirePolicySessionId(session);
		const client = await this.getClient();
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
		if ((request.installation.kind !== 'skill' && request.installation.kind !== 'mcp') || !request.itemUrl) {
			throw new Error(localize('copilot.customizationInstallation.unsupported', "This customization does not provide an SDK installation identity."));
		}
		const search = await client.rpc.catalog.search({
			contract: catalogContract,
			policySessionId,
			query: request.displayName,
			limit: 50,
			kinds: [request.installation.kind === 'skill' ? 'ai-skill' : 'mcp-server'],
		});
		if (search.kind !== 'succeeded') {
			throw new Error(search.message);
		}
		const candidate = search.candidates.find(candidate =>
			candidate.kind === (request.installation.kind === 'skill' ? 'ai-skill' : 'mcp-server')
			&& candidate.source.kind === 'url'
			&& candidate.source.url === request.itemUrl
		);
		if (!candidate || candidate.kind === 'plugin') {
			throw new Error(localize('copilot.customizationInstallation.catalogChanged', "The SDK catalog no longer contains this exact customization. Refresh Discover and try again."));
		}
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
		const planned = await client.rpc.mcp.planInstall({
			contract: {
				...catalogContract,
				requiredCapabilities: [...catalogContract.requiredCapabilities, 'mcp-install-planning', 'multiple-transport-choice'],
			},
			policySessionId,
			scope: 'user',
			source: { kind: 'candidate', candidateHandle: candidate.handle, searchId: search.searchId },
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
				&& isMatchingCatalogue(confirmation.review.review.catalogue, request, candidate.provenance.authority, candidate.publisher)
				&& structuralEquals(confirmation.review.review.target, planned.plan.target)
				&& structuralEquals(confirmation.review.review.policy, planned.plan.policy)
				&& structuralEquals(confirmation.review.review.selectedChoice, choice)
				&& structuralEquals(confirmation.review.review.configurationChange, configuration)
				&& confirmation.review.review.inputs.length === 0
				&& confirmation.review.review.suppliedSecrets.length === 0
				&& confirmation.review.review.secretStorage === 'keychain'
				&& confirmation.review.review.target.scope === 'user'
				&& confirmation.review.review.policy.decision !== 'blocked'
				&& structuralEquals(confirmation.review.review.effectiveConfiguration, {
					transport: choice.transport,
					url: choice.endpoint,
					headers: {},
					tools: [],
				}),
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
				&& isMatchingCatalogueAuthority(confirmation.review.review.provenance.authority, installation.catalogue?.source)
				&& confirmation.review.review.restoresPreviousConfiguration === plan.restoresPreviousConfiguration
				&& confirmation.review.review.ownedSecretCount === plan.ownedSecretCount
				&& confirmation.review.review.preservesSharedAuthentication === plan.preservesSharedAuthentication,
			() => client.rpc.mcp.applyUninstall({ contract: mcpInstallationContract, planHandle: plan.planHandle, policySessionId }),
			plan.expiresAtEpochMs,
			() => this.operations.deleteAndDispose(operationId),
		));
		return review;
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

	private requirePolicySessionId(session: URI): string {
		const policySessionId = this.getPolicySessionId(session);
		if (!policySessionId) {
			throw new Error(localize('copilot.customizationInstallation.sessionRequired', "Start a Copilot agent session before managing SDK installations."));
		}
		return policySessionId;
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

}

function isMatchingCatalogue(
	catalogue: IInstallationCatalogueIdentity | undefined,
	request: IAgentCustomizationInstallationRequest,
	authority: string,
	publisher: string | undefined,
): boolean {
	if (!catalogue) {
		return false;
	}
	return catalogue.resourceId === request.identifier
		&& catalogue.itemUrl === request.itemUrl
		&& catalogue.displayName === request.displayName
		&& (catalogue.description ?? '') === request.description
		&& catalogue.publisher === publisher
		&& catalogue.version === request.version
		&& isMatchingCatalogueAuthority(authority, catalogue.source);
}

function isMatchingCatalogueAuthority(authority: string, source: string | undefined): boolean {
	if (!source) {
		return false;
	}
	try {
		const sourceUri = URI.parse(source);
		return (sourceUri.authority || sourceUri.path) === authority;
	} catch {
		return source === authority;
	}
}
