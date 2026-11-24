/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { createCommandUri, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerEnvironmentsEnabledSettingId, DevContainerHandoffEnabledSettingId, IDevContainerAgentHostService, isDevContainerHandoffEnabled, LocalDevContainerEnvironmentHost } from '../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { getDevContainerSourceEntry } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/devContainerSource.js';
import { IRemoteSessionService, IRemoteSessionWorkspace } from '../../../remoteSessions/common/remoteSessions.js';

export const CreateDevContainerToolId = 'vscode_create_dev_container';

/** Opens the log of the Dev Container environment whose Sessions provider ID is the argument. */
export const ShowDevContainerEnvironmentLogCommandId = 'sessions.devContainer.showEnvironmentLog';

CommandsRegistry.registerCommand(ShowDevContainerEnvironmentLogCommandId, async (accessor, providerId: unknown) => {
	const provider = typeof providerId === 'string' ? accessor.get(ISessionsProvidersService).getProvider(providerId) : undefined;
	if (provider && isAgentHostProvider(provider)) {
		await provider.showConnectionLog?.();
	}
});

/** A message that opens the environment's log when clicked. */
function logLink(providerId: string, label: string): MarkdownString {
	return new MarkdownString('', { isTrusted: { enabledCommands: [ShowDevContainerEnvironmentLogCommandId] } })
		.appendLink(createCommandUri(ShowDevContainerEnvironmentLogCommandId, providerId).toString(), label, localize('createDevContainer.showLog', "Show Dev Container Log"));
}

function creatingMessage(hostLabel: string): string {
	return localize('createDevContainer.invocation', "Creating Dev Container on {0}", hostLabel);
}

/** Identifies a tool call: agents choose call IDs, so different chats can use the same one. */
function approvalKey(chatResource: URI | undefined, callId: string): string {
	return JSON.stringify([chatResource?.toString() ?? null, callId]);
}

/** How long to wait until a new Dev Container can start sessions, so the next tool call can start one there. */
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 500;

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

	/** The host that the user approved for each tool call, so a changed default cannot move the container elsewhere. */
	private readonly approvedHosts = new LRUCache<string, string>(100);

	constructor(
		@IDevContainerAgentHostService private readonly devContainerService: IDevContainerAgentHostService,
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISessionsManagementService private readonly sessionsService: ISessionsManagementService,
		@IRemoteSessionService private readonly remoteSessionService: IRemoteSessionService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
	) { }

	getToolData(): IToolData {
		return {
			id: CreateDevContainerToolId,
			toolReferenceName: 'create_dev_container',
			displayName: localize('createDevContainer.displayName', "Create Dev Container"),
			userDescription: localize('createDevContainer.userDescription', "Create a Dev Container with an agent host running inside"),
			modelDescription: 'Create a Linux Dev Container from the Ubuntu base image with an agent host running inside, on this computer or on a connected SSH, Tunnel, or WSL host with Docker. Use when work should continue in an isolated container. The container persists, keeps its files in a Docker volume, and is listed in Remote Environments, where the user can delete it. `host` defaults to the host this session runs on (for a session in a Dev Container, the host that runs that container), or to this computer when that host cannot run Dev Containers. Returns the container\'s `hostId` and its empty `workspace` folder once it can start sessions; to continue there, call create_remote_session with that `hostId` and `workspace: { uri: workspace, isolation: "folder" }`. When `status` is `notReady`, the container exists but cannot start sessions yet: follow its `guidance` instead of creating another. Building can take minutes. Normal approval applies. Each call creates another container, so do not retry a failed creation without addressing its error.',
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
			// Calls from a background chat wait for a chat to confirm them instead of opening a window-wide dialog.
			canRequestPreApproval: true,
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				properties: {
					host: { type: 'string', description: '`local` for this computer, or the exact ID of an SSH, Tunnel, or WSL host from list_agent_hosts. Omit to use the host this session runs on.' },
				},
			},
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		const chatResource = context.originatingChatResource ?? context.chatSessionResource;
		const host = this.resolveHost(context.parameters, chatResource);
		this.approvedHosts.set(approvalKey(chatResource, context.toolCallId), host.id);
		return {
			invocationMessage: creatingMessage(host.label),
			pastTenseMessage: localize('createDevContainer.past', "Created Dev Container on {0}", host.label),
			confirmationMessages: {
				title: localize('createDevContainer.confirmationTitle', "Create Dev Container?"),
				message: new MarkdownString().appendText(localize('createDevContainer.confirmation', "Create a Dev Container from the Ubuntu base image on {0}? It keeps its files in a Docker volume until you delete it in Remote Environments.", host.label)),
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const host = this.getApprovedHost(approvalKey(invocation.originatingChatResource ?? invocation.context?.sessionResource, invocation.callId));
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const environment = await this.devContainerService.createEnvironment(host.address, {
			// Building the container can take minutes; like the Dev Container session preparation, its message opens the log.
			onWillConnect: created => progress.report({ message: logLink(created.providerId, creatingMessage(host.label)) }),
		});
		const provider = this.providersService.getProvider(environment.providerId);
		if (!environment.workspaceUri || !provider) {
			throw new Error(localize('createDevContainer.workspaceUnavailable', "The Dev Container was created, but its workspace folder is not available. It is listed in Remote Environments."));
		}
		// The folder is new and empty, and the user confirmed creating it; sessions require a trusted workspace.
		await this.workspaceTrustService.setUrisTrust([environment.workspaceUri], true);
		const rejections = await this.whenSessionsCanStart(environment.providerId, { uri: environment.workspaceUri, isolation: 'folder' }, token);
		const result = {
			status: rejections.length ? 'notReady' : 'created',
			hostId: environment.providerId,
			label: provider.label,
			workspace: environment.workspaceUri.toString(),
			createdOn: { id: host.id, label: host.label },
			...(rejections.length ? {
				reasons: rejections,
				guidance: 'The container exists and is listed in Remote Environments, but cannot start sessions yet. Do not create another container. Wait briefly, then call create_remote_session with this hostId and workspace; if it still fails, report the reasons to the user.',
			} : {}),
		};
		return {
			content: [{ kind: 'text', value: JSON.stringify(result) }],
			toolResultMessage: logLink(environment.providerId, rejections.length
				? localize('createDevContainer.notReady', "Created {0} on {1}, not yet ready for sessions", provider.label, host.label)
				: localize('createDevContainer.result', "Created {0} on {1}", provider.label, host.label)),
		};
	}

	/**
	 * Waits until `create_remote_session` can start a session in the workspace, and returns why it cannot
	 * when that takes too long. Readiness combines the host's connection, agents, session types and
	 * language models, which change through different events, so this polls.
	 */
	private async whenSessionsCanStart(hostId: string, workspace: IRemoteSessionWorkspace, token: CancellationToken): Promise<readonly string[]> {
		const deadline = Date.now() + READY_TIMEOUT_MS;
		let rejections = this.remoteSessionService.getHostRejections(hostId, workspace);
		while (rejections.length && Date.now() < deadline) {
			await timeout(READY_POLL_MS, token);
			rejections = this.remoteSessionService.getHostRejections(hostId, workspace);
		}
		return rejections;
	}

	/** The host that the user approved in the confirmation of the call, if it can still run Dev Containers. */
	private getApprovedHost(key: string): IDevContainerHost {
		const approvedHostId = this.approvedHosts.get(key);
		this.approvedHosts.delete(key);
		if (!isDevContainerHandoffEnabled(this.configurationService)) {
			throw new Error(localize('createDevContainer.disabled', "Creating Dev Containers is disabled."));
		}
		if (approvedHostId === undefined) {
			throw new Error(localize('createDevContainer.notPrepared', "The Dev Container was not created because the host of its confirmation is no longer known. Call the tool again."));
		}
		const hosts = this.getHosts();
		const approved = hosts.find(host => host.id === approvedHostId);
		if (!approved) {
			throw new Error(localize('createDevContainer.approvedHostUnavailable', "The Dev Container was not created: the approved host {0} can no longer run Dev Containers. Available hosts: {1}", approvedHostId, JSON.stringify(hosts.map(({ id, label }) => ({ id, label })))));
		}
		return approved;
	}

	private resolveHost(parameters: unknown, chatResource: URI | undefined): IDevContainerHost {
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
		const sessionHostAddress = requested === undefined ? this.getSessionHostAddress(chatResource) : undefined;
		const host = requested !== undefined ? hosts.find(host => host.id === requested)
			: (sessionHostAddress !== undefined ? hosts.find(host => host.address === sessionHostAddress) : undefined)
			?? hosts.find(host => host.id === LocalDevContainerEnvironmentHost);
		if (!host) {
			const available = JSON.stringify(hosts.map(({ id, label }) => ({ id, label })));
			throw new Error(requested !== undefined
				? localize('createDevContainer.unknownHost', "Dev Containers cannot be created on {0} now. Available hosts: {1}", requested, available)
				: localize('createDevContainer.hostRequired', "Docker is not available on this computer. Choose a host: {0}", available));
		}
		return host;
	}

	/**
	 * The address of the host that the invoking session runs on, as in {@link IDevContainerHost.address}. For a
	 * session in a Dev Container, that is the host that runs the container.
	 */
	private getSessionHostAddress(chatResource: URI | undefined): string | undefined {
		const session = chatResource && (this.sessionsService.getSessionForChatResource(chatResource)?.session ?? this.sessionsService.getSession(chatResource));
		if (!session) {
			return undefined;
		}
		if (session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID) {
			return LocalDevContainerEnvironmentHost;
		}
		const provider = this.providersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}
		if (provider.devContainerEnvironmentHost) {
			return provider.devContainerEnvironmentHost;
		}
		// The Dev Container of a folder runs on the host of the folder.
		const sourceWorkspace = provider.devContainerSourceWorkspace;
		if (sourceWorkspace) {
			if (sourceWorkspace.scheme === Schemas.file) {
				return LocalDevContainerEnvironmentHost;
			}
			const entry = getDevContainerSourceEntry(sourceWorkspace, this.remoteAgentHostService);
			return entry && getEntryAddress(entry);
		}
		return provider.remoteAddress;
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
