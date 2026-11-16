/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../base/common/types.js';
import { OperatingSystem } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { normalizeSandboxFileSystemPath, type IAgentSandboxUserConfiguredPaths } from '../../sandbox/common/settings.js';

export const SAVE_SANDBOX_PATH = 'save-sandbox-path';
export const SAVE_SESSION_SANDBOX_PATH = 'save-session-sandbox-path';
export const SAVE_WORKSPACE_SANDBOX_PATH = 'save-workspace-sandbox-path';
export const SESSION_SANDBOX_PATHS_CHANGED = 'sandboxPaths';
export const SESSION_SANDBOX_PATHS_KEY = 'agentHost.sandboxPaths';

/** Personal filesystem additions and exact read-only upgrades owned by one session. */
export interface ISessionSandboxPaths {
	readonly readonlyPaths: readonly string[];
	readonly readwritePaths: readonly string[];
	readonly removedReadonlyPaths: readonly string[];
}

/** The filesystem policy edit offered by the runtime on a pending sandbox escalation. */
export interface ISandboxPathGrant {
	readonly path: string;
	readonly access: 'read' | 'readWrite';
	readonly persistedPath?: string;
	readonly deniedPath?: string;
	readonly removedReadonlyPaths?: readonly string[];
}

export function isSandboxPathGrant(value: unknown): value is ISandboxPathGrant {
	if (!isObject(value) || Array.isArray(value)) {
		return false;
	}
	const grant = value as Partial<ISandboxPathGrant>;
	return typeof grant.path === 'string' && grant.path.length > 0
		&& (grant.access === 'read' || grant.access === 'readWrite')
		&& (grant.persistedPath === undefined || typeof grant.persistedPath === 'string' && grant.persistedPath.length > 0)
		&& (grant.deniedPath === undefined || typeof grant.deniedPath === 'string')
		&& (grant.removedReadonlyPaths === undefined || Array.isArray(grant.removedReadonlyPaths)
			&& grant.removedReadonlyPaths.every(path => typeof path === 'string'));
}

/** Applies only the list edits in an offered grant, preserving unrelated settings. */
export function applySandboxPathGrant(paths: IAgentSandboxUserConfiguredPaths | undefined, grant: ISandboxPathGrant): IAgentSandboxUserConfiguredPaths {
	const result = { ...paths };
	const removed = new Set(grant.removedReadonlyPaths);
	if (result.readonlyPaths) {
		result.readonlyPaths = result.readonlyPaths.filter(path => !removed.has(path));
	}
	const key = grant.access === 'read' ? 'readonlyPaths' : 'readwritePaths';
	result[key] = [...new Set([...(result[key] ?? []), grant.persistedPath ?? grant.path.replace(/\$/g, () => '$$')])];
	return result;
}

export function parseSessionSandboxPaths(raw: string | undefined): ISessionSandboxPaths {
	if (raw === undefined) {
		return { readonlyPaths: [], readwritePaths: [], removedReadonlyPaths: [] };
	}
	const value: unknown = JSON.parse(raw);
	const paths = isObject(value) ? value as Partial<ISessionSandboxPaths> : undefined;
	if (!paths || !Array.isArray(paths.readonlyPaths) || !paths.readonlyPaths.every(path => typeof path === 'string')
		|| !Array.isArray(paths.readwritePaths) || !paths.readwritePaths.every(path => typeof path === 'string')
		|| !Array.isArray(paths.removedReadonlyPaths) || !paths.removedReadonlyPaths.every(path => typeof path === 'string')) {
		throw new Error(localize('invalidSessionSandboxPaths', "Invalid persisted session sandbox paths"));
	}
	return { readonlyPaths: paths.readonlyPaths, readwritePaths: paths.readwritePaths, removedReadonlyPaths: paths.removedReadonlyPaths };
}

export function applySessionSandboxPathGrant(current: ISessionSandboxPaths, grant: ISandboxPathGrant): ISessionSandboxPaths {
	const paths = applySandboxPathGrant({ readonlyPaths: [...current.readonlyPaths], readwritePaths: [...current.readwritePaths] }, grant);
	return {
		readonlyPaths: paths.readonlyPaths ?? [],
		readwritePaths: paths.readwritePaths ?? [],
		removedReadonlyPaths: [...new Set([...current.removedReadonlyPaths, ...grant.removedReadonlyPaths ?? []])],
	};
}

/** Removes exact personal read-only additions without changing inherited-path masks or writable grants. */
export function removeSandboxReadonlyPaths(current: ISessionSandboxPaths, paths: readonly string[], os: OperatingSystem): ISessionSandboxPaths {
	const removed = new Set(paths.map(path => normalizeSandboxFileSystemPath(path, os)));
	const readonlyPaths = current.readonlyPaths.filter(path => !removed.has(normalizeSandboxFileSystemPath(path, os)));
	return readonlyPaths.length === current.readonlyPaths.length ? current : { ...current, readonlyPaths };
}

/** Composes personal grants before managed lists are applied by the sandbox settings resolver. */
export function resolveSessionSandboxPaths(paths: IAgentSandboxUserConfiguredPaths | undefined, session: ISessionSandboxPaths, os: OperatingSystem): IAgentSandboxUserConfiguredPaths {
	const removed = new Set(session.removedReadonlyPaths.map(path => normalizeSandboxFileSystemPath(path, os)));
	return {
		...paths,
		readonlyPaths: [...new Set([...(paths?.readonlyPaths ?? []), ...session.readonlyPaths])]
			.filter(path => !removed.has(normalizeSandboxFileSystemPath(path, os))),
		readwritePaths: [...new Set([...(paths?.readwritePaths ?? []), ...session.readwritePaths])],
	};
}
