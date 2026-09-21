/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isUUID } from '../../../../../base/common/uuid.js';
import { parse, YamlParseError } from '../../../../../base/common/yaml.js';
import * as path from '../../../../../base/common/path.js';
import { localize } from '../../../../../nls.js';
import { INativeCliProxyModel } from '../../../../../platform/agentHost/common/nativeCliProxy.js';
import { INativeCliLifecycleConfiguration, NativeCliLifecycleKind, NATIVE_CLI_LIFECYCLE_PREFIX, sanitizeNativeCliTitle } from '../../../../../platform/agentHost/common/nativeCliLifecycle.js';
import { AgentHostClaudeAgentEnabledSettingId, AgentHostCodexAgentEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ISessionChangesSummary, ISessionType, ISessionWorkspace, SESSION_WORKSPACE_GROUP_LOCAL, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';

export const NATIVE_CLI_PROVIDER_ID = 'native-cli';
export const NATIVE_CLI_SESSION_SCHEME = 'native-cli-session';
export const NATIVE_CLI_STORAGE_KEY = 'sessions.nativeCli.sessions';
/** Administrator-manageable switch for the whole CLI terminal surface. */
export const NATIVE_CLI_ENABLED_SETTING = 'sessions.terminal.enabled';

/** Alias of the agent-host contract so the two layers cannot drift apart. */
export type NativeCliKind = NativeCliLifecycleKind;

/**
 * The setting whose policy governs a third-party harness, or `undefined` when the CLI
 * is first-party. Administrators who disable a harness must not be left with its CLI.
 */
export function getNativeCliEnablementSetting(kind: NativeCliKind): string | undefined {
	switch (kind) {
		case 'claude': return AgentHostClaudeAgentEnabledSettingId;
		case 'codex': return AgentHostCodexAgentEnabledSettingId;
		case 'copilot': return undefined;
	}
}

/** Honors the feature switch and the `Claude3PIntegration` / `Codex3PIntegration` policies. */
export function isNativeCliKindEnabled(kind: NativeCliKind, configurationService: IConfigurationService): boolean {
	if (configurationService.getValue<boolean>(NATIVE_CLI_ENABLED_SETTING) === false) {
		return false;
	}
	const setting = getNativeCliEnablementSetting(kind);
	return !setting || configurationService.getValue<boolean>(setting) !== false;
}

interface INativeCliDefinition {
	readonly kind: NativeCliKind;
	readonly sessionType: ISessionType;
	readonly executableSetting: string;
	readonly documentation: string;
}

export const nativeCliDefinitions: readonly INativeCliDefinition[] = [
	{
		kind: 'copilot',
		sessionType: { id: 'terminal-copilot', label: localize('copilotCli', "Copilot CLI"), icon: Codicon.copilot, presentation: 'terminal', authRequirement: SessionTypeAuthRequirement.None },
		executableSetting: 'sessions.terminal.copilotExecutable',
		documentation: 'https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli',
	},
	{
		kind: 'claude',
		sessionType: { id: 'terminal-claude', label: localize('claudeCode', "Claude Code"), icon: Codicon.claude, presentation: 'terminal', authRequirement: SessionTypeAuthRequirement.None },
		executableSetting: 'sessions.terminal.claudeExecutable',
		documentation: 'https://code.claude.com/docs/en/setup',
	},
	{
		kind: 'codex',
		sessionType: { id: 'terminal-codex', label: localize('codexCli', "Codex"), icon: Codicon.openai, presentation: 'terminal', authRequirement: SessionTypeAuthRequirement.None },
		executableSetting: 'sessions.terminal.codexExecutable',
		documentation: 'https://developers.openai.com/codex/cli/',
	},
];

export function getNativeCliDefinition(kind: string): INativeCliDefinition {
	const definition = nativeCliDefinitions.find(definition => definition.kind === kind);
	if (!definition) {
		throw new Error(`Unknown native CLI '${kind}'`);
	}
	return definition;
}

export function resolveNativeCliWorkspace(folder: URI): ISessionWorkspace | undefined {
	if (folder.scheme !== Schemas.file) {
		return undefined;
	}
	return {
		uri: folder,
		label: basename(folder) || folder.fsPath,
		description: dirname(folder).fsPath,
		group: SESSION_WORKSPACE_GROUP_LOCAL,
		icon: Codicon.folder,
		folders: [{ root: folder, workingDirectory: folder, name: basename(folder), description: undefined }],
		requiresWorkspaceTrust: true,
		isVirtualWorkspace: false,
	};
}

/** Only interactive flags are used; authentication, configuration and approvals belong to the CLI. */
export function getNativeCliArguments(kind: NativeCliKind, id: string, resume: boolean, nativeSessionId?: string): string[] {
	switch (kind) {
		case 'copilot':
			return ['--session-id', nativeSessionId ?? id];
		case 'claude':
			return resume ? ['--resume', nativeSessionId ?? id] : ['--session-id', nativeSessionId ?? id];
		case 'codex':
			return resume ? nativeSessionId ? ['resume', nativeSessionId] : ['resume'] : [];
	}
}

export function getNativeCliBundledExecutablePaths(kind: NativeCliKind, platform: 'win32' | 'darwin' | 'linux', arch: string): string[] {
	const binary = `${kind}${platform === 'win32' ? '.exe' : ''}`;
	switch (kind) {
		case 'copilot':
			return [`@github/copilot-${platform}-${arch}/${binary}`, ...(platform === 'linux' ? [`@github/copilot-linuxmusl-${arch}/${binary}`] : [])];
		case 'claude':
			return [`@anthropic-ai/claude-agent-sdk-${platform}-${arch}/${binary}`, ...(platform === 'linux' ? [`@anthropic-ai/claude-agent-sdk-linux-${arch}-musl/${binary}`] : [])];
		case 'codex': {
			const target = `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-${platform === 'win32' ? 'pc-windows-msvc' : platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-musl'}`;
			return [`@openai/codex-${platform}-${arch}/vendor/${target}/bin/${binary}`];
		}
	}
}

export interface IStoredNativeCliSession {
	readonly id: string;
	readonly kind: NativeCliKind;
	readonly folder: string;
	readonly title: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly isArchived: boolean;
	readonly isRead: boolean;
	readonly hasStarted: boolean;
	readonly titleIsUserDefined: boolean;
	readonly nativeSessionId?: string;
	readonly baseRef?: string;
	readonly changesSummary?: ISessionChangesSummary;
	readonly authentication?: 'native' | 'copilot';
	readonly copilotModel?: INativeCliProxyModel;
	readonly runtimeResource?: string | null;
	readonly lifecycleTimestamp?: number;
	readonly copilotForegroundTimestamp?: number;
	readonly hasPromptTitle?: boolean;
	readonly hasInteraction?: boolean;
}

export function isStoredNativeCliSession(value: unknown): value is IStoredNativeCliSession {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const entry = value as Partial<IStoredNativeCliSession>;
	const summary = entry.changesSummary;
	const model = entry.copilotModel;
	return typeof entry.id === 'string' && isUUID(entry.id)
		&& nativeCliDefinitions.some(definition => definition.kind === entry.kind)
		&& typeof entry.folder === 'string'
		&& typeof entry.title === 'string'
		&& typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
		&& typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
		&& typeof entry.isArchived === 'boolean'
		&& typeof entry.isRead === 'boolean'
		&& typeof entry.hasStarted === 'boolean'
		&& typeof entry.titleIsUserDefined === 'boolean'
		&& (entry.nativeSessionId === undefined || typeof entry.nativeSessionId === 'string' && isUUID(entry.nativeSessionId))
		&& (entry.baseRef === undefined || typeof entry.baseRef === 'string' && /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(entry.baseRef))
		&& (entry.authentication === undefined || entry.authentication === 'native' || entry.authentication === 'copilot')
		&& (model === undefined || !!model && typeof model === 'object' && typeof model.id === 'string' && model.id.length > 0 && typeof model.name === 'string')
		&& (entry.authentication !== 'copilot' || entry.kind !== 'copilot')
		&& (entry.runtimeResource === undefined || entry.runtimeResource === null || typeof entry.runtimeResource === 'string')
		&& (entry.lifecycleTimestamp === undefined || typeof entry.lifecycleTimestamp === 'number' && Number.isFinite(entry.lifecycleTimestamp))
		&& (entry.copilotForegroundTimestamp === undefined || typeof entry.copilotForegroundTimestamp === 'number' && Number.isFinite(entry.copilotForegroundTimestamp))
		&& (entry.hasPromptTitle === undefined || typeof entry.hasPromptTitle === 'boolean')
		&& (entry.hasInteraction === undefined || typeof entry.hasInteraction === 'boolean')
		&& (summary === undefined || summary !== null && typeof summary === 'object'
			&& [summary.files, summary.additions, summary.deletions].every(value => Number.isSafeInteger(value) && value >= 0));
}

export function readNativeCliTerminalData(data: unknown): { readonly resource: string; readonly leaseId?: string; readonly lifecycle?: INativeCliLifecycleConfiguration; readonly metadataHome?: string } | undefined {
	if (typeof data === 'string') {
		return { resource: data };
	}
	if (!data || typeof data !== 'object') {
		return undefined;
	}
	const value = data as { readonly resource?: string; readonly leaseId?: string; readonly lifecycle?: INativeCliLifecycleConfiguration; readonly metadataHome?: string };
	const lifecycle = value.lifecycle;
	return typeof value.resource === 'string' && (value.leaseId === undefined || typeof value.leaseId === 'string' && isUUID(value.leaseId))
		&& (lifecycle === undefined || !!lifecycle && typeof lifecycle === 'object' && typeof lifecycle.id === 'string' && isUUID(lifecycle.id)
			&& typeof lifecycle.directory === 'string' && path.isAbsolute(lifecycle.directory)
			&& path.basename(lifecycle.directory).startsWith(`${NATIVE_CLI_LIFECYCLE_PREFIX}${lifecycle.id}-`)
			&& lifecycle.eventsFile === path.join(lifecycle.directory, 'events.jsonl')
			&& (lifecycle.logsDirectory === undefined || lifecycle.logsDirectory === path.join(lifecycle.directory, 'logs'))
			&& Array.isArray(lifecycle.args) && lifecycle.args.every(argument => typeof argument === 'string'))
		&& (value.metadataHome === undefined || typeof value.metadataHome === 'string')
		? { resource: value.resource, leaseId: value.leaseId, lifecycle, metadataHome: value.metadataHome }
		: undefined;
}

export function readNativeCopilotForeground(line: string): { sessionId: string; timestamp: number } | undefined {
	const match = /^(?<timestamp>\d{4}-\d{2}-\d{2}T[\d:.]+Z) \[INFO\] Registering foreground session: (?<sessionId>[0-9a-f-]+)\r?$/i.exec(line);
	if (!match?.groups || !isUUID(match.groups.sessionId)) {
		return undefined;
	}
	const timestamp = Date.parse(match.groups.timestamp);
	if (!Number.isFinite(timestamp)) {
		// The pattern admits impossible dates; a corrupt line is "not a foreground record",
		// exactly like every other unmatched line.
		return undefined;
	}
	return { sessionId: match.groups.sessionId, timestamp };
}

export function readNativeCopilotMetadata(content: string): { id: string; cwd: string; title: string | undefined } {
	const errors: YamlParseError[] = [];
	const value = parse(content, errors);
	if (errors.length || value?.type !== 'map') {
		throw new Error('Invalid native Copilot session metadata');
	}
	const scalar = (key: string) => {
		const node = value.properties.find(property => property.key.value === key)?.value;
		return node?.type === 'scalar' ? node.value : undefined;
	};
	const id = scalar('id');
	const cwd = scalar('cwd');
	if (!id || !isUUID(id) || !cwd || !path.isAbsolute(cwd)) {
		throw new Error('Invalid native Copilot session identity or directory');
	}
	const rawTitle = scalar('name');
	const title = rawTitle === undefined ? undefined : sanitizeNativeCliTitle(rawTitle);
	return { id, cwd, title: title || undefined };
}
