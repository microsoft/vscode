/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';

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
 * Fire-and-forget persistence of a single session-metadata key/value pair to a
 * session's database. Opens the database, writes the value, and disposes the
 * handle; failures are logged, not thrown. Updaters run atomically against the stored value.
 *
 * Used for host-owned fields that must survive restart (custom titles, isRead /
 * isArchived flags, merged config values, …). Shared so callers do not each
 * re-implement the open/write/dispose dance.
 */
export function persistSessionMetadata(sessionDataService: ISessionDataService, logService: ILogService, session: string, key: string, value: string | ((previous: string | undefined) => string)): void {
	const onError = (err: unknown) => {
		logService.warn(`[AgentHost] Failed to persist session metadata '${key}'`, err);
	};
	try {
		const ref = sessionDataService.openDatabase(URI.parse(session));
		const write = typeof value === 'string' ? ref.object.setMetadata(key, value) : ref.object.updateMetadata(key, value);
		write.catch(onError).finally(() => {
			ref.dispose();
		});
	} catch (err) {
		onError(err);
	}
}

/** Persists multiple metadata values before returning and propagates write failures. */
export async function persistSessionMetadataValues(sessionDataService: ISessionDataService, session: string, values: Readonly<Record<string, string>>): Promise<void> {
	const ref = sessionDataService.openDatabase(URI.parse(session));
	try {
		await ref.object.setMetadataValues(values);
	} finally {
		ref.dispose();
	}
}
