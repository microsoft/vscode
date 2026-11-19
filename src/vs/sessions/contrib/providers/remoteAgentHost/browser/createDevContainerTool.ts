/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, raceTimeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { isAgentHostProvider } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerEnvironmentsEnabledSettingId, DevContainerHandoffEnabledSettingId, IDevContainerAgentHostService, isDevContainerHandoffEnabled, LocalDevContainerEnvironmentHost } from '../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';

export const CreateDevContainerToolId = 'vscode_create_dev_container';

/** How long to wait for the agents of a new Dev Container, so the next tool call can start a session there. */
const AGENTS_TIMEOUT_MS = 30_000;

interface IDevContainerHost {
	/** `local` or a host ID from `list_agent_hosts`. */
	readonly id: string;
	readonly label: string;
	readonly address: string;
}

/**
 * Creates a Dev Container environment, the same as the create action of Remote Environments, so an agent
 * can continue work inside it with `create_remote_session`.
 */
export class CreateDevContainerTool implements IToolImpl {

	constructor(
		@IDevContainerAgentHostService private readonly devContainerService: IDevContainerAgentHostService,
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	getToolData(): IToolData {
		return {
			id: CreateDevContainerToolId,
			toolReferenceName: 'create_dev_container',
			displayName: localize('createDevContainer.displayName', "Create Dev Container"),
			userDescription: localize('createDevContainer.userDescription', "Create a Dev Container with an agent host running inside"),
			modelDescription: 'Create a Linux Dev Container from the Ubuntu base image with an agent host running inside, on this computer or on a connected SSH, Tunnel, or WSL host with Docker. Use when work should continue in an isolated container. The container persists, keeps its files in a Docker volume, and is listed in Remote Environments, where the user can delete it. `host` defaults to this computer when Docker is available there. Returns the container\'s `hostId` and its empty `workspace` folder; to continue there, call create_remote_session with that `hostId` and `workspace: { uri: workspace, isolation: "folder" }`. Building can take minutes. Normal approval applies. Each call creates another container, so do not retry a failed creation without addressing its error.',
			source: ToolDataSource.Internal,
			icon: Codicon.remoteExplorer,
			when: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
				ContextKeyExpr.equals(`config.${DevContainerAgentHostEnabledSettingId}`, true),
				ContextKeyExpr.equals(`config.${DevContainerEnvironmentsEnabledSettingId}`, true),
				ContextKeyExpr.equals(`config.${DevContainerHandoffEnabledSettingId}`, true),
			),
			runsInWorkspace: false,
			canBeReferencedInPrompt: false,
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				properties: {
					host: { type: 'string', description: '`local` for this computer, or the exact ID of an SSH, Tunnel, or WSL host from list_agent_hosts.' },
				},
			},
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		const host = this.resolveHost(context.parameters);
		return {
			invocationMessage: localize('createDevContainer.invocation', "Creating Dev Container on {0}", host.label),
			pastTenseMessage: localize('createDevContainer.past', "Created Dev Container on {0}", host.label),
			confirmationMessages: {
				title: localize('createDevContainer.confirmationTitle', "Create Dev Container?"),
				message: new MarkdownString().appendText(localize('createDevContainer.confirmation', "Create a Dev Container from the Ubuntu base image on {0}? It keeps its files in a Docker volume until you delete it in Remote Environments.", host.label)),
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const host = this.resolveHost(invocation.parameters);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const environment = await this.devContainerService.createEnvironment(host.address);
		const provider = this.providersService.getProvider(environment.providerId);
		if (!environment.workspaceUri || !provider) {
			throw new Error(localize('createDevContainer.workspaceUnavailable', "The Dev Container was created, but its workspace folder is not available. It is listed in Remote Environments."));
		}
		// The folder is new and empty, and the user confirmed creating it; sessions require a trusted workspace.
		await this.workspaceTrustService.setUrisTrust([environment.workspaceUri], true);
		if (!provider.sessionTypes.length) {
			const ready = Event.toPromise(Event.filter(provider.onDidChangeSessionTypes, () => provider.sessionTypes.length > 0));
			try {
				await raceCancellationError(raceTimeout(ready, AGENTS_TIMEOUT_MS), token);
			} finally {
				ready.cancel();
			}
		}
		const result = {
			status: 'created',
			hostId: environment.providerId,
			label: provider.label,
			workspace: environment.workspaceUri.toString(),
			createdOn: { id: host.id, label: host.label },
		};
		return {
			content: [{ kind: 'text', value: JSON.stringify(result) }],
			toolResultMessage: localize('createDevContainer.result', "Created {0} on {1}", provider.label, host.label),
		};
	}

	private resolveHost(parameters: unknown): IDevContainerHost {
		if (!isDevContainerHandoffEnabled(this.configurationService)) {
			throw new Error(localize('createDevContainer.disabled', "Creating Dev Containers is disabled."));
		}
		if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters) || Object.keys(parameters).some(key => key !== 'host')) {
			throw new Error(localize('createDevContainer.invalidInput', "The input must be an object with an optional {0} string.", 'host'));
		}
		const requested: unknown = Reflect.get(parameters, 'host');
		if (requested !== undefined && (typeof requested !== 'string' || !requested)) {
			throw new Error(localize('createDevContainer.invalidHost', "{0} must be a non-empty string.", 'host'));
		}
		const hosts = this.getHosts();
		if (!hosts.length) {
			throw new Error(localize('createDevContainer.noHosts', "No Docker host is available. Start Docker on this computer, or connect to an SSH, Tunnel, or WSL host that has Docker."));
		}
		const host = requested !== undefined ? hosts.find(host => host.id === requested)
			: hosts.find(host => host.id === LocalDevContainerEnvironmentHost) ?? (hosts.length === 1 ? hosts[0] : undefined);
		if (!host) {
			const available = JSON.stringify(hosts.map(({ id, label }) => ({ id, label })));
			throw new Error(requested !== undefined
				? localize('createDevContainer.unknownHost', "Dev Containers cannot be created on {0} now. Available hosts: {1}", requested, available)
				: localize('createDevContainer.hostRequired', "Docker is not available on this computer. Choose a host: {0}", available));
		}
		return host;
	}

	/** This computer first, then the connected hosts that can run Dev Containers now, as in Remote Environments. */
	private getHosts(): IDevContainerHost[] {
		const addresses = this.devContainerService.environmentHosts.get();
		const hosts: IDevContainerHost[] = [];
		if (addresses.has(LocalDevContainerEnvironmentHost)) {
			hosts.push({ id: LocalDevContainerEnvironmentHost, label: localize('createDevContainer.thisComputer', "This Computer"), address: LocalDevContainerEnvironmentHost });
		}
		for (const provider of this.providersService.getProviders()) {
			if (isAgentHostProvider(provider) && provider.remoteAddress && addresses.has(provider.remoteAddress)) {
				hosts.push({ id: provider.id, label: provider.label, address: provider.remoteAddress });
			}
		}
		return hosts;
	}
}
