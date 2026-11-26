/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { ModelContextTier, modelContextTiers } from '../../../../platform/agentHost/common/agentModelConfiguration.js';
import { AgentHostSessionModelOptionsSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { IAgentHostResources } from '../../../../platform/agentHost/common/meta/agentHostResources.js';
import { ReasoningEffortLevel, reasoningEffortLevels } from '../../../../platform/agentHost/common/reasoningEffort.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { DevContainerHandoffEnabledSettingId } from '../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';

export const RemoteSessionToolsEnabledSettingId = 'chat.remoteSessions.tools.enabled';

export const remoteSessionToolsWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
	ContextKeyExpr.or(
		ContextKeyExpr.equals(`config.${RemoteSessionToolsEnabledSettingId}`, true),
		// Agents that continue work in a Dev Container start and contact its session with these tools.
		ContextKeyExpr.equals(`config.${DevContainerHandoffEnabledSettingId}`, true),
	),
);

export function areRemoteSessionToolsEnabled(configurationService: IConfigurationService): boolean {
	return !configurationService.getValue<boolean>('chat.disableAIFeatures')
		&& configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) === true
		&& (configurationService.getValue<boolean>(RemoteSessionToolsEnabledSettingId) === true
			|| configurationService.getValue<boolean>(DevContainerHandoffEnabledSettingId) === true);
}

/** Whether agents can choose a new remote session's reasoning effort and context tier, as they can in the host's `create_session`. */
export function areRemoteSessionModelOptionsEnabled(configurationService: IConfigurationService): boolean {
	const value = configurationService.getValue<string>(AgentHostSessionModelOptionsSettingId);
	return value === 'inline' || value === 'tool';
}

export interface IRemoteSessionRequirements {
	readonly platform?: 'windows' | 'linux' | 'macos';
	readonly minMemoryGiB?: number;
	readonly minCpuCount?: number;
}

export interface IRemoteSessionModel {
	readonly provider: string;
	readonly id: string;
}

export interface IRemoteSessionWorkspace {
	readonly uri: URI;
	readonly isolation: 'folder' | 'worktree';
	readonly branch?: string;
}

export interface ICreateRemoteSessionOptions {
	readonly prompt: string;
	readonly title?: string;
	readonly hostId?: string;
	readonly model?: IRemoteSessionModel;
	/** Requires {@link model}; set as an explicit choice over the user's saved reasoning effort for the model. */
	readonly reasoningEffort?: ReasoningEffortLevel;
	/** Requires {@link model}; set as an explicit choice over the user's saved context size for the model. */
	readonly contextTier?: ModelContextTier;
	readonly requirements: IRemoteSessionRequirements;
	readonly workspace?: IRemoteSessionWorkspace;
}

export interface IRemoteSessionHost {
	readonly id: string;
	readonly label: string;
	readonly status: string;
	/** Null until a connected host has published its capabilities. */
	readonly supportsRemoteSessions: boolean | null;
	readonly resources?: IAgentHostResources;
	readonly runningSessions?: number;
	readonly pendingCreations: number;
	readonly agents: readonly {
		readonly provider: string;
		readonly models: readonly { readonly id: string; readonly name: string }[];
	}[];
	readonly workspaces: readonly { readonly uri: string; readonly label: string }[];
}

export interface ICreatedRemoteSession {
	readonly session: string;
	readonly chat: string;
	readonly openLink: string;
	readonly host: { readonly id: string; readonly label: string };
	readonly model: { readonly provider: string; readonly id: string | null };
	readonly workspace: {
		readonly requestedUri: string;
		readonly uri: string | null;
		readonly isolation: 'folder' | 'worktree';
		readonly branch?: string;
		readonly baseBranch?: string;
		readonly worktreePending: boolean;
	} | null;
	readonly placement: { readonly runningSessions: number; readonly pendingCreations: number };
	readonly status: 'started';
}

/** A host named for people, as in the Environment picker. */
export interface IRemoteSessionHostName {
	readonly label: string;
	/** For a Dev Container environment, the name of the host that runs the container. */
	readonly containerHost?: string;
}

/** Where `createSession` would start the session, for people to approve. */
export interface IRemoteSessionDestination {
	/** The host that the options pin, by `hostId` or by an Agent Host workspace URI, if it is available in this window. */
	readonly host?: IRemoteSessionHostName;
	/** The host ID or workspace authority that pins the host, also when that host is not available; undefined when placement selects it. */
	readonly pinnedBy?: string;
	/**
	 * A lossless label of the workspace directory on its host: its path, prefixed with `//authority` when it has one,
	 * decoded through the pinned host's connection, so it names the directory that creation inspects.
	 */
	readonly workspace?: string;
}

export const IRemoteSessionService = createDecorator<IRemoteSessionService>('remoteSessionService');

export interface IRemoteSessionService {
	readonly _serviceBrand: undefined;
	listHosts(): readonly IRemoteSessionHost[];
	/**
	 * Why `createSession` would not start a session in the workspace on the host now, apart from the
	 * workspace's existence and trust; empty when it would.
	 */
	getHostRejections(hostId: string, workspace: IRemoteSessionWorkspace): readonly string[];
	/** Describes where `createSession` would start the session with the options, for its approval. */
	getRequestedDestination(options: ICreateRemoteSessionOptions): IRemoteSessionDestination;
	createSession(options: ICreateRemoteSessionOptions, source: URI, requestId: string, token: CancellationToken): Promise<ICreatedRemoteSession>;
}

function readObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(localize('remoteSessions.invalidObject', "{0} must be an object.", label));
	}
	for (const key of Object.keys(value)) {
		if (!fields.includes(key)) {
			throw new Error(localize('remoteSessions.unknownProperty', "Unknown {0} property \"{1}\".", label, key));
		}
	}
	return value as Record<string, unknown>;
}

function readText(value: unknown, label: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(localize('remoteSessions.invalidText', "{0} must be a non-empty string.", label));
	}
	return value;
}

function readMinimum(value: unknown, label: string, integer: boolean): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (integer && !Number.isSafeInteger(value))) {
		throw new Error(integer
			? localize('remoteSessions.invalidInteger', "{0} must be a positive integer.", label)
			: localize('remoteSessions.invalidNumber', "{0} must be a positive number.", label));
	}
	return value;
}

function readChoice<T extends string>(value: unknown, values: readonly T[], label: string): T {
	const choice = values.find(candidate => candidate === value);
	if (choice === undefined) {
		throw new Error(localize('remoteSessions.invalidChoice', "{0} must be one of: {1}.", label, values.join(', ')));
	}
	return choice;
}

/**
 * @param modelOptions Whether agents can choose the model's reasoning effort and context tier
 * ({@link areRemoteSessionModelOptionsEnabled}); otherwise those properties are unknown.
 */
export function parseCreateRemoteSessionOptions(value: unknown, modelOptions = false): ICreateRemoteSessionOptions {
	const fields = ['prompt', 'title', 'hostId', 'model', 'requirements', 'workspace'];
	const input = readObject(value, modelOptions ? [...fields, 'reasoningEffort', 'contextTier'] : fields, 'create_remote_session');
	const prompt = readText(input.prompt, 'prompt');
	const title = input.title === undefined ? undefined : readText(input.title, 'title');
	if (title !== undefined && Array.from(title).length > 200) {
		throw new Error(localize('remoteSessions.titleTooLong', "{0} must not exceed {1} characters.", 'title', 200));
	}
	const hostId = input.hostId === undefined ? undefined : readText(input.hostId, 'hostId');
	let model: IRemoteSessionModel | undefined;
	if (input.model !== undefined) {
		const raw = readObject(input.model, ['provider', 'id'], 'model');
		model = { provider: readText(raw.provider, 'model.provider'), id: readText(raw.id, 'model.id') };
	}
	const reasoningEffort = input.reasoningEffort === undefined ? undefined : readChoice(input.reasoningEffort, reasoningEffortLevels, 'reasoningEffort');
	const contextTier = input.contextTier === undefined ? undefined : readChoice(input.contextTier, modelContextTiers, 'contextTier');
	if ((reasoningEffort !== undefined || contextTier !== undefined) && !model) {
		throw new Error(localize('remoteSessions.modelOptionsRequireModel', "{0} and {1} require {2}.", 'reasoningEffort', 'contextTier', 'model'));
	}
	const requirements: Record<string, unknown> = input.requirements === undefined ? {} : readObject(input.requirements, ['platform', 'minMemoryGiB', 'minCpuCount'], 'requirements');
	const platform = requirements.platform;
	if (platform !== undefined && platform !== 'windows' && platform !== 'linux' && platform !== 'macos') {
		throw new Error(localize('remoteSessions.invalidPlatform', "{0} must be {1}, {2}, or {3}.", 'requirements.platform', 'windows', 'linux', 'macos'));
	}
	let workspace: IRemoteSessionWorkspace | undefined;
	if (input.workspace !== undefined) {
		const raw = readObject(input.workspace, ['uri', 'isolation', 'branch'], 'workspace');
		const uri = URI.parse(readText(raw.uri, 'workspace.uri'), true);
		// eslint-disable-next-line local/code-agent-host-uri-mapping -- validates the host filesystem URI inside a remote-workspace tool argument before resolving a connection
		const directory = fromAgentHostUri(uri);
		if ((uri.scheme !== Schemas.file && uri.scheme !== AGENT_HOST_SCHEME)
			|| directory.scheme !== Schemas.file || !directory.path.startsWith('/') || directory.path === '/'
			|| directory.query || directory.fragment || (uri.scheme === AGENT_HOST_SCHEME && !uri.authority)) {
			throw new Error(localize('remoteSessions.invalidWorkspace', "{0} must identify an absolute folder using a file URI or a remote workspace URI from {1}.", 'workspace.uri', 'list_agent_hosts'));
		}
		const isolation = raw.isolation ?? 'worktree';
		if (isolation !== 'folder' && isolation !== 'worktree') {
			throw new Error(localize('remoteSessions.invalidIsolation', "{0} must be {1} or {2}.", 'workspace.isolation', 'folder', 'worktree'));
		}
		const branch = raw.branch === undefined ? undefined : readText(raw.branch, 'workspace.branch');
		if (branch !== undefined && isolation !== 'worktree') {
			throw new Error(localize('remoteSessions.branchRequiresWorktree', "{0} requires {1} isolation; an existing checkout is never switched to another branch.", 'workspace.branch', 'worktree'));
		}
		workspace = { uri, isolation, branch };
	}
	return {
		prompt, title, hostId, model, workspace,
		...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
		...(contextTier !== undefined ? { contextTier } : {}),
		requirements: {
			platform,
			minMemoryGiB: readMinimum(requirements.minMemoryGiB, 'requirements.minMemoryGiB', false),
			minCpuCount: readMinimum(requirements.minCpuCount, 'requirements.minCpuCount', true),
		},
	};
}

export function remoteSessionHostRejections(host: IRemoteSessionHost, options: ICreateRemoteSessionOptions): string[] {
	const reasons: string[] = [];
	if (options.hostId !== undefined && options.hostId !== host.id) {
		return [localize('remoteSessions.hostIdMismatch', "Host ID does not match.")];
	}
	if (host.status !== 'connected') {
		return [localize('remoteSessions.hostNotConnected', "Host is {0}. Establish a connection before creating a remote session; its capabilities are not available yet.", host.status)];
	}
	if (host.supportsRemoteSessions === null) {
		return [localize('remoteSessions.capabilitiesPending', "Host capabilities have not been received yet. Wait for host discovery to finish before creating a remote session.")];
	}
	if (!host.supportsRemoteSessions) {
		reasons.push(localize('remoteSessions.delegationUnsupported', "Host does not support remote session delegation. Update the agent host."));
	}
	if (host.runningSessions === undefined) {
		reasons.push(localize('remoteSessions.workloadUnavailable', "Running-session count is not available yet."));
	}
	const { platform, minCpuCount, minMemoryGiB } = options.requirements;
	if (platform !== undefined && host.resources?.platform !== platform) {
		reasons.push(host.resources?.platform === undefined
			? localize('remoteSessions.platformUnknown', "Required platform {0}; host reports unknown.", platform)
			: localize('remoteSessions.platformMismatch', "Required platform {0}; host reports {1}.", platform, host.resources.platform));
	}
	if (minCpuCount !== undefined && (host.resources?.cpuCount === undefined || host.resources.cpuCount < minCpuCount)) {
		reasons.push(host.resources?.cpuCount === undefined
			? localize('remoteSessions.cpuCountUnknown', "Required {0} logical CPUs; host reports unknown.", minCpuCount)
			: localize('remoteSessions.insufficientCpuCount', "Required {0} logical CPUs; host reports {1}.", minCpuCount, host.resources.cpuCount));
	}
	if (minMemoryGiB !== undefined && (host.resources?.memoryBytes === undefined || host.resources.memoryBytes < minMemoryGiB * 1024 ** 3)) {
		reasons.push(host.resources?.memoryBytes === undefined
			? localize('remoteSessions.memoryUnknown', "Required {0} GiB of memory; host reports unknown.", minMemoryGiB)
			: localize('remoteSessions.insufficientMemory', "Required {0} GiB of memory; host reports {1} GiB.", minMemoryGiB, host.resources.memoryBytes / 1024 ** 3));
	}
	if (options.model !== undefined && !host.agents.some(agent => agent.provider === options.model?.provider && agent.models.some(model => model.id === options.model?.id))) {
		reasons.push(localize('remoteSessions.modelUnavailable', "Model {0}/{1} is not available.", options.model.provider, options.model.id));
	}
	if (!host.agents.length) {
		reasons.push(localize('remoteSessions.noAgents', "No usable agents have been advertised."));
	}
	return reasons;
}
