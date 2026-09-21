/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
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
		throw new Error(`${label} must be an object.`);
	}
	for (const key of Object.keys(value)) {
		if (!fields.includes(key)) {
			throw new Error(`Unknown ${label} property "${key}".`);
		}
	}
	return value as Record<string, unknown>;
}

function readText(value: unknown, label: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

function readMinimum(value: unknown, label: string, integer: boolean): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (integer && !Number.isSafeInteger(value))) {
		throw new Error(`${label} must be a positive ${integer ? 'integer' : 'number'}.`);
	}
	return value;
}

export function parseCreateRemoteSessionOptions(value: unknown): ICreateRemoteSessionOptions {
	const input = readObject(value, ['prompt', 'title', 'hostId', 'model', 'requirements', 'workspace'], 'create_remote_session');
	const prompt = readText(input.prompt, 'prompt');
	const title = input.title === undefined ? undefined : readText(input.title, 'title');
	if (title !== undefined && Array.from(title).length > 200) {
		throw new Error('title must not exceed 200 characters.');
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
		throw new Error('requirements.platform must be windows, linux, or macos.');
	}
	let workspace: IRemoteSessionWorkspace | undefined;
	if (input.workspace !== undefined) {
		const raw = readObject(input.workspace, ['uri', 'isolation', 'branch'], 'workspace');
		const uri = URI.parse(readText(raw.uri, 'workspace.uri'), true);
		const directory = fromAgentHostUri(uri);
		if ((uri.scheme !== Schemas.file && uri.scheme !== AGENT_HOST_SCHEME)
			|| directory.scheme !== Schemas.file || !directory.path.startsWith('/') || directory.path === '/'
			|| directory.query || directory.fragment || (uri.scheme === AGENT_HOST_SCHEME && !uri.authority)) {
			throw new Error('workspace.uri must identify an absolute folder using a file URI or a remote workspace URI from list_agent_hosts.');
		}
		const isolation = raw.isolation ?? 'worktree';
		if (isolation !== 'folder' && isolation !== 'worktree') {
			throw new Error('workspace.isolation must be folder or worktree.');
		}
		const branch = raw.branch === undefined ? undefined : readText(raw.branch, 'workspace.branch');
		if (branch !== undefined && isolation !== 'worktree') {
			throw new Error('workspace.branch requires worktree isolation; an existing checkout is never switched to another branch.');
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
		return ['Host ID does not match.'];
	}
	if (host.status !== 'connected') {
		return [`Host is ${host.status}. Establish a connection before creating a remote session; its capabilities are not available yet.`];
	}
	if (host.supportsRemoteSessions === null) {
		return ['Host capabilities have not been received yet. Wait for host discovery to finish before creating a remote session.'];
	}
	if (!host.supportsRemoteSessions) {
		reasons.push('Host does not support remote session delegation. Update the agent host.');
	}
	if (host.runningSessions === undefined) {
		reasons.push('Running-session count is not available yet.');
	}
	const { platform, minCpuCount, minMemoryGiB } = options.requirements;
	if (platform !== undefined && host.resources?.platform !== platform) {
		reasons.push(`Required platform ${platform}; host reports ${host.resources?.platform ?? 'unknown'}.`);
	}
	if (minCpuCount !== undefined && (host.resources?.cpuCount === undefined || host.resources.cpuCount < minCpuCount)) {
		reasons.push(`Required ${minCpuCount} logical CPUs; host reports ${host.resources?.cpuCount ?? 'unknown'}.`);
	}
	if (minMemoryGiB !== undefined && (host.resources?.memoryBytes === undefined || host.resources.memoryBytes < minMemoryGiB * 1024 ** 3)) {
		reasons.push(`Required ${minMemoryGiB} GiB of memory; host reports ${host.resources?.memoryBytes === undefined ? 'unknown' : `${host.resources.memoryBytes / 1024 ** 3} GiB`}.`);
	}
	if (options.model !== undefined && !host.agents.some(agent => agent.provider === options.model?.provider && agent.models.some(model => model.id === options.model?.id))) {
		reasons.push(`Model ${options.model.provider}/${options.model.id} is not available.`);
	}
	if (!host.agents.length) {
		reasons.push('No usable agents have been advertised.');
	}
	return reasons;
}
