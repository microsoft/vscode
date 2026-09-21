/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { isUUID } from '../../../base/common/uuid.js';
import { isAbsolute } from '../../../base/common/path.js';

export type NativeCliLifecycleKind = 'copilot' | 'claude' | 'codex';
export type NativeCliActivity = 'idle' | 'working' | 'input' | 'error';

/** Prefix of the temporary directory backing one tracked CLI launch. */
export const NATIVE_CLI_LIFECYCLE_PREFIX = 'vscode-cli-lifecycle-';

/** Upper bound on a CLI-supplied title, enforced by both producers and the validator. */
export const MAX_NATIVE_CLI_TITLE_LENGTH = 160;

export const NATIVE_CLI_LIFECYCLE_EVENTS = ['start', 'prompt', 'stop', 'input', 'end', 'title', 'activity'] as const;
export const NATIVE_CLI_ACTIVITIES = ['idle', 'working', 'input', 'error'] as const;

/**
 * Collapses control characters and whitespace and applies the shared length cap, so a
 * producer can never emit a title that the validator would reject.
 */
export function sanitizeNativeCliTitle(title: string): string {
	return title.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NATIVE_CLI_TITLE_LENGTH);
}

/** Metadata emitted by a lifecycle hook in one native terminal, never a transcript. */
export interface INativeCliLifecycleEvent {
	readonly sessionId: string;
	readonly event: 'start' | 'prompt' | 'stop' | 'input' | 'end' | 'title' | 'activity';
	readonly cwd: string;
	readonly title?: string;
	readonly timestamp: number;
	readonly activity?: NativeCliActivity;
	readonly pid?: number;
	readonly source?: string;
	readonly cwdConfirmed?: boolean;
}

export interface INativeCliLifecycleConfiguration {
	readonly id: string;
	readonly directory: string;
	readonly eventsFile: string;
	readonly logsDirectory?: string;
	readonly args: readonly string[];
	readonly env?: Readonly<Record<string, string>>;
	readonly replaceArgs?: boolean;
}

export interface INativeCliLifecycleLaunch {
	readonly executable: string;
	readonly cwd: string;
	readonly args: readonly string[];
	readonly env: Readonly<Record<string, string | undefined | null>>;
}

export const INativeCliLifecycleService = createDecorator<INativeCliLifecycleService>('nativeCliLifecycleService');

/**
 * Per-launch local lifecycle tracking: observer files for Claude and Copilot, or for Codex
 * a spawned app-server behind a loopback bridge. Always paired with
 * {@link INativeCliLifecycleService.releaseNativeCliLifecycle}, which also removes the
 * temporary directory.
 */
export interface INativeCliLifecycleService {
	readonly _serviceBrand: undefined;
	/** Removes every temporary directory this service still owns. */
	releaseNativeCliResources(): void;
	/** `launch` is required for `codex`, which starts a backing process. */
	createNativeCliLifecycle(kind: NativeCliLifecycleKind, execPath: string, launch?: INativeCliLifecycleLaunch): Promise<INativeCliLifecycleConfiguration>;
	releaseNativeCliLifecycle(id: string): Promise<void>;
}

export function isNativeCliLifecycleEvent(value: unknown): value is INativeCliLifecycleEvent {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const event = value as Partial<INativeCliLifecycleEvent>;
	return typeof event.sessionId === 'string' && isUUID(event.sessionId)
		&& (NATIVE_CLI_LIFECYCLE_EVENTS as readonly string[]).includes(event.event ?? '')
		&& typeof event.cwd === 'string' && isAbsolute(event.cwd)
		&& typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)
		&& (event.title === undefined || typeof event.title === 'string' && event.title.length <= MAX_NATIVE_CLI_TITLE_LENGTH)
		&& (event.activity === undefined || (NATIVE_CLI_ACTIVITIES as readonly string[]).includes(event.activity))
		&& (event.pid === undefined || Number.isSafeInteger(event.pid) && event.pid > 0)
		&& (event.source === undefined || typeof event.source === 'string')
		&& (event.cwdConfirmed === undefined || typeof event.cwdConfirmed === 'boolean');
}
