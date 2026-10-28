/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../base/common/types.js';
import type { IAgentSandboxUserConfiguredPaths } from '../../sandbox/common/settings.js';

export const SAVE_SANDBOX_PATH = 'save-sandbox-path';

/** The filesystem policy edit offered by the runtime on a pending sandbox escalation. */
export interface ISandboxPathGrant {
	readonly path: string;
	readonly access: 'read' | 'readWrite';
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
	result[key] = [...new Set([...(result[key] ?? []), grant.path])];
	return result;
}
