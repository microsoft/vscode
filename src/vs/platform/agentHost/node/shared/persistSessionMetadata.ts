/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { type IAgentHostSessionStateStore, SessionStateMirrorFlush } from '../../common/agentHostSessionStateStore.js';

export const SESSION_CUSTOM_TITLE_KEY = 'customTitle';
export const SESSION_CUSTOM_TITLE_SOURCE_KEY = 'customTitleSource';
export const SESSION_ARTIFACTS_KEY = 'sessionArtifacts';
export const SESSION_WORKING_DIRECTORIES_KEY = 'agentHost.sessionWorkingDirectories';
export const AGENT_HOST_TITLE_SOURCE_USER = 'user';
export const AGENT_HOST_TITLE_SOURCE_AGENT = 'agent';
export const AGENT_HOST_TITLE_SOURCE_AUTO = 'auto';

export type AgentHostTitleSource =
	| typeof AGENT_HOST_TITLE_SOURCE_USER
	| typeof AGENT_HOST_TITLE_SOURCE_AGENT
	| typeof AGENT_HOST_TITLE_SOURCE_AUTO;

/** Reads host-owned aggregate roots independently of a provider's default-chat cwd. */
export function parseSessionWorkingDirectories(value: string | undefined): readonly string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	const directories: unknown = JSON.parse(value);
	if (!Array.isArray(directories) || !directories.every(directory => typeof directory === 'string' && URI.parse(directory, true).scheme.length > 0)) {
		throw new Error('Invalid persisted session working directories');
	}
	return directories;
}

export function customChatTitleMetadataKey(chat: string): string {
	return `customChatTitle:${chat}`;
}

export function customChatTitleSourceMetadataKey(chat: string): string {
	return `customChatTitleSource:${chat}`;
}

/**
 * Fire-and-forget persistence of a single session-metadata key/value pair
 * through the session state store. Failures are logged, not thrown. Updaters
 * run atomically against the stored value.
 *
 * Used for host-owned fields that must survive restart (isRead / isArchived
 * flags, merged config values, …). Shared so callers do not each re-implement
 * the write.
 */
export function persistSessionMetadata(stateStore: IAgentHostSessionStateStore, logService: ILogService, session: string, key: string, value: string | ((previous: string | undefined) => string)): void {
	const write = typeof value === 'string'
		? stateStore.writeMetadata(URI.parse(session), URI.parse(session), { [key]: value }, SessionStateMirrorFlush.Immediate)
		: stateStore.update(URI.parse(session), key, value, SessionStateMirrorFlush.Immediate);
	write.catch(err => logService.warn(`[AgentHost] Failed to persist session metadata '${key}'`, err));
}

/** Persists several metadata values in one write without waiting for it; failures are logged. */
export function persistSessionMetadataValuesInBackground(stateStore: IAgentHostSessionStateStore, logService: ILogService, session: string, values: Readonly<Record<string, string>>): void {
	stateStore.writeMetadata(URI.parse(session), URI.parse(session), values, SessionStateMirrorFlush.Immediate)
		.catch(err => logService.warn(`[AgentHost] Failed to persist session metadata '${Object.keys(values).join(', ')}'`, err));
}

/** Persists multiple metadata values before returning and propagates write failures. */
export async function persistSessionMetadataValues(stateStore: IAgentHostSessionStateStore, session: string, values: Readonly<Record<string, string>>): Promise<void> {
	await stateStore.writeMetadata(URI.parse(session), URI.parse(session), values, SessionStateMirrorFlush.Immediate);
}
