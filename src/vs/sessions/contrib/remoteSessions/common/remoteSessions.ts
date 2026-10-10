/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostResources } from '../../../../platform/agentHost/common/meta/agentHostResources.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';

export const RemoteSessionToolsEnabledSettingId = 'chat.remoteSessions.tools.enabled';

export const remoteSessionToolsWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
	ContextKeyExpr.equals(`config.${RemoteSessionToolsEnabledSettingId}`, true),
);

export function areRemoteSessionToolsEnabled(configurationService: IConfigurationService): boolean {
	return !configurationService.getValue<boolean>('chat.disableAIFeatures')
		&& configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) === true
		&& configurationService.getValue<boolean>(RemoteSessionToolsEnabledSettingId) === true;
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

export const IRemoteSessionService = createDecorator<IRemoteSessionService>('remoteSessionService');

export interface IRemoteSessionService {
	readonly _serviceBrand: undefined;
	listHosts(): readonly IRemoteSessionHost[];
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

export function parseCreateRemoteSessionOptions(value: unknown): ICreateRemoteSessionOptions {
	const input = readObject(value, ['prompt', 'title', 'hostId', 'model', 'requirements', 'workspace'], 'create_remote_session');
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
	const requirements: Record<string, unknown> = input.requirements === undefined ? {} : readObject(input.requirements, ['platform', 'minMemoryGiB', 'minCpuCount'], 'requirements');
	const platform = requirements.platform;
	if (platform !== undefined && platform !== 'windows' && platform !== 'linux' && platform !== 'macos') {
		throw new Error(localize('remoteSessions.invalidPlatform', "{0} must be {1}, {2}, or {3}.", 'requirements.platform', 'windows', 'linux', 'macos'));
	}
	let workspace: IRemoteSessionWorkspace | undefined;
	if (input.workspace !== undefined) {
		const raw = readObject(input.workspace, ['uri', 'isolation', 'branch'], 'workspace');
		const uri = URI.parse(readText(raw.uri, 'workspace.uri'), true);
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
